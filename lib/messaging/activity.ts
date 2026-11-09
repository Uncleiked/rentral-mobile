import prisma from '@/lib/db'
import { accountIsActive, assertActiveAccounts } from '@/lib/accounts/availability'
import { assertMessagingActivityReady } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import { CONVERSATION_PRESENCE_MS, CONVERSATION_TYPING_MS, type ConversationActivity } from '@/lib/contracts/messaging'

/** Presence is shared between backend processes and scoped to one conversation.
 * Readers enforce freshness even if Mongo's asynchronous TTL cleanup is late. */
export async function getConversationActivity(userId: string, conversationId: string): Promise<ConversationActivity | null> {
  await assertMessagingActivityReady()
  const thread = await prisma.conversation.findFirst({ where: { id: conversationId, OR: [{ seeker_id: userId }, { lister_id: userId }] },
    select: { seeker_id: true, lister_id: true, seeker_read_at: true, lister_read_at: true,
      seeker: { select: { closed_at: true } }, lister: { select: { closed_at: true } },
      messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true } },
    } })
  if (!thread) return null
  const seeker = thread.seeker_id === userId
  const otherId = seeker ? thread.lister_id : thread.seeker_id
  const active = accountIsActive(thread.seeker) && accountIsActive(thread.lister)
  const activity = active ? await prisma.conversationActivity.findUnique({ where: { conversation_id_user_id: { conversation_id: conversationId, user_id: otherId } },
    select: { last_seen_at: true, typing_until: true } }) : null
  const now = Date.now()
  const online = Boolean(activity && activity.last_seen_at.getTime() <= now && activity.last_seen_at.getTime() > now - CONVERSATION_PRESENCE_MS)
  return { otherOnline: online, otherTyping: Boolean(online && activity?.typing_until && activity.typing_until.getTime() > now),
    otherReadAt: (seeker ? thread.lister_read_at : thread.seeker_read_at)?.toISOString() ?? null, latestMessageId: thread.messages[0]?.id ?? null }
}

export async function setConversationActivity(userId: string, conversationId: string, typing: boolean): Promise<void> {
  await assertMessagingActivityReady()
  await withTransaction(async tx => {
    const thread = await tx.conversation.findFirst({ where: { id: conversationId, OR: [{ seeker_id: userId }, { lister_id: userId }] },
      select: { seeker_id: true, lister_id: true } })
    if (!thread) throw new Error('FORBIDDEN')
    await assertActiveAccounts(tx, [thread.seeker_id, thread.lister_id])
    const now = new Date()
    await tx.conversationActivity.upsert({ where: { conversation_id_user_id: { conversation_id: conversationId, user_id: userId } },
      create: { conversation_id: conversationId, user_id: userId, last_seen_at: now, typing_until: typing ? new Date(now.getTime() + CONVERSATION_TYPING_MS) : null },
      update: { last_seen_at: now, typing_until: typing ? new Date(now.getTime() + CONVERSATION_TYPING_MS) : null },
    })
  })
}

export async function clearConversationActivity(userId: string, conversationId: string): Promise<void> {
  await assertMessagingActivityReady()
  // A caller can only remove their own ephemeral row. An opaque, nonexistent
  // conversation has the same response and reveals no membership information.
  await prisma.conversationActivity.deleteMany({ where: { conversation_id: conversationId, user_id: userId } })
}
