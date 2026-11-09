import { z } from 'zod'
import prisma from '@/lib/db'
import { assertCommercialReady } from '@/lib/database/readiness'
import { hasStaffPermission } from '@/lib/auth/roles'
import { archiveBoundary, nextArchiveCursor } from '@/lib/api/archive'
import { commercialQuerySchema } from '@/lib/api/commerce'
import { sponsoredCampaignDto } from './views'
export const campaignQueueSchema = commercialQuerySchema.safeExtend({ status: z.enum(['pending_review', 'approved', 'paused']).default('pending_review') })
export async function requireCampaignReviewer(actorId: string): Promise<void> {
  if (!await hasStaffPermission(actorId, 'ad:review')) throw new Error('Staff access required.')
}
export async function campaignReviewQueue(actorId: string, input: z.infer<typeof campaignQueueSchema>) {
  await assertCommercialReady(); await requireCampaignReviewer(actorId)
  const rows = await prisma.sponsoredCampaign.findMany({ where: { status: input.status, user_id: { not: actorId }, ...archiveBoundary(input.cursor) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 })
  const page = rows.slice(0, input.limit), ids = page.map(row => row.user_id)
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }) : []
  return { items: page.map(row => ({ ...sponsoredCampaignDto(row), ownerHandle: users.find(user => user.id === row.user_id)?.username ?? null })), nextCursor: nextArchiveCursor(rows, input.limit), limit: input.limit }
}
