import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const store = vi.hoisted(() => ({ follows: new Map(), blocks: new Map(), likes: new Map(), receipts: new Map(), users: new Map() }))
const mocks = vi.hoisted(() => ({ ready: vi.fn(), active: vi.fn(), lock: vi.fn(), userOne: vi.fn(), userFirst: vi.fn(), userMany: vi.fn(), followOne: vi.fn(), followFirst: vi.fn(), followCount: vi.fn(), followUpsert: vi.fn(), followUpdate: vi.fn(), blockOne: vi.fn(), blockFirst: vi.fn(), blockMany: vi.fn(), blockUpsert: vi.fn(), likeOne: vi.fn(), likeCount: vi.fn(), likeUpsert: vi.fn(), listing: vi.fn(), notify: vi.fn(), threads: vi.fn(), activityDelete: vi.fn(), acceptRequests: vi.fn(), receiptOne: vi.fn(), receiptCreate: vi.fn(), savedUpsert: vi.fn(), gallery: vi.fn() }))
const tx = vi.hoisted(() => ({}))
const phase = vi.hoisted(() => ({ insideTransaction: false, completedTransactions: 0 }))
vi.mock('@/lib/db', () => ({ default: tx }))
vi.mock('@/lib/database/readiness', () => ({ assertSocialReady: mocks.ready }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: async (work: (db: unknown) => Promise<unknown>) => { phase.insideTransaction = true; try { return await work(tx) } finally { phase.insideTransaction = false; phase.completedTransactions += 1 } }, lockRecord: mocks.lock }))
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: mocks.active }))
vi.mock('@/lib/listings/gallery', async original => ({ ...await original<typeof import('@/lib/listings/gallery')>(), assertGalleryListingCurrent: mocks.gallery }))
import { getListingLike, getOwnBlockState, setBlocked, setFollowing, setListingLike } from '@/lib/social/service'
import { getPerson, searchPeople } from '@/lib/social/people'
import { areSociallyBlocked, areUsersMutualFollowers, socialEdgeId } from '@/lib/social/relationships'
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', listingId = '33333333-3333-4333-8333-333333333333', room = '44444444-4444-4444-8444-444444444444'
const firstClient = '55555555-5555-4555-8555-555555555555', secondClient = '66666666-6666-4666-8666-666666666666', thirdClient = '77777777-7777-4777-8777-777777777777'
const now = new Date('2026-11-13T12:00:00Z')
const person = (id: string, username: string) => ({ id, username, email: username + '@private.fixture.invalid', password_hash: 'private-hash', avatar_url: null, account_type: 'individual', createdAt: now, individualProfile: { full_name: username === 'seeker' ? 'Seeker Member' : 'Host Member' }, organizationProfile: null })
beforeEach(() => {
 vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); phase.insideTransaction = false; phase.completedTransactions = 0
 for (const values of Object.values(store)) values.clear()
 store.users.set(a, person(a, 'seeker')); store.users.set(b, person(b, 'host'))
 Object.assign(tx, { user: { findUnique: mocks.userOne, findFirst: mocks.userFirst, findMany: mocks.userMany }, socialFollow: { findUnique: mocks.followOne, findFirst: mocks.followFirst, count: mocks.followCount, upsert: mocks.followUpsert, updateMany: mocks.followUpdate }, socialBlock: { findUnique: mocks.blockOne, findFirst: mocks.blockFirst, findMany: mocks.blockMany, upsert: mocks.blockUpsert }, listingLike: { findUnique: mocks.likeOne, count: mocks.likeCount, upsert: mocks.likeUpsert }, listing: { findFirst: mocks.listing }, notification: { create: mocks.notify }, conversation: { findMany: mocks.threads, updateMany: mocks.acceptRequests }, conversationActivity: { deleteMany: mocks.activityDelete }, mutationReceipt: { findUnique: mocks.receiptOne, create: mocks.receiptCreate }, savedListing: { upsert: mocks.savedUpsert } })
 mocks.userOne.mockImplementation(async ({ where }) => store.users.get(where.id) ?? null); mocks.userFirst.mockImplementation(async ({ where }) => store.users.get(where.id) ?? null); mocks.userMany.mockResolvedValue([...store.users.values()])
 mocks.followOne.mockImplementation(async ({ where }) => store.follows.get(where.id) ?? null)
 mocks.followFirst.mockImplementation(async ({ where }) => [...store.follows.values()].find(row => row.follower_id === where.follower_id && row.followed_id === where.followed_id && row.active === where.active) ?? null)
 mocks.followCount.mockImplementation(async ({ where }) => [...store.follows.values()].filter(row => row.active === where.active && (!where.id || where.id.in.includes(row.id)) && (!where.follower_id || row.follower_id === where.follower_id) && (!where.followed_id || row.followed_id === where.followed_id)).length)
 mocks.followUpsert.mockImplementation(async ({ where, create, update }) => { const value = { createdAt: now, ...(store.follows.get(where.id) ? { ...store.follows.get(where.id), ...update } : create) }; store.follows.set(where.id, value); return value })
 mocks.followUpdate.mockImplementation(async ({ where, data }) => { for (const id of where.id.in) { const row = store.follows.get(id); if (row?.active) store.follows.set(id, { ...row, ...data }) } return { count: where.id.in.length } })
 mocks.blockOne.mockImplementation(async ({ where }) => store.blocks.get(where.id) ?? null); mocks.blockFirst.mockResolvedValue(null); mocks.blockMany.mockResolvedValue([])
 mocks.blockUpsert.mockImplementation(async ({ where, create, update }) => { const value = store.blocks.get(where.id) ? { ...store.blocks.get(where.id), ...update } : create; store.blocks.set(where.id, value); return value })
 mocks.likeOne.mockImplementation(async ({ where }) => store.likes.get(where.id) ?? null)
 mocks.likeCount.mockImplementation(async ({ where }) => [...store.likes.values()].filter(row => row.listing_id === where.listing_id && row.active === where.active).length)
 mocks.likeUpsert.mockImplementation(async ({ where, create, update }) => { const value = store.likes.get(where.id) ? { ...store.likes.get(where.id), ...update } : create; store.likes.set(where.id, value); return value })
 mocks.receiptOne.mockImplementation(async ({ where }) => store.receipts.get(where.id) ?? null); mocks.receiptCreate.mockImplementation(async ({ data }) => { store.receipts.set(data.id, data); return data })
 mocks.listing.mockResolvedValue({ id: listingId, lister_id: b, media_source: 'recorded', gallery_permission_revision: null, lister: { gallery_upload_allowed: false, gallery_permission_revision: 0 } }); mocks.threads.mockResolvedValue([{ id: room }]); mocks.lock.mockResolvedValue(true)
})
afterEach(() => vi.useRealTimers())

