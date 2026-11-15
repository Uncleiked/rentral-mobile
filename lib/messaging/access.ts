import type { Prisma } from '@prisma/client'
import { areSociallyBlocked, areUsersMutualFollowers } from '@/lib/social/relationships'

export type ConversationRecord = {
  seeker_id: string
  lister_id: string
  kind?: string | null
  initiated_by?: string | null
  accepted_at?: Date | null
  accepted_by?: string | null
}

export function directConversationInitiator(thread: ConversationRecord): string | null {
  return thread.initiated_by === thread.seeker_id || thread.initiated_by === thread.lister_id ? thread.initiated_by : null
}

export function conversationCapabilities(userId: string, thread: ConversationRecord, mutual: boolean, hasMessages: boolean) {
  const otherId = thread.seeker_id === userId ? thread.lister_id : thread.seeker_id
  const kind = thread.kind === 'direct' ? 'direct' as const : 'listing' as const
  const initiator = kind === 'direct' ? directConversationInitiator(thread) : null
  const primary = kind === 'listing' || Boolean(thread.accepted_at) || mutual
  const requestIncoming = kind === 'direct' && !primary && initiator !== userId
  const folder = primary ? 'primary' as const : requestIncoming ? 'requests' as const : 'sent' as const
  return { otherId, kind, folder, requestIncoming, canAccept: requestIncoming && Boolean(initiator), canSend: primary || Boolean(initiator === userId && !hasMessages) }
}

export async function currentConversationCapabilities(userId: string, thread: ConversationRecord, hasMessages: boolean, db?: Prisma.TransactionClient) {
  if (thread.kind !== 'direct') return conversationCapabilities(userId, thread, false, hasMessages)
  if (!directConversationInitiator(thread) || await areSociallyBlocked(thread.seeker_id, thread.lister_id, db)) return null
  return conversationCapabilities(userId, thread, await areUsersMutualFollowers(thread.seeker_id, thread.lister_id, db), hasMessages)
}
