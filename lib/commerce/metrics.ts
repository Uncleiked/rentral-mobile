import prisma from '@/lib/db'
import { assertCommercialReady } from '@/lib/database/readiness'
import { hasStaffPermission } from '@/lib/auth/roles'
import { campaignMetricsSchema } from './contracts'
import { CommercialError } from './policy'

export async function campaignMetrics(actorId: string, id: string) {
  await assertCommercialReady()
  const campaign = await prisma.sponsoredCampaign.findUnique({ where: { id }, select: { id: true, user_id: true } })
  if (!campaign || (campaign.user_id !== actorId && !await hasStaffPermission(actorId, 'ad:review'))) throw new CommercialError('This campaign is unavailable.', 'NOT_FOUND', 404)
  const now = new Date(), first = new Date(Math.max(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1), now.getTime() - 90 * 86400000)).toISOString()
  const rows: unknown = await prisma.marketEvent.aggregateRaw({ pipeline: [
    { $match: { campaign_id: id, event_type: { $in: ['sponsored_impression', 'sponsored_click'] }, createdAt: { $gte: { $date: first }, $lte: { $date: now.toISOString() } } } },
    { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } }, event: '$event_type', subject: '$subject_hash' }, observations: { $sum: 1 } } },
    { $group: { _id: { month: '$_id.month', event: '$_id.event' }, people: { $sum: 1 }, observations: { $sum: '$observations' } } },
    { $match: { people: { $gte: 10 } } }, { $sort: { '_id.month': -1, '_id.event': 1 } }, { $limit: 8 },
    { $project: { _id: 0, month: '$_id.month', event: '$_id.event', people: 1, observations: 1 } },
  ], options: { maxTimeMS: 5000 } })
  return campaignMetricsSchema.parse({ campaignId: id, minimumContributors: 10, windowStart: first, items: rows })
}
