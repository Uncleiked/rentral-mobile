import { z } from 'zod'
import { assertMatchingReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { archiveBoundary, nextArchiveCursor, type ArchiveQuery } from '@/lib/api/archive'
import { lockMatchingUsers, matchingUnavailable } from './access'
import { matchingBlockPageSchema } from './contracts'

export async function setMatchingBlock(actor: string, profileId: string, blocked: boolean): Promise<void> {
  await assertMatchingReady()
  z.uuid().parse(profileId)
  await withTransaction(async tx => {
    const target = await tx.matchProfile.findUnique({ where: { id: profileId }, select: { user_id: true } })
    if (!target || target.user_id === actor) throw matchingUnavailable()
    if (blocked) {
      await lockMatchingUsers(tx, actor, target.user_id)
      await tx.matchBlock.upsert({ where: { blocker_id_blocked_id: { blocker_id: actor, blocked_id: target.user_id } }, update: {}, create: { blocker_id: actor, blocked_id: target.user_id } })
      await tx.matchConnection.updateMany({ where: { OR: [{ lower_user_id: actor, upper_user_id: target.user_id }, { lower_user_id: target.user_id, upper_user_id: actor }],
        status: { in: ['requested', 'accepted'] } }, data: { status: 'closed', closed_at: new Date(), last_activity_at: new Date(), revision: { increment: 1 } } })
    } else {
      if (!await lockRecord(tx, 'user', actor)) throw matchingUnavailable()
      await tx.matchBlock.deleteMany({ where: { blocker_id: actor, blocked_id: target.user_id } })
      // Removing a block never restores a previously closed contact automatically.
    }
  })
}
export async function ownMatchingBlocks(actor: string, query: ArchiveQuery) {
  await assertMatchingReady()
  return withTransaction(async tx => {
    const rows = await tx.matchBlock.findMany({ where: { blocker_id: actor, ...archiveBoundary(query.cursor) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 })
    const page = rows.slice(0, query.limit), ids = page.map(block => block.blocked_id)
    const users = ids.length ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }) : []
    const profiles = ids.length ? await tx.matchProfile.findMany({ where: { user_id: { in: ids } }, select: { id: true, user_id: true } }) : []
    const result = matchingBlockPageSchema.safeParse({ items: page.map(block => ({ id: block.id,
      profileId: profiles.find(profile => profile.user_id === block.blocked_id)?.id ?? null,
      username: users.find(user => user.id === block.blocked_id)?.username ?? null, createdAt: block.createdAt.toISOString() })),
      nextCursor: nextArchiveCursor(rows, query.limit), limit: query.limit })
    if (!result.success) throw matchingUnavailable()
    return result.data
  })
}
