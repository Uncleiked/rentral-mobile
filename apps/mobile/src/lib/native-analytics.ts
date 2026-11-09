import { z } from 'zod'
import { coarseNeighborhood, insightEventSchema } from '../../../../lib/analytics/policy'
import type { DiscoveryFilters } from './discovery-input'
import { api } from './api'
import { memberResponse } from './member-api'
import { analyticsPrivacySchema } from './member-contracts'
import { createNativeAnalytics } from './native-analytics-core'

export const nativeAnalytics = createNativeAnalytics({
  consent: async actorId => memberResponse(analyticsPrivacySchema, await api<unknown>('/privacy/analytics', { expectedUserId: actorId })),
  post: async (actorId, body) => memberResponse(z.object({ recorded: z.boolean() }).strict(), await api<unknown>('/privacy/analytics/events', { method: 'POST', body, expectedUserId: actorId })).recorded,
})
type Observation = z.infer<typeof insightEventSchema>
const sourceListing = z.object({ category: z.enum(['house', 'car', 'boat']), intent: z.string(), location: z.string(), price: z.string(), metadata: z.record(z.string(), z.unknown()) })
const sourceCheckout = z.object({ listing: z.object({ category: z.enum(['house', 'car', 'boat']), location: z.string() }) })
function observation(value: unknown): Observation | null { const parsed = insightEventSchema.safeParse(value); return parsed.success ? parsed.data : null }
function budgetBand(value: string): Observation['budgetBand'] {
  const normalized = value.replace(/^₦/, '').replaceAll(',', ''), matched = /^(\d{1,14})(?:\.\d{1,2})?$/.exec(normalized)
  if (!matched) return 'unspecified'
  const whole = BigInt(matched[1])
  return whole < BigInt(1000000) ? 'under-1m' : whole < BigInt(3000000) ? '1m-3m' : whole < BigInt(5000000) ? '3m-5m' : '5m-plus'
}
function intent(value: string): Observation['intent'] { return ['rent', 'buy', 'squat', 'shortlet'].includes(value) ? value as Observation['intent'] : 'rent' }
function bedrooms(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && /^\d{1,2}$/.test(value) ? Number(value) : value
  return typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 0 && parsed <= 30 ? parsed : undefined
}
export function searchObservation(filters: DiscoveryFilters): Observation | null {
  if (filters.category === 'all') return null
  return observation({ event: 'search', category: filters.category, intent: intent(filters.intent), neighborhood: coarseNeighborhood(`${filters.q} ${filters.state}`),
    budgetBand: budgetBand(filters.maxPrice || filters.minPrice), ...(filters.category === 'house' && bedrooms(filters.bedrooms) !== undefined ? { bedrooms: bedrooms(filters.bedrooms) } : {}) })
}
export function listingObservation(value: unknown): Observation | null {
  const source = sourceListing.safeParse(value)
  if (!source.success) return null
  const listing = source.data
  return observation({ event: 'detail', category: listing.category, intent: intent(listing.intent), neighborhood: coarseNeighborhood(listing.location), budgetBand: budgetBand(listing.price),
    ...(listing.category === 'house' && bedrooms(listing.metadata.bedrooms) !== undefined ? { bedrooms: bedrooms(listing.metadata.bedrooms) } : {}) })
}
export function checkoutObservation(value: unknown): Observation | null {
  const source = sourceCheckout.safeParse(value)
  if (!source.success) return null
  const booking = source.data
  // A checkout is an attempt, never evidence of payment. Do not infer an asset's
  // price band from an inspection fee, holding commitment or multi-day total.
  return observation({ event: 'checkout', category: booking.listing.category, neighborhood: coarseNeighborhood(booking.listing.location), budgetBand: 'unspecified' })
}
