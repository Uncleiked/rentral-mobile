import { z } from 'zod'

export const NEIGHBORHOODS = ['yaba', 'surulere', 'gbagada', 'ikeja', 'lekki', 'ikoyi', 'victoria-island', 'ajah', 'lagos-other'] as const
export const insightEventSchema = z.object({ event: z.enum(['search', 'detail', 'checkout']), category: z.enum(['house', 'car', 'boat']),
  intent: z.enum(['rent', 'buy', 'squat', 'shortlet']).default('rent'), neighborhood: z.enum(NEIGHBORHOODS).default('lagos-other'),
  budgetBand: z.enum(['unspecified', 'under-1m', '1m-3m', '3m-5m', '5m-plus']).default('unspecified'),
  bedrooms: z.number().int().min(0).max(30).optional() }).strict()

export const MINIMUM_INSIGHTS_COHORT = 10

export function coarseNeighborhood(text: string): typeof NEIGHBORHOODS[number] {
  const normalized = text.toLowerCase().replaceAll(' ', '-')
  return NEIGHBORHOODS.find(area => normalized.includes(area)) ?? 'lagos-other'
}
