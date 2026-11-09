import prisma from '@/lib/db'
import { z } from 'zod'
import { MINIMUM_INSIGHTS_COHORT, NEIGHBORHOODS } from './policy'

export type InsightCohort = { category: string; intent: string; neighborhood: string; budget_band: string; people: number; searches: number }

function aggregateCount(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const entries = Object.entries(value)
  if (entries.length !== 1 || !['$numberInt', '$numberLong'].includes(entries[0][0]) || typeof entries[0][1] !== 'string' || !/^\d+$/.test(entries[0][1])) return value
  return Number(entries[0][1])
}
const countSchema = z.preprocess(aggregateCount, z.number().int().min(MINIMUM_INSIGHTS_COHORT).max(Number.MAX_SAFE_INTEGER))
const insightResult = z.array(z.object({
  category: z.enum(['house', 'car', 'boat']), intent: z.enum(['rent', 'buy', 'squat', 'shortlet']),
  neighborhood: z.enum(NEIGHBORHOODS), budget_band: z.enum(['unspecified', 'under-1m', '1m-3m', '3m-5m', '5m-plus']),
  people: countSchema, searches: countSchema,
}).strict()).max(40)

export async function getMarketInsights(): Promise<InsightCohort[]> {
  // Monthly pseudonyms use UTC in ingestion, so the window must use UTC too.
  const now = new Date()
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const cohorts: unknown = await prisma.marketEvent.aggregateRaw({ pipeline: [
    { $match: { createdAt: { $gte: { $date: month } } } },
    // Count each contributor once per coarse cohort, without building an array
    // of identities in the aggregate result or exposing hashes to the caller.
    { $group: { _id: { category: '$category', intent: '$intent', neighborhood: '$neighborhood', budget_band: '$budget_band', subject: '$subject_hash' }, events: { $sum: 1 } } },
    { $group: { _id: { category: '$_id.category', intent: '$_id.intent', neighborhood: '$_id.neighborhood', budget_band: '$_id.budget_band' }, people: { $sum: 1 }, searches: { $sum: '$events' } } },
    { $match: { people: { $gte: MINIMUM_INSIGHTS_COHORT } } },
    { $sort: { searches: -1, '_id.category': 1, '_id.intent': 1, '_id.neighborhood': 1, '_id.budget_band': 1 } },
    { $limit: 40 },
    { $project: { _id: 0, category: '$_id.category', intent: '$_id.intent', neighborhood: '$_id.neighborhood', budget_band: '$_id.budget_band', people: 1, searches: 1 } },
  ], options: { maxTimeMS: 5000 } })
  // Fail closed if a malformed/stale pipeline ever returns a small cohort or
  // an identity-bearing extra field. Aggregate JSON is not a trusted TS type.
  return insightResult.parse(cohorts)
}
