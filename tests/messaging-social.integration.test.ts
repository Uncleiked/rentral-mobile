import { randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import prisma from '@/lib/db'
import { localMongoDatabaseName, localMongoUrl } from '@/lib/database/config'
import { ensureMongoIndexes } from '@/lib/database/indexes'
import { closeMongoReadiness } from '@/lib/database/readiness'
import { beginDirectConversation, acceptDirectConversation, readDirectStart, readConversationAcceptance } from '@/lib/messaging/direct'
import { beginConversation, getThread, persistMessage, markConversationRead } from '@/lib/messaging/service'
import { getConversationInboxPage } from '@/lib/messaging/inbox'
import { getConversationActivity, setConversationActivity } from '@/lib/messaging/activity'
import { messageInboxQuerySchema, messageThreadSchema } from '@/lib/contracts/messaging'
import { setFollowing, setBlocked, setListingLike, getListingLike } from '@/lib/social/service'
import { searchPeople, getConnections } from '@/lib/social/people'

const uri = process.env.RENTRAL_TEST_MONGO_URI
const owner = process.env.RENTRAL_TEST_MONGO_OWNER
const fixture = describe.skipIf(!uri)

fixture('owned isolated social messaging', () => {
  let client: MongoClient
  beforeAll(async () => {
    if (!uri || !owner || !/^[a-f0-9]{32}$/.test(owner) || localMongoDatabaseName(uri) !== `rentral_test_${owner}` || process.env.MONGODB_URL !== uri || process.env.DATABASE_URL !== uri) throw new Error('Use an owned loopback MongoDB fixture; never the application database.')
    client = new MongoClient(localMongoUrl(uri), { serverSelectionTimeoutMS: 3000 })
    await client.connect()
    const db = client.db(localMongoDatabaseName(uri))
    const existing = await db.listCollections({}, { nameOnly: true }).toArray()
    const marker = await db.collection<{ _id: string }>('_FixtureOwnership').findOne({ _id: owner })
    if (!marker && existing.length) throw new Error('The fixture database has no matching ownership marker.')
    if (!marker) await db.collection<{ _id: string }>('_FixtureOwnership').insertOne({ _id: owner })
    await ensureMongoIndexes(db)
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  }, 20000)
  afterAll(async () => { await prisma.$disconnect(); await closeMongoReadiness(); await client?.close(); vi.unstubAllEnvs() })
  async function person() {
    const id = randomUUID()
    return prisma.user.create({ data: { id, email: `${id}@fixture.invalid`, username: 'fixture_' + id.replaceAll('-', '').slice(0, 14), account_type: 'individual' } })
  }
  const inbox = (actor: string, folder: 'primary' | 'requests' | 'sent', cursor?: string) => getConversationInboxPage(actor, messageInboxQuerySchema.parse({ folder, limit: 1, ...(cursor ? { cursor } : {}) }))

  it('deduplicates concurrent symmetric room starts and exact invitation retries', async () => {
    const a = await person(), b = await person(), clientId = randomUUID()
    const command = { recipientId: b.id, clientId }
    const [first, retry, reverse] = await Promise.all([beginDirectConversation(a.id, command), beginDirectConversation(a.id, command), beginDirectConversation(b.id, { recipientId: a.id, clientId: randomUUID() })])
    expect(first).toBe(retry); expect(first).toBe(reverse)
    expect(await prisma.conversation.count({ where: { kind: 'direct', OR: [{ seeker_id: a.id, lister_id: b.id }, { seeker_id: b.id, lister_id: a.id }] } })).toBe(1)
    expect(await readDirectStart(a.id, command)).toBe(first)
    const actual = await prisma.conversation.findUniqueOrThrow({ where: { id: first } })
    const sender = actual.initiated_by!, recipient = sender === a.id ? b.id : a.id
    const input = { conversationId: first, clientId: randomUUID(), body: 'Owned fixture invitation.' }
    const stored = await Promise.all([persistMessage(sender, input), persistMessage(sender, input)])
    expect(stored[0]).toBe(stored[1]); expect(await prisma.message.count({ where: { conversation_id: first } })).toBe(1)
    expect(await prisma.notification.count({ where: { user_id: recipient, kind: 'message_request', href: `/marketplace/messages?id=${first}` } })).toBe(1)
    expect((await inbox(recipient, 'requests')).items[0]).toMatchObject({ id: first, requestIncoming: true, canAccept: true, canSend: false, listingId: null })
    expect((await inbox(sender, 'sent')).items[0]).toMatchObject({ id: first, canSend: false })
  }, 30000)

  it('requires recipient consent, keeps requests private and records acceptance once', async () => {
    const a = await person(), b = await person(), id = await beginDirectConversation(a.id, { recipientId: b.id, clientId: randomUUID() })
    await persistMessage(a.id, { conversationId: id, clientId: randomUUID(), body: 'Please review this request.' })
    await expect(persistMessage(a.id, { conversationId: id, clientId: randomUUID(), body: 'An unwanted second invitation.' })).rejects.toMatchObject({ code: 'REQUEST_PENDING' })
    await expect(persistMessage(b.id, { conversationId: id, clientId: randomUUID(), body: 'Reply before accepting.' })).rejects.toMatchObject({ code: 'REQUEST_PENDING' })
    await expect(acceptDirectConversation(a.id, id, { clientId: randomUUID() })).rejects.toMatchObject({ code: 'RECIPIENT_REQUIRED' })
    expect(await markConversationRead(b.id, id)).toBe(false)
    expect(await getConversationActivity(a.id, id)).toMatchObject({ otherOnline: false, otherTyping: false, otherReadAt: null })
    await expect(setConversationActivity(a.id, id, true)).rejects.toMatchObject({ code: 'REQUEST_PENDING' })
    const command = { clientId: randomUUID() }
    expect(await Promise.all([acceptDirectConversation(b.id, id, command), acceptDirectConversation(b.id, id, command)])).toEqual([id, id])
    expect(await readConversationAcceptance(b.id, id, command)).toBe(id)
    expect(await prisma.notification.count({ where: { user_id: a.id, kind: 'message_request_accepted', href: `/marketplace/messages?id=${id}` } })).toBe(1)
    expect((await inbox(b.id, 'requests')).items).toEqual([])
    expect((await inbox(a.id, 'primary')).items[0]?.id).toBe(id)
    await persistMessage(b.id, { conversationId: id, clientId: randomUUID(), body: 'Accepted reply.' })
    expect(await markConversationRead(a.id, id)).toBe(true)
    await setConversationActivity(a.id, id, true)
    expect(await getConversationActivity(b.id, id)).toMatchObject({ otherOnline: true, otherTyping: true })
    messageThreadSchema.parse(await getThread(a.id, id))
  }, 30000)

  it('moves an existing request to Primary on followback and keeps that consent after an unfollow', async () => {
    const a = await person(), b = await person(), id = await beginDirectConversation(a.id, { recipientId: b.id, clientId: randomUUID() })
    await persistMessage(a.id, { conversationId: id, clientId: randomUUID(), body: 'An existing request before followback.' })
    await setFollowing(a.id, b.id, { clientId: randomUUID(), following: true })
    expect((await inbox(b.id, 'requests')).items[0]?.id).toBe(id)
    await setFollowing(b.id, a.id, { clientId: randomUUID(), following: true })
    expect((await inbox(b.id, 'primary')).items[0]?.id).toBe(id)
    await setFollowing(b.id, a.id, { clientId: randomUUID(), following: false })
    expect(await getThread(a.id, id)).toMatchObject({ folder: 'primary', canSend: true })
  }, 30000)

  it('preserves mutual-follow acceptance across an unfollow and blocks further communication', async () => {
    const a = await person(), b = await person()
    await setFollowing(a.id, b.id, { clientId: randomUUID(), following: true })
    await setFollowing(b.id, a.id, { clientId: randomUUID(), following: true })
    const id = await beginDirectConversation(a.id, { recipientId: b.id, clientId: randomUUID() })
    await setFollowing(a.id, b.id, { clientId: randomUUID(), following: false })
    expect(await getThread(a.id, id)).toMatchObject({ folder: 'primary', canSend: true })
    const listing = await prisma.listing.create({ data: { lister_id: b.id, category: 'house', listing_status: 'active' } })
    const business = await beginConversation(a.id, listing.id)
    await persistMessage(a.id, { conversationId: business, clientId: randomUUID(), body: 'Existing booking context.' })
    await setBlocked(b.id, a.id, { clientId: randomUUID(), blocked: true })
    expect(await getThread(a.id, id)).toBeNull()
    expect((await inbox(a.id, 'primary')).items.every(row => row.id !== id)).toBe(true)
    expect(await getThread(a.id, business)).toMatchObject({ kind: 'listing', canSend: false })
    expect(await getConversationActivity(a.id, business)).toMatchObject({ otherOnline: false, otherTyping: false })
    await expect(persistMessage(a.id, { conversationId: business, clientId: randomUUID(), body: 'Blocked follow-up.' })).rejects.toMatchObject({ status: 404 })
    await expect(beginDirectConversation(a.id, { recipientId: b.id, clientId: randomUUID() })).rejects.toMatchObject({ status: 404 })
  }, 30000)

  it('persists public engagement and private saves with scoped member discovery and blocked-listing protection', async () => {
    const a = await person(), b = await person()
    const listing = await prisma.listing.create({ data: { lister_id: b.id, category: 'car', listing_status: 'active', base_rent_amount: 50000, media_source: 'recorded' } })
    const follow = { clientId: randomUUID(), following: true }
    await setFollowing(a.id, b.id, follow)
    await setFollowing(a.id, b.id, follow)
    const directory = await searchPeople(a.id, { query: '@' + b.username!.slice(0, -1), limit: 5 })
    expect(directory.items.map(row => row.id)).toContain(b.id)
    const publicPerson = directory.items.find(row => row.id === b.id)!
    expect(publicPerson).toMatchObject({ following: true, followersCount: 1 })
    expect(publicPerson).not.toHaveProperty('email')
    expect(publicPerson).not.toHaveProperty('password_hash')
    const connections = await getConnections(b.id, b.id, { kind: 'followers', limit: 1 })
    expect(connections.items.map(row => row.id)).toEqual([a.id])
    expect(connections.hasMore).toBe(false)
    expect(await prisma.notification.count({ where: { user_id: b.id, kind: 'social_follow' } })).toBe(1)

    const like = { clientId: randomUUID(), liked: true }
    const likes = await Promise.all([setListingLike(a.id, listing.id, like), setListingLike(a.id, listing.id, like)])
    expect(likes).toEqual([{ listingId: listing.id, liked: true, count: 1 }, { listingId: listing.id, liked: true, count: 1 }])
    expect(await prisma.listingLike.count({ where: { user_id: a.id, listing_id: listing.id, active: true } })).toBe(1)
    expect(await prisma.notification.count({ where: { user_id: b.id, kind: 'social_like' } })).toBe(1)
    await setListingLike(a.id, listing.id, { clientId: randomUUID(), liked: false })
    expect(await getListingLike(a.id, listing.id)).toEqual({ listingId: listing.id, liked: false, count: 0 })
    const beforeSave = await prisma.notification.count({ where: { user_id: b.id } })
    await prisma.savedListing.create({ data: { user_id: a.id, listing_id: listing.id } })
    expect(await prisma.savedListing.count({ where: { user_id: a.id, listing_id: listing.id } })).toBe(1)
    expect(await prisma.notification.count({ where: { user_id: b.id } })).toBe(beforeSave)

    const draft = await prisma.listing.create({ data: { lister_id: b.id, category: 'car', listing_status: 'draft' } })
    await expect(setListingLike(a.id, draft.id, { clientId: randomUUID(), liked: true })).rejects.toMatchObject({ status: 404 })
    await setBlocked(a.id, b.id, { clientId: randomUUID(), blocked: true })
    await expect(setListingLike(a.id, listing.id, { clientId: randomUUID(), liked: true })).rejects.toMatchObject({ status: 404 })
    expect((await searchPeople(a.id, { query: b.username! })).items).toEqual([])
    expect(await prisma.listingLike.count({ where: { listing_id: draft.id } })).toBe(0)
  }, 15000)

  it('finds old Requests beyond many newer Primary rows and pages them without duplicates', async () => {
    const a = await person(), b = await person(), c = await person()
    const oldest = await beginDirectConversation(a.id, { recipientId: b.id, clientId: randomUUID() })
    const newest = await beginDirectConversation(c.id, { recipientId: b.id, clientId: randomUUID() })
    await persistMessage(a.id, { conversationId: oldest, clientId: randomUUID(), body: 'Older pending request.' })
    await persistMessage(c.id, { conversationId: newest, clientId: randomUUID(), body: 'Newer pending request.' })
    await prisma.conversation.update({ where: { id: oldest }, data: { updatedAt: new Date('2020-01-01T00:00:00Z') } })
    await prisma.conversation.update({ where: { id: newest }, data: { updatedAt: new Date('2020-01-02T00:00:00Z') } })
    // Inactive follow records must not accidentally make these requests Primary.
    await setFollowing(b.id, a.id, { clientId: randomUUID(), following: false })
    const listings = Array.from({ length: 55 }, () => ({ id: randomUUID(), lister_id: b.id, category: 'house', listing_status: 'active' }))
    await prisma.listing.createMany({ data: listings })
    await prisma.conversation.createMany({ data: listings.map(row => ({ listing_id: row.id, seeker_id: a.id, lister_id: b.id })) })
    const first = await inbox(b.id, 'requests')
    expect(first.items.map(row => row.id)).toEqual([newest]); expect(first.nextCursor).not.toBeNull()
    const second = await inbox(b.id, 'requests', first.nextCursor!)
    expect(second.items.map(row => row.id)).toEqual([oldest]); expect(second.nextCursor).toBeNull()
  }, 30000)
})