describe('social follows, consent and private public-person DTOs', () => {
 it('stores an exact follow intent once and does not duplicate notifications on retries', async () => {
  const command = { clientId: firstClient, following: true }
  expect(await setFollowing(a, b, command)).toMatchObject({ id: b, following: true, followersCount: 1 })
  expect(await setFollowing(a, b, command)).toMatchObject({ id: b, following: true })
  expect(mocks.followUpsert).toHaveBeenCalledTimes(1); expect(mocks.notify).toHaveBeenCalledTimes(1)
  expect(mocks.active).toHaveBeenCalledWith(tx, [a, b]); expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ user_id: b, kind: 'social_follow', email_status: 'skipped' }) }))
  await expect(setFollowing(a, b, { ...command, following: false })).rejects.toMatchObject({ code: 'INVALID_RETRY' }); expect(mocks.followUpsert).toHaveBeenCalledTimes(1)
 })
 it('keeps an unfollow separate and prevents notification spam on rapid refollows', async () => {
  await setFollowing(a, b, { clientId: firstClient, following: true }); await setFollowing(a, b, { clientId: secondClient, following: false }); await setFollowing(a, b, { clientId: thirdClient, following: true })
  expect(mocks.notify).toHaveBeenCalledTimes(1); expect(store.follows.get(socialEdgeId('follow', a, b)).active).toBe(true)
 })
 it('persists Primary acceptance only when the reverse follow is active', async () => {
  await setFollowing(a, b, { clientId: firstClient, following: true }); expect(mocks.acceptRequests).not.toHaveBeenCalled()
  await setFollowing(b, a, { clientId: secondClient, following: true }); expect(mocks.acceptRequests).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ kind: 'direct' }), data: expect.objectContaining({ accepted_at: now, accepted_by: b }) }))
  expect(await areUsersMutualFollowers(a, b)).toBe(true)
  await setFollowing(b, a, { clientId: thirdClient, following: false }); expect(await areUsersMutualFollowers(a, b)).toBe(false)
 })
 it('rejects self-follow, blocked pairs and unavailable accounts before writing', async () => {
  await expect(setFollowing(a, a, { clientId: firstClient, following: true })).rejects.toMatchObject({ code: 'SELF_FOLLOW' }); expect(mocks.followUpsert).not.toHaveBeenCalled()
  mocks.blockFirst.mockResolvedValue({ id: 'blocked-edge' }); await expect(setFollowing(a, b, { clientId: firstClient, following: true })).rejects.toMatchObject({ status: 404 }); expect(mocks.followUpsert).not.toHaveBeenCalled()
  mocks.blockFirst.mockResolvedValue(null); mocks.active.mockRejectedValue(new Error('ACCOUNT_UNAVAILABLE')); await expect(setFollowing(a, b, { clientId: firstClient, following: true })).rejects.toThrow('ACCOUNT_UNAVAILABLE'); expect(mocks.notify).not.toHaveBeenCalled()
 })
 it('returns only public profile fields and searches normalized username prefixes', async () => {
  const result = await getPerson(a, b), serialized = JSON.stringify(result)
  expect(result).toMatchObject({ username: 'host', displayName: 'Host Member' }); expect(serialized).not.toContain('@private.fixture'); expect(serialized).not.toContain('password_hash'); expect(serialized).not.toContain('private-hash')
  await searchPeople(a, { query: '@HoSt' }); expect(mocks.userMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([{ username: { gte: 'host', lt: 'host\uffff' } }]) }) }))
  mocks.userMany.mockResolvedValue([]); expect((await searchPeople(a, { query: 'someone@example.com' })).items).toEqual([]); expect(mocks.userMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([{ id: '__no_match__' }]) }) }))
 })
})

