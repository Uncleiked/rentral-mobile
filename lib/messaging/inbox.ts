import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db'
import { assertSocialReady, socialPrepared } from '@/lib/database/readiness'
import { messageInboxPageSchema, type MessageInboxQuery } from '@/lib/contracts/messaging'
import { nextArchiveCursor } from '@/lib/api/archive'
import { currentConversationCapabilities } from './access'
import { getInbox } from './service'

const hitSchema = z.array(z.object({ id: z.uuid(), at: z.string().datetime(), blocked: z.boolean() }).strict()).max(51)

/** Classify before paginating so old requests never disappear behind Primary rows. */
export function socialInboxPipeline(userId: string, query: MessageInboxQuery): Prisma.InputJsonObject[] {
  const other = { $cond: [{ $eq: ['$seeker_id', userId] }, '$lister_id', '$seeker_id'] }
  const pair = { $or: [
    { $and: [{ $eq: ['$follower_id', userId] }, { $eq: ['$followed_id', '$$other'] }] },
    { $and: [{ $eq: ['$followed_id', userId] }, { $eq: ['$follower_id', '$$other'] }] },
  ] }
  const blocks = { $or: [
    { $and: [{ $eq: ['$blocker_id', userId] }, { $eq: ['$blocked_id', '$$other'] }] },
    { $and: [{ $eq: ['$blocked_id', userId] }, { $eq: ['$blocker_id', '$$other'] }] },
  ] }
  const hasFollow = (field: string) => ({ $gt: [{ $size: { $filter: { input: '$__follows', as: 'edge', cond: { $eq: [`$$edge.${field}`, userId] } } } }, 0] })
  const listing = { $ne: [{ $ifNull: ['$kind', 'listing'] }, 'direct'] }
  const pipeline: Prisma.InputJsonObject[] = [
    { $match: { $or: [{ seeker_id: userId }, { lister_id: userId }] } },
    { $lookup: { from: 'SocialFollow', let: { other }, pipeline: [{ $match: { active: true, $expr: pair } }, { $project: { _id: 0, follower_id: 1, followed_id: 1 } }], as: '__follows' } },
    { $lookup: { from: 'SocialBlock', let: { other }, pipeline: [{ $match: { active: true, $expr: blocks } }, { $limit: 1 }, { $project: { _id: 1 } }], as: '__blocks' } },
    { $lookup: { from: 'Message', let: { id: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$conversation_id', '$$id'] } } }, { $limit: 1 }, { $project: { _id: 1 } }], as: '__messages' } },
    { $set: { __primary: { $or: [listing, { $eq: [{ $type: '$accepted_at' }, 'date'] }, { $and: [hasFollow('follower_id'), hasFollow('followed_id')] }] } } },
    // Blocked direct conversations are hidden. Listing history remains readable.
    // Do not show empty invitations to their recipient before a message exists.
    { $match: { $expr: { $or: [listing, { $and: [
      { $eq: [{ $size: '$__blocks' }, 0] },
      { $in: ['$initiated_by', ['$seeker_id', '$lister_id']] },
      { $or: [{ $eq: ['$initiated_by', userId] }, '$__primary', { $gt: [{ $size: '$__messages' }, 0] }] },
    ] }] } } },
    { $set: { __folder: { $cond: ['$__primary', 'primary', { $cond: [{ $eq: ['$initiated_by', userId] }, 'sent', 'requests'] }] } } },
    { $match: { __folder: query.folder } },
  ]
  const at = { $dateToString: { date: '$updatedAt', format: '%Y-%m-%dT%H:%M:%S.%LZ', timezone: 'UTC' } }
  if (query.cursor) pipeline.push({ $match: { $expr: { $or: [
    { $lt: [at, query.cursor.createdAt.toISOString()] },
    { $and: [{ $eq: [at, query.cursor.createdAt.toISOString()] }, { $lt: ['$_id', query.cursor.id] }] },
  ] } } })
  pipeline.push({ $sort: { updatedAt: -1, _id: -1 } }, { $limit: query.limit + 1 }, { $project: { _id: 0, id: '$_id', at, blocked: { $gt: [{ $size: '$__blocks' }, 0] } } })
  return pipeline
}

export async function getConversationInboxPage(userId: string, query: MessageInboxQuery) {
  if (!await socialPrepared() && query.folder === 'primary') {
    // An additive setup must not hide existing listing correspondence. Until
    // social block constraints are prepared, expose history read-only.
    const rows = await getInbox(userId, query)
    return messageInboxPageSchema.parse({ items: rows.slice(0, query.limit).map(row => {
      const seeker = row.seeker_id === userId, read = seeker ? row.seeker_read_at : row.lister_read_at, last = row.messages[0]
      return { id: row.id, listingId: row.listing_id, updatedAt: row.updatedAt.toISOString(), otherId: seeker ? row.lister_id : row.seeker_id,
        otherName: (seeker ? row.lister.username : row.seeker.username) ?? 'Rentral member', lastMessage: last?.body ?? null,
        unread: Boolean(last && last.sender_id !== userId && (!read || last.createdAt > read)),
        kind: 'listing', folder: 'primary', requestIncoming: false, canAccept: false, canSend: false }
    }), limit: query.limit, nextCursor: nextArchiveCursor(rows.map(row => ({ id: row.id, createdAt: row.updatedAt })), query.limit) })
  }
  await assertSocialReady()
  const hits = hitSchema.parse(await prisma.conversation.aggregateRaw({ pipeline: socialInboxPipeline(userId, query), options: { maxTimeMS: 10000 } }))
  const rows = hits.length ? await prisma.conversation.findMany({
    where: { id: { in: hits.slice(0, query.limit).map(hit => hit.id) }, OR: [{ seeker_id: userId }, { lister_id: userId }] },
    select: {
      id: true, listing_id: true, seeker_id: true, lister_id: true, kind: true, initiated_by: true, accepted_at: true, accepted_by: true,
      updatedAt: true, seeker_read_at: true, lister_read_at: true,
      seeker: { select: { username: true, closed_at: true, suspended_at: true } },
      lister: { select: { username: true, closed_at: true, suspended_at: true } },
      messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { body: true, sender_id: true, createdAt: true } },
    },
  }) : []
  const items = []
  for (const hit of hits.slice(0, query.limit)) {
    const row = rows.find(row => row.id === hit.id)
    if (!row) continue
    const unavailable = Boolean(row.seeker.closed_at || row.seeker.suspended_at || row.lister.closed_at || row.lister.suspended_at)
    if (row.kind === 'direct' && unavailable) continue
    const state = await currentConversationCapabilities(userId, row, Boolean(row.messages.length))
    if (!state || state.folder !== query.folder) continue
    const seeker = row.seeker_id === userId, read = seeker ? row.seeker_read_at : row.lister_read_at, last = row.messages[0]
    items.push({
      id: row.id, listingId: row.listing_id, updatedAt: row.updatedAt.toISOString(),
      otherName: (seeker ? row.lister.username : row.seeker.username) ?? 'Rentral member', lastMessage: last?.body ?? null,
      unread: Boolean(last && last.sender_id !== userId && (!read || last.createdAt > read)),
      ...state, canSend: state.canSend && !hit.blocked && !unavailable,
    })
  }
  // Cursor comes from the scanned boundary even if a concurrent block removed a row.
  return messageInboxPageSchema.parse({ items, limit: query.limit, nextCursor: nextArchiveCursor(hits.map(hit => ({ id: hit.id, createdAt: new Date(hit.at) })), query.limit) })
}
