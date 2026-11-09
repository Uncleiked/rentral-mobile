import type { MatchConnection, MatchMessage, MatchProfile } from '@prisma/client'
import { assertMatchingReady } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import type { ArchiveQuery } from '@/lib/api/archive'
import { accountIsActive } from '@/lib/accounts/availability'
import { matchConnectionPageSchema, matchConnectionSchema } from './contracts'
import { matchingConnectionAccess, matchUserSelect, matchingUnavailable, ownConnectionReadAt, publicMatchingProfile, visibleMatch, type MatchUser } from './access'
import { MatchingError } from './policy'

type MessagePreview = Pick<MatchMessage, 'id' | 'connection_id' | 'sender_id' | 'body' | 'createdAt'>
const previewSelect = { id: true, connection_id: true, sender_id: true, body: true, createdAt: true } as const
function connectionDto(connection: MatchConnection, actor: string, profile: MatchProfile, user: MatchUser, message: MessagePreview | null) {
  if (![connection.lower_user_id, connection.upper_user_id].includes(actor) || ![connection.lower_user_id, connection.upper_user_id].includes(connection.requested_by)) throw matchingUnavailable()
  if ((connection.status === 'accepted' && connection.last_message_id && !message) || (message && (message.connection_id !== connection.id || ![connection.lower_user_id, connection.upper_user_id].includes(message.sender_id) || message.id !== connection.last_message_id))) {
    throw new MatchingError('Conversation details could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
  }
  const ownRead = ownConnectionReadAt(connection, actor), accepted = connection.status === 'accepted'
  const result = matchConnectionSchema.safeParse({ id: connection.id, status: connection.status, requestedByMe: connection.requested_by === actor,
    other: publicMatchingProfile(profile, user), acceptedAt: connection.accepted_at?.toISOString() ?? null, createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(), lastActivityAt: connection.last_activity_at.toISOString(),
    otherReadAt: accepted ? (connection.lower_user_id === actor ? connection.upper_read_at : connection.lower_read_at)?.toISOString() ?? null : null,
    unread: accepted && Boolean(message && message.sender_id !== actor && (!ownRead || message.createdAt > ownRead)),
    lastMessage: accepted && message ? { own: message.sender_id === actor, body: message.body.slice(0, 180), createdAt: message.createdAt.toISOString() } : null,
  })
  if (!result.success) throw new MatchingError('Conversation details could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
  return result.data
}
export async function matchingConnection(actor: string, id: string) {
  await assertMatchingReady()
  return withTransaction(async tx => {
    const { connection, other, otherUser } = await matchingConnectionAccess(tx, actor, id)
    const message = connection.status === 'accepted' && connection.last_message_id ? await tx.matchMessage.findFirst({ where: { id: connection.last_message_id, connection_id: id }, select: previewSelect }) : null
    return connectionDto(connection, actor, other, otherUser, message)
  })
}
export async function matchingConnections(actor: string, query: ArchiveQuery) {
  await assertMatchingReady()
  return withTransaction(async tx => {
    const own = await tx.matchProfile.findUnique({ where: { user_id: actor } })
    const account = await tx.user.findUnique({ where: { id: actor }, select: { id: true, closed_at: true } })
    if (!own || !accountIsActive(account) || !visibleMatch(own)) throw matchingUnavailable()
    const rows = await tx.matchConnection.findMany({ where: { OR: [{ lower_user_id: actor }, { upper_user_id: actor }], status: { in: ['requested', 'accepted'] },
      ...(query.cursor ? { AND: [{ OR: [{ last_activity_at: { lt: query.cursor.createdAt } }, { last_activity_at: query.cursor.createdAt, id: { lt: query.cursor.id } }] }] } : {}),
    }, orderBy: [{ last_activity_at: 'desc' }, { id: 'desc' }], take: query.limit + 1 })
    const page = rows.slice(0, query.limit), otherIds = [...new Set(page.map(connection => connection.lower_user_id === actor ? connection.upper_user_id : connection.lower_user_id))]
    const profiles = otherIds.length ? await tx.matchProfile.findMany({ where: { user_id: { in: otherIds }, is_visible: true, moderation_status: 'clear' } }) : []
    const users = otherIds.length ? await tx.user.findMany({ where: { id: { in: otherIds } }, select: matchUserSelect }) : []
    const blocks = otherIds.length ? await tx.matchBlock.findMany({ where: { OR: [{ blocker_id: actor, blocked_id: { in: otherIds } }, { blocked_id: actor, blocker_id: { in: otherIds } }] },
      select: { blocker_id: true, blocked_id: true } }) : []
    const blocked = new Set(blocks.map(block => block.blocker_id === actor ? block.blocked_id : block.blocker_id))
    const eligible = page.flatMap(connection => {
      const otherId = connection.lower_user_id === actor ? connection.upper_user_id : connection.lower_user_id
      const profile = profiles.find(candidate => candidate.user_id === otherId), user = users.find(candidate => candidate.id === otherId)
      if (blocked.has(otherId) || !profile || !user || !accountIsActive(user) || !visibleMatch(profile)) return []
      return [{ connection, profile, user }]
    })
    const messageIds = eligible.flatMap(({ connection }) => connection.status === 'accepted' && connection.last_message_id ? [connection.last_message_id] : [])
    const messages = messageIds.length ? await tx.matchMessage.findMany({ where: { id: { in: messageIds }, connection_id: { in: eligible.map(item => item.connection.id) } }, select: previewSelect, take: eligible.length }) : []
    const items = eligible.map(({ connection, profile, user }) => {
      const message = messages.find(candidate => candidate.id === connection.last_message_id && candidate.connection_id === connection.id) ?? null
      return connectionDto(connection, actor, profile, user, message)
    })
    const last = page.at(-1)
    const result = matchConnectionPageSchema.safeParse({ items, nextCursor: rows.length > query.limit && last ? `${last.last_activity_at.toISOString()}~${last.id}` : null, limit: query.limit })
    if (!result.success) throw new MatchingError('Your contact list could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
    return result.data
  })
}
