import { createHash } from 'node:crypto'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { assertSocialReady } from '@/lib/database/readiness'
import { mutationCommand, committedMutation, transactionMutation, recordMutation } from '@/lib/database/mutations'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { directConversationInputSchema, acceptConversationInputSchema } from '@/lib/contracts/messaging'
import { areSociallyBlocked, areUsersMutualFollowers, assertSocialInteractionAllowed } from '@/lib/social/relationships'
import { conversationMember } from './policy'
import { directConversationInitiator } from './access'

/** One deterministic room per unordered pair, independent of which member starts. */
export function directConversationId(first: string, second: string): string {
  const value = createHash('sha256').update(`rentral:direct:v1\0${[first, second].sort().join('\0')}`).digest('hex')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`
}

export async function beginDirectConversation(userId: string, input: unknown): Promise<string> {
  const data = directConversationInputSchema.parse(input)
  if (userId === data.recipientId) throw new ApiError(400, 'SELF_CONVERSATION', 'Choose another member to message.')
  await assertSocialReady()
  const command = mutationCommand(userId, 'direct_conversation_start', data.clientId, data)
  return withTransaction(async tx => {
    // Follow/block commands lock these same accounts in sorted order.
    await assertActiveAccounts(tx, [userId, data.recipientId])
    await assertSocialInteractionAllowed(tx, userId, data.recipientId)
    const committed = await transactionMutation(tx, command)
    if (committed) return committed
    const id = directConversationId(userId, data.recipientId)
    const existing = await tx.conversation.findUnique({ where: { id }, select: { id: true, kind: true, seeker_id: true, lister_id: true } })
    if (existing && (existing.kind !== 'direct' || !conversationMember(userId, existing) || !conversationMember(data.recipientId, existing))) {
      throw new ApiError(409, 'CONVERSATION_CONFLICT', 'This conversation cannot be started. Refresh your messages.')
    }
    if (!existing) {
      const recent = await tx.conversation.count({ where: { kind: 'direct', initiated_by: userId, createdAt: { gt: new Date(Date.now() - 86400000) } } })
      if (recent >= 20) throw new ApiError(429, 'REQUEST_LIMIT', 'You have started many conversations today. Please try again tomorrow.')
      const [seeker_id, lister_id] = [userId, data.recipientId].sort()
      const mutual = await areUsersMutualFollowers(userId, data.recipientId, tx)
      await tx.conversation.create({ data: { id, kind: 'direct', listing_id: null, seeker_id, lister_id, initiated_by: userId, ...(mutual ? { accepted_at: new Date() } : {}) } })
    }
    await recordMutation(tx, command, id)
    return id
  })
}

export async function readDirectStart(userId: string, input: unknown): Promise<string | null> {
  const data = directConversationInputSchema.parse(input)
  await assertSocialReady()
  const id = await committedMutation(mutationCommand(userId, 'direct_conversation_start', data.clientId, data))
  if (!id || await areSociallyBlocked(userId, data.recipientId)) return null
  const thread = await prisma.conversation.findFirst({ where: { id, kind: 'direct', OR: [{ seeker_id: userId, lister_id: data.recipientId }, { lister_id: userId, seeker_id: data.recipientId }] }, select: { id: true } })
  return thread?.id ?? null
}

export async function acceptDirectConversation(userId: string, conversationId: string, input: unknown): Promise<string> {
  const data = acceptConversationInputSchema.parse(input)
  await assertSocialReady()
  const command = mutationCommand(userId, 'conversation_accept', data.clientId, { ...data, conversationId })
  return withTransaction(async tx => {
    const initial = await tx.conversation.findUnique({ where: { id: conversationId }, select: { seeker_id: true, lister_id: true } })
    if (!initial || !conversationMember(userId, initial)) throw new Error('FORBIDDEN')
    await assertActiveAccounts(tx, [initial.seeker_id, initial.lister_id])
    await assertSocialInteractionAllowed(tx, initial.seeker_id, initial.lister_id)
    await lockRecord(tx, 'conversation', conversationId)
    const thread = await tx.conversation.findUnique({ where: { id: conversationId }, select: { kind: true, seeker_id: true, lister_id: true, initiated_by: true, accepted_at: true, updatedAt: true } })
    if (!thread || thread.kind !== 'direct' || !directConversationInitiator(thread) || thread.initiated_by === userId) {
      throw new ApiError(403, 'RECIPIENT_REQUIRED', 'Only the recipient can move this request to Primary.')
    }
    const committed = await transactionMutation(tx, command)
    if (committed) return committed
    if (!thread.accepted_at) {
      await tx.conversation.update({ where: { id: conversationId }, data: { accepted_at: new Date(), accepted_by: userId, updatedAt: thread.updatedAt } })
      await tx.notification.create({ data: { user_id: thread.initiated_by!, kind: 'message_request_accepted', title: 'Message request accepted', body: 'Your conversation is now in Primary. You can chat with each other.', href: `/marketplace/messages?id=${conversationId}` } })
    }
    await recordMutation(tx, command, conversationId)
    return conversationId
  })
}

export async function readConversationAcceptance(userId: string, conversationId: string, input: unknown): Promise<string | null> {
  const data = acceptConversationInputSchema.parse(input)
  await assertSocialReady()
  const id = await committedMutation(mutationCommand(userId, 'conversation_accept', data.clientId, { ...data, conversationId }))
  if (id !== conversationId) return null
  const thread = await prisma.conversation.findFirst({ where: { id, kind: 'direct', OR: [{ seeker_id: userId }, { lister_id: userId }] }, select: { seeker_id: true, lister_id: true, initiated_by: true, accepted_at: true } })
  if (!thread || thread.initiated_by === userId || !thread.accepted_at || await areSociallyBlocked(thread.seeker_id, thread.lister_id)) return null
  return id
}