describe('listing likes and blocking', () => {
 it('stores a public like independently of private saves and notifies the host once', async () => {
  const command = { clientId: firstClient, liked: true }
  expect(await setListingLike(a, listingId, command)).toEqual({ listingId, liked: true, count: 1 })
  expect(await setListingLike(a, listingId, command)).toEqual({ listingId, liked: true, count: 1 })
  expect(mocks.likeUpsert).toHaveBeenCalledTimes(1); expect(mocks.notify).toHaveBeenCalledTimes(1); expect(mocks.savedUpsert).not.toHaveBeenCalled(); expect(mocks.gallery).toHaveBeenCalledWith(tx, expect.objectContaining({ id: listingId }))
  await expect(setListingLike(a, listingId, { ...command, liked: false })).rejects.toMatchObject({ code: 'INVALID_RETRY' })
 })
 it('does not notify for self-likes or repeated unlike/like loops', async () => {
  await setListingLike(b, listingId, { clientId: firstClient, liked: true }); expect(mocks.notify).not.toHaveBeenCalled()
  store.likes.clear(); store.receipts.clear()
  await setListingLike(a, listingId, { clientId: firstClient, liked: true }); await setListingLike(a, listingId, { clientId: secondClient, liked: false }); await setListingLike(a, listingId, { clientId: thirdClient, liked: true })
  expect(mocks.notify).toHaveBeenCalledTimes(1); expect(await getListingLike(a, listingId)).toEqual({ listingId, liked: true, count: 1 })
 })
 it('does not leak engagement for private/unavailable listings or blocked hosts', async () => {
  mocks.listing.mockResolvedValue(null); await expect(getListingLike(a, listingId)).rejects.toMatchObject({ status: 404 }); expect(mocks.likeOne).not.toHaveBeenCalled()
  mocks.listing.mockResolvedValue({ id: listingId, lister_id: b, media_source: 'recorded' }); mocks.blockFirst.mockResolvedValue({ id: 'blocked' }); await expect(setListingLike(a, listingId, { clientId: firstClient, liked: true })).rejects.toMatchObject({ status: 404 }); expect(mocks.likeUpsert).not.toHaveBeenCalled()
 })
 it('blocking removes both follow directions and all pair typing activity atomically', async () => {
  await setFollowing(a, b, { clientId: firstClient, following: true }); await setFollowing(b, a, { clientId: secondClient, following: true })
  const result = await setBlocked(a, b, { clientId: thirdClient, blocked: true })
  expect(result).toEqual({ personId: b, blocked: true }); expect([...store.follows.values()].every(edge => !edge.active)).toBe(true)
  expect(mocks.followUpdate).toHaveBeenCalledWith({ where: { id: { in: [socialEdgeId('follow', a, b), socialEdgeId('follow', b, a)] }, active: true }, data: { active: false } })
  expect(mocks.activityDelete).toHaveBeenCalledWith({ where: { conversation_id: { in: [room] } } })
  expect(mocks.notify).toHaveBeenCalledTimes(2)
  mocks.blockFirst.mockResolvedValue({ id: 'active-block' }); expect(await areSociallyBlocked(a, b)).toBe(true)
 })
 it('recovers and removes only the actor own block without revealing a mutually blocked profile', async () => {
  await setBlocked(a, b, { clientId: firstClient, blocked: true })
  mocks.blockFirst.mockResolvedValue({ id: 'other-party-block' })
  await expect(getPerson(a, b)).rejects.toMatchObject({ status: 404 })
  expect(await getOwnBlockState(a, b)).toEqual({ personId: b, blocked: true })
  mocks.active.mockClear(); store.users.delete(b)
  expect(await setBlocked(a, b, { clientId: secondClient, blocked: false })).toEqual({ personId: b, blocked: false })
  expect(mocks.active).toHaveBeenCalledWith(tx, [a]); expect(mocks.active).not.toHaveBeenCalledWith(tx, [a, b])
  expect(await getOwnBlockState(a, b)).toEqual({ personId: b, blocked: false })
  expect(await setBlocked(a, b, { clientId: secondClient, blocked: false })).toEqual({ personId: b, blocked: false })
  expect(mocks.blockUpsert).toHaveBeenCalledTimes(2)
 })
 it('returns the same off state for unknown targets without creating orphan blocks', async () => {
  expect(await getOwnBlockState(a, room)).toEqual({ personId: room, blocked: false })
  expect(await setBlocked(a, room, { clientId: firstClient, blocked: false })).toEqual({ personId: room, blocked: false })
  expect(mocks.blockUpsert).not.toHaveBeenCalled(); expect(mocks.userOne).not.toHaveBeenCalled(); expect(mocks.userFirst).not.toHaveBeenCalled()
 })
 it('fails closed before social writes if the reviewed database setup is missing', async () => { mocks.ready.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED')); await expect(setListingLike(a, listingId, { clientId: firstClient, liked: true })).rejects.toThrow('DATABASE_SETUP_REQUIRED'); expect(mocks.likeUpsert).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled() })
})

describe('social mutation commit boundaries', () => {
 it('finishes Follow before profile joins and counts, even when the projection is slow', async () => {
  const count = mocks.followCount.getMockImplementation()!
  const projections: boolean[] = []
  mocks.followCount.mockImplementation(async args => {
   projections.push(phase.insideTransaction)
   vi.advanceTimersByTime(6000)
   return count(args)
  })
  expect(await setFollowing(a, b, { clientId: firstClient, following: true })).toMatchObject({ following: true, followersCount: 1 })
  expect(projections).toEqual([false, false])
  expect(phase.completedTransactions).toBe(1)
  expect(mocks.receiptCreate).toHaveBeenCalledTimes(1)
 })
 it('keeps the committed Follow receipt when post-commit profile readback fails', async () => {
  mocks.userFirst.mockRejectedValueOnce(new Error('READBACK_UNAVAILABLE'))
  const command = { clientId: firstClient, following: true }
  await expect(setFollowing(a, b, command)).rejects.toThrow('READBACK_UNAVAILABLE')
  expect(store.receipts.size).toBe(1); expect(mocks.notify).toHaveBeenCalledTimes(1)
  expect(await setFollowing(a, b, command)).toMatchObject({ following: true })
  expect(mocks.followUpsert).toHaveBeenCalledTimes(1); expect(mocks.notify).toHaveBeenCalledTimes(1)
 })
 it('reads Like counts after commit and recovers a failed projection without another notification', async () => {
  const count = mocks.likeCount.getMockImplementation()!
  const projections: boolean[] = []
  mocks.likeCount.mockImplementation(async args => { projections.push(phase.insideTransaction); return count(args) })
  const command = { clientId: firstClient, liked: true }
  mocks.likeCount.mockRejectedValueOnce(new Error('COUNT_UNAVAILABLE'))
  await expect(setListingLike(a, listingId, command)).rejects.toThrow('COUNT_UNAVAILABLE')
  expect(store.receipts.size).toBe(1); expect(mocks.notify).toHaveBeenCalledTimes(1)
  expect(await setListingLike(a, listingId, command)).toEqual({ listingId, liked: true, count: 1 })
  expect(projections).toEqual([false])
  expect(mocks.likeUpsert).toHaveBeenCalledTimes(1); expect(mocks.notify).toHaveBeenCalledTimes(1)
 })
 it('reads the current own Block state outside the committed transaction', async () => {
  const get = mocks.blockOne.getMockImplementation()!, reads: boolean[] = []
  mocks.blockOne.mockImplementation(async args => { reads.push(phase.insideTransaction); return get(args) })
  expect(await setBlocked(a, b, { clientId: firstClient, blocked: true })).toEqual({ personId: b, blocked: true })
  expect(reads).toEqual([true, false])
 })
})
