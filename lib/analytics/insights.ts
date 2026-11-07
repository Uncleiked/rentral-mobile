import prisma from '@/lib/db'
import { MINIMUM_INSIGHTS_COHORT } from './policy'

export type InsightCohort = { category: string; intent: string; neighborhood: string; budget_band: string; people: number; searches: number }

export async function getMarketInsights(): Promise<InsightCohort[]> {
  return prisma.$queryRaw<InsightCohort[]>`
    SELECT category,intent,neighborhood,budget_band,
      count(DISTINCT subject_hash)::integer AS people, count(*)::integer AS searches
    FROM "MarketEvent" WHERE "createdAt">=date_trunc('month', now())
    GROUP BY category,intent,neighborhood,budget_band
    HAVING count(DISTINCT subject_hash)>=${MINIMUM_INSIGHTS_COHORT}
    ORDER BY searches DESC LIMIT 40
  `
}
