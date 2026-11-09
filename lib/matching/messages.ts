import { z } from 'zod'
import { assertMatchingReady } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import type { ArchiveQuery } from '@/lib/api/archive'
import { matchingMessageInputSchema, MatchingError } from './policy'
import { matchingConnectionAccess, ownConnectionReadAt, matchingUnavailable } from './access'
import { matchMessagePageSchema } from './contracts'

export async function persistMatchingMessage(actor: string, id: string, input: unknown): Promise<string> {
  await assertMatchingReady()
  z.uuid().parse(id)
  const data = matchingMessageInputSchema.parse(input)
  return withTransaction(async tx => {
    const { other } = await matchingConnectionAccess(tx, actor, id, { lock: true, accepted: true })
    const existing = await tx.matchMessage.findUnique({ where: { sender_id_client_id: { sender_id: actor, client_id: data.clientId } } })
    if (existing) {
      if (existing.connection_id !== id || existing.body !== data.body) throw new MatchingError('Use a new message identifier for different content or another conversation.', 'INVALID_RETRY')
      return existing.id
    }
    const message = await tx.matchMessage.create({ data: { connection_id: id, sender_id: actor, client_id: data.clientId, body: data.body } })
    await tx.matchConnection.update({ where: { id }, data: { last_message_id: message.id, last_activity_at: message.createdAt } })
    await tx.notification.create({ data: { user_id: other.user_id, kind: 'match_message', title: 'A new Squat-Mates message',
      body: 'A connected member sent a message. Open your conversation to read it.', href: `/marketplace/squat-mates/connections/${id}`, dedupe_key: `match-message:${message.id}` } })
    return message.id
  })
}
export async function matchingMessages(actor: string, id: string, query: ArchiveQuery) {
  await assertMatchingReady()
  z.uuid().parse(id)
  return withTransaction(async tx => {
    await matchingConnectionAccess(tx, actor, id, { accepted: true })
    const rows = await tx.matchMessage.findMany({ where: { connection_id: id, ...(query.cursor ? { OR: [
      { createdAt: { lt: query.cursor.createdAt } }, { createdAt: query.cursor.createdAt, id: { lt: query.cursor.id } },
    ] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
    select: { id: true, client_id: true, sender_id: true, body: true, createdAt: true } })
    const page = rows.slice(0, query.limit), last = page.at(-1)
    const result = matchMessagePageSchema.safeParse({ items: [...page].reverse().map(message => ({ id: message.id, clientId: message.client_id,
      own: message.sender_id === actor, body: message.body, createdAt: message.createdAt.toISOString() })),
      nextCursor: rows.length > query.limit && last ? `${last.createdAt.toISOString()}~${last.id}` : null, limit: query.limit })
    if (!result.success) throw new MatchingError('This conversation could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
    return result.data
  })
}
export async function markMatchingRead(actor: string, id: string, messageId?: string): Promise<string> {
  await assertMatchingReady()
  z.uuid().parse(id)
  if (messageId) z.uuid().parse(messageId)
  return withTransaction(async tx => {
    const { connection } = await matchingConnectionAccess(tx, actor, id, { lock: true, accepted: true })
    const previous = ownConnectionReadAt(connection, actor)
    // Legacy empty acknowledgements remain a safe no-op. A displayed message
    // cutoff is needed to avoid acknowledging an arrival the client never saw.
    if (!messageId) return (previous ?? connection.createdAt).toISOString()
    const message = await tx.matchMessage.findFirst({ where: { id: messageId, connection_id: id }, select: { createdAt: true } })
    if (!message) throw matchingUnavailable()
    const readAt = previous && previous >= message.createdAt ? previous : message.createdAt
    if (!previous || readAt > previous) await tx.matchConnection.update({ where: { id }, data: connection.lower_user_id === actor ? { lower_read_at: readAt } : { upper_read_at: readAt } })
    return readAt.toISOString()
  })
}
