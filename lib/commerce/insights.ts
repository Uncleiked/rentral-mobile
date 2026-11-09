import prisma from '@/lib/db'
import { MINIMUM_INSIGHTS_COHORT } from '@/lib/analytics/policy'
import { insightsReportSchema } from './contracts'
import { insightsAccess } from './views'
import { CommercialError } from './policy'

/** The threshold is applied separately per event and month; totals never reveal
 * a suppressed conversion by subtracting visible interest counts. */
export async function commercialInsights(userId: string) {
  const access = await insightsAccess(userId)
  if (!access.allowed) throw new CommercialError('An active paid Insights term or current internal review role is required.', 'INSIGHTS_ACCESS_REQUIRED', 403)
  const now = new Date(), first = new Date(Math.max(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1), now.getTime() - 90 * 86400000)).toISOString()
  const rows: unknown = await prisma.marketEvent.aggregateRaw({ pipeline: [
    { $match: { createdAt: { $gte: { $date: first }, $lte: { $date: now.toISOString() } }, event_type: { $in: ['search', 'detail', 'checkout', 'verified_booking'] } } },
    { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } }, event: '$event_type', category: '$category', intent: '$intent',
      neighborhood: '$neighborhood', budgetBand: '$budget_band', subject: '$subject_hash' }, observations: { $sum: 1 } } },
    { $group: { _id: { month: '$_id.month', event: '$_id.event', category: '$_id.category', intent: '$_id.intent', neighborhood: '$_id.neighborhood', budgetBand: '$_id.budgetBand' }, people: { $sum: 1 }, observations: { $sum: '$observations' } } },
    { $match: { people: { $gte: MINIMUM_INSIGHTS_COHORT } } },
    { $sort: { '_id.month': -1, '_id.event': 1, observations: -1, '_id.category': 1, '_id.intent': 1, '_id.neighborhood': 1, '_id.budgetBand': 1 } },
    { $limit: 160 },
    { $project: { _id: 0, month: '$_id.month', event: '$_id.event', category: '$_id.category', intent: '$_id.intent', neighborhood: '$_id.neighborhood', budgetBand: '$_id.budgetBand', people: 1, observations: 1 } },
  ], options: { maxTimeMS: 5000 } })
  return insightsReportSchema.parse({ generatedAt: now.toISOString(), windowStart: first, minimumContributors: 10, internalAccess: access.internal, items: rows })
}
