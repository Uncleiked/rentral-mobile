import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { activeAccountWhere } from '@/lib/accounts/availability'
import { publicAvatarReference } from '@/lib/accounts/avatar-reference'
import { assertSocialReady } from '@/lib/database/readiness'
import { peopleConnectionsSchema, peopleSearchSchema, socialPersonSchema, type SocialPerson, type PeoplePage } from '@/lib/contracts/social'
import { socialEdgeId, socialReadDatabase } from './relationships'

export const publicPersonSelect = { id: true, username: true, avatar_url: true, account_type: true, createdAt: true,
  individualProfile: { select: { full_name: true } }, organizationProfile: { select: { organization_name: true } } } satisfies Prisma.UserSelect
type PersonRow = Prisma.UserGetPayload<{ select: typeof publicPersonSelect }>
type PeopleDatabase = Pick<Prisma.TransactionClient, 'user' | 'socialFollow' | 'socialBlock'>
const cursorSchema = z.object({ id: z.string().regex(/^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/), date: z.string().datetime(), scope: z.string().length(64) }).strict()
const scopeHash = (value: string) => createHash('sha256').update(value).digest('hex')
function readCursor(value: string | undefined, scope: string) {
  if (!value) return null
  try { const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))); if (parsed.scope !== scope) throw new Error(); return parsed }
  catch { throw new ApiError(400, 'INVALID_CURSOR', 'Start this member search again.') }
}
function cursorFor(row: { id: string; createdAt: Date }, scope: string): string { return Buffer.from(JSON.stringify({ id: row.id, date: row.createdAt.toISOString(), scope })).toString('base64url') }
export async function availablePersonWhere(viewer: string): Promise<Prisma.UserWhereInput> {
  const blocks = await prisma.socialBlock.findMany({ where: { active: true, OR: [{ blocker_id: viewer }, { blocked_id: viewer }] }, select: { blocker_id: true, blocked_id: true } })
  // Both directions stay hidden; a blocker is never disclosed to the other party.
  const excluded = [...new Set(blocks.map(row => row.blocker_id === viewer ? row.blocked_id : row.blocker_id))]
  return { ...activeAccountWhere, ...(excluded.length ? { id: { notIn: excluded } } : {}) }
}
export async function serializePerson(viewer: string, row: PersonRow, tx: PeopleDatabase = socialReadDatabase): Promise<SocialPerson> {
  const [outgoing, incoming, blocked, followersCount, followingCount] = await Promise.all([
    tx.socialFollow.findUnique({ where: { id: socialEdgeId('follow', viewer, row.id) }, select: { active: true } }),
    tx.socialFollow.findUnique({ where: { id: socialEdgeId('follow', row.id, viewer) }, select: { active: true } }),
    tx.socialBlock.findUnique({ where: { id: socialEdgeId('block', viewer, row.id) }, select: { active: true } }),
    tx.socialFollow.count({ where: { followed_id: row.id, active: true, follower: activeAccountWhere } }),
    tx.socialFollow.count({ where: { follower_id: row.id, active: true, followed: activeAccountWhere } }),
  ])
  const displayName = (row.account_type === 'organization' ? row.organizationProfile?.organization_name : row.individualProfile?.full_name)?.trim().slice(0, 120) || row.username || 'Rentral member'
  return socialPersonSchema.parse({ id: row.id, username: row.username, displayName, avatarUrl: publicAvatarReference(row.avatar_url, row.id),
    accountType: row.account_type === 'organization' ? 'organization' : 'individual', following: Boolean(outgoing?.active), followedBy: Boolean(incoming?.active), blocked: Boolean(blocked?.active), followersCount, followingCount })
}
export async function getPerson(viewer: string, personId: string): Promise<SocialPerson> {
  await assertSocialReady(); z.uuid().parse(personId)
  const row = await prisma.user.findFirst({ where: { id: personId, ...activeAccountWhere }, select: publicPersonSelect })
  if (!row || await prisma.socialBlock.findFirst({ where: { blocker_id: personId, blocked_id: viewer, active: true }, select: { id: true } })) throw new ApiError(404, 'NOT_FOUND', 'This member is unavailable.')
  return serializePerson(viewer, row)
}
export async function searchPeople(viewer: string, input: unknown): Promise<PeoplePage> {
  await assertSocialReady()
  const data = peopleSearchSchema.parse(input), query = data.query.replace(/^@/, '').toLowerCase()
  const scope = scopeHash(`people:${viewer}:${query}`), cursor = readCursor(data.cursor, scope)
  const available = await availablePersonWhere(viewer)
  // Username is an identifier, not free-form relevance search. A normalized
  // prefix lookup uses the existing unique username index without an Atlas dependency.
  const lookup: Prisma.UserWhereInput = query ? z.uuid().safeParse(query).success ? { id: query } : /^[a-z0-9_]{1,24}$/.test(query) ? { username: { gte: query, lt: query + '\uffff' } } : { id: '__no_match__' } : {}
  const rows = await prisma.user.findMany({ where: { AND: [available, lookup, ...(cursor ? [{ OR: [{ createdAt: { lt: new Date(cursor.date) } }, { createdAt: new Date(cursor.date), id: { lt: cursor.id } }] }] : [])] },
    select: publicPersonSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: data.limit + 1 })
  const hasMore = rows.length > data.limit, items = rows.slice(0, data.limit)
  return { items: await Promise.all(items.map(row => serializePerson(viewer, row))), nextCursor: hasMore ? cursorFor(items[items.length - 1], scope) : null, hasMore }
}
export async function getConnections(viewer: string, personId: string, input: unknown): Promise<PeoplePage> {
  await assertSocialReady(); await getPerson(viewer, personId)
  const data = peopleConnectionsSchema.parse(input), scope = scopeHash(`connections:${viewer}:${personId}:${data.kind}`), cursor = readCursor(data.cursor, scope)
  const personWhere = await availablePersonWhere(viewer), followers = data.kind === 'followers'
  const rows = await prisma.socialFollow.findMany({ where: { active: true, ...(followers ? { followed_id: personId, follower: personWhere } : { follower_id: personId, followed: personWhere }),
    ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.date) } }, { createdAt: new Date(cursor.date), id: { lt: cursor.id } }] } : {}) },
    include: { follower: { select: publicPersonSelect }, followed: { select: publicPersonSelect } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: data.limit + 1 })
  const hasMore = rows.length > data.limit, items = rows.slice(0, data.limit)
  return { items: await Promise.all(items.map(row => serializePerson(viewer, followers ? row.follower : row.followed))), nextCursor: hasMore ? cursorFor(items[items.length - 1], scope) : null, hasMore }
}


