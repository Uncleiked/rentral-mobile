import prisma from '@/lib/db'
import { platformEnabled } from '@/lib/platform'
import { conversationMember, messageInput, type ChatThread } from './policy'
import { withTransaction, lockRecord } from '@/lib/database/transactions'

export async function getInbox(userId: string) {
  if (!platformEnabled()) return []
  return prisma.conversation.findMany({
    where: { OR: [{ seeker_id: userId }, { lister_id: userId }] },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 50,
    select: {
      id: true, seeker_id: true, listing_id: true, updatedAt: true,
      seeker: { select: { username: true } }, lister: { select: { username: true } },
      messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { body: true } },
    },
  })
}

export async function getThread(userId: string, id: string, beforeId?: string): Promise<ChatThread | null> {
  if (!platformEnabled()) return null
  const thread = await prisma.conversation.findFirst({
    where: { id, OR: [{ seeker_id: userId }, { lister_id: userId }] },
    select: { id: true, listing_id: true, seeker_id: true, lister_id: true,
      seeker_read_at: true, lister_read_at: true,
      seeker: { select: { username: true } }, lister: { select: { username: true } } },
  })
  if (!thread) return null
  const cursor = beforeId ? await prisma.message.findFirst({
    where: { id: beforeId, conversation_id: id }, select: { id: true, createdAt: true },
  }) : null
  if (beforeId && !cursor) return null
  const rows = await prisma.message.findMany({
    where: { conversation_id: id, ...(cursor ? { OR: [
      { createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ] } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 61,
    select: { id: true, sender_id: true, body: true, createdAt: true,
      sharedListing: { select: { id: true, category: true, listing_status: true } } },
  })
  const seeker = thread.seeker_id === userId
  return {
    id, userId, listingId: thread.listing_id,
    otherName: (seeker ? thread.lister.username : thread.seeker.username) ?? 'Rentral member',
    otherReadAt: (seeker ? thread.lister_read_at : thread.seeker_read_at)?.toISOString() ?? null,
    hasMore: rows.length > 60,
    messages: rows.slice(0, 60).reverse().map(row => ({
      id: row.id, senderId: row.sender_id, body: row.body, sentAt: row.createdAt.toISOString(),
      sharedListing: row.sharedListing?.listing_status === 'active'
        ? { id: row.sharedListing.id, category: row.sharedListing.category } : null,
    })),
  }
}

export async function beginConversation(userId: string, listingId: string): Promise<string> {
  return withTransaction(async tx => {
    await lockRecord(tx, 'listing', listingId)
    if (!await lockRecord(tx, 'user', userId)) throw new Error('FORBIDDEN')
    const listing = await tx.listing.findFirst({
      where: { id: listingId, listing_status: 'active', lister_id: { not: userId } },
      select: { id: true, lister_id: true },
    })
    if (!listing) throw new Error('LISTING_UNAVAILABLE')
    const conversation = await tx.conversation.upsert({
      where: { listing_id_seeker_id: { listing_id: listing.id, seeker_id: userId } },
      create: { listing_id: listing.id, seeker_id: userId, lister_id: listing.lister_id },
      update: {}, select: { id: true },
    })
    return conversation.id
  })
}

export async function persistMessage(userId: string, input: unknown): Promise<string> {
  const data = messageInput.parse(input)
  return withTransaction(async tx => {
    // Serialize the sender's retries and rate counter, including across threads.
    // Account deletion and retries must not race message persistence.
    await lockRecord(tx, 'user', userId)
    const sender = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!sender) throw new Error('FORBIDDEN')
    const thread = await tx.conversation.findUnique({ where: { id: data.conversationId },
      select: { seeker_id: true, lister_id: true } })
    if (!thread || !conversationMember(userId, thread)) throw new Error('FORBIDDEN')
    const duplicate = await tx.message.findUnique({
      where: { sender_id_client_id: { sender_id: userId, client_id: data.clientId } },
      select: { id: true, conversation_id: true },
    })
    if (duplicate) {
      if (duplicate.conversation_id !== data.conversationId) throw new Error('INVALID_RETRY')
      return duplicate.id
    }
    if (data.sharedListingId && !await tx.listing.findFirst({
      where: { id: data.sharedListingId, listing_status: 'active' }, select: { id: true },
    })) throw new Error('LISTING_UNAVAILABLE')
    const recent = await tx.message.count({ where: { sender_id: userId,
      createdAt: { gt: new Date(Date.now() - 60_000) } } })
    if (recent >= 30) throw new Error('RATE_LIMITED')
    const message = await tx.message.create({ data: {
      conversation_id: data.conversationId, sender_id: userId, client_id: data.clientId,
      body: data.body, shared_listing_id: data.sharedListingId,
    }, select: { id: true } })
    await tx.conversation.update({ where: { id: data.conversationId }, data: { updatedAt: new Date() } })
    await tx.notification.create({ data: {
      user_id: userId === thread.seeker_id ? thread.lister_id : thread.seeker_id,
      kind: 'message', title: 'New message', body: 'You have a new message about a listing.',
      href: `/marketplace/messages?id=${data.conversationId}`,
    } })
    return message.id
  })
}
