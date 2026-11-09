import { z } from 'zod'
import { commercialEnvironmentSchema, commercialKindSchema, commercialMoneySchema } from './policy'
import { NEIGHBORHOODS } from '../analytics/policy'

const date = z.string().datetime({ offset: true })
export const commercialOrderSchema = z.object({ id: z.uuid(), clientId: z.uuid(), kind: commercialKindSchema,
  status: z.enum(['created', 'awaiting_payment', 'paid', 'requires_review', 'cancelled']), currency: z.literal('NGN'), amountKobo: commercialMoneySchema,
  serviceDays: z.number().int().min(1).max(366), priceVersion: z.literal('commercial-v1'), billingEnvironment: commercialEnvironmentSchema,
  campaignId: z.uuid().nullable(), paidAt: date.nullable(), createdAt: date, updatedAt: date,
  payments: z.array(z.object({ id: z.uuid(), reference: z.string().min(1).max(160), status: z.string().min(1).max(40), billingEnvironment: commercialEnvironmentSchema, createdAt: date }).strict()).max(20),
}).strict()
export const sponsoredCampaignSchema = z.object({ id: z.uuid(), listingId: z.uuid(), orderId: z.uuid().nullable(), headline: z.string().min(5).max(80),
  status: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'paused', 'cancelled']), billingEnvironment: commercialEnvironmentSchema,
  startsAt: date, endsAt: date, reviewedAt: date.nullable(), decisionReason: z.string().max(2000).nullable(), createdAt: date, updatedAt: date }).strict()
export const insightEntitlementSchema = z.object({ id: z.uuid(), orderId: z.uuid(), billingEnvironment: commercialEnvironmentSchema,
  startsAt: date, endsAt: date, status: z.enum(['active', 'revoked']) }).strict()
export const commercialOverviewSchema = z.object({ enabled: z.boolean(), billingEnvironment: commercialEnvironmentSchema.nullable(),
  terms: z.array(z.object({ kind: commercialKindSchema, amountKobo: commercialMoneySchema, serviceDays: z.number().int().min(1).max(366),
    currency: z.literal('NGN'), billingEnvironment: commercialEnvironmentSchema, priceVersion: z.literal('commercial-v1') }).strict()).max(2),
  orders: z.array(commercialOrderSchema).max(25), campaigns: z.array(sponsoredCampaignSchema).max(25), entitlements: z.array(insightEntitlementSchema).max(25),
  ordersNextCursor: z.string().nullable(), campaignsNextCursor: z.string().nullable(), insightsAccess: z.boolean(), internalInsightsAccess: z.boolean(),
}).strict()
export type CommercialOrderDto = z.infer<typeof commercialOrderSchema>
export type SponsoredCampaignDto = z.infer<typeof sponsoredCampaignSchema>
export const commercialCheckoutSchema = z.object({ url: z.string().max(2000).url().refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'checkout.paystack.com' && !url.username && !url.password && !url.port }
  catch { return false }
}) }).strict()
const reportCount = z.preprocess(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const entries = Object.entries(value)
  return entries.length === 1 && ['$numberInt', '$numberLong'].includes(entries[0][0]) && typeof entries[0][1] === 'string' && /^\d+$/.test(entries[0][1]) ? Number(entries[0][1]) : value
}, z.number().int().min(10).max(Number.MAX_SAFE_INTEGER))
export const insightObservationSchema = z.object({ month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/), event: z.enum(['search', 'detail', 'checkout', 'verified_booking']),
  category: z.enum(['house', 'car', 'boat']), intent: z.enum(['rent', 'buy', 'squat', 'shortlet']), neighborhood: z.enum(NEIGHBORHOODS),
  budgetBand: z.enum(['unspecified', 'under-1m', '1m-3m', '3m-5m', '5m-plus']), people: reportCount, observations: reportCount }).strict()
export const insightsReportSchema = z.object({ generatedAt: z.string().datetime({ offset: true }), windowStart: z.string().datetime({ offset: true }),
  minimumContributors: z.literal(10), internalAccess: z.boolean(), items: z.array(insightObservationSchema).max(160) }).strict()
export const campaignMetricsSchema = z.object({ campaignId: z.uuid(), minimumContributors: z.literal(10), windowStart: date,
  items: z.array(z.object({ month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/), event: z.enum(['sponsored_impression', 'sponsored_click']), people: reportCount, observations: reportCount }).strict()).max(8) }).strict()
const sponsoredListingSchema = z.object({ id: z.uuid(), title: z.string().max(100), category: z.enum(['house', 'car', 'boat']), location: z.string().max(200),
  price: z.string().max(100), pricePeriod: z.string().max(20), intent: z.enum(['rent', 'buy', 'squat', 'shortlet']), posterUrl: z.string().max(4000).nullable(), videoUrl: z.string().max(4000).nullable(),
  useMux: z.boolean(), mediaEndpoint: z.string().max(150), badges: z.array(z.string().max(100)).max(10), saved: z.boolean(), savingAvailable: z.boolean(), holdUntil: date.nullable(),
  host: z.object({ username: z.string().regex(/^[a-z0-9_]{3,24}$/), avatarUrl: z.string().max(1000).nullable(), identityVerified: z.boolean() }).strict() }).strict()
export const sponsoredPageSchema = z.object({ items: z.array(z.object({ campaignId: z.uuid(), headline: z.string().min(5).max(80), adLabel: z.literal('Sponsored'), billingEnvironment: commercialEnvironmentSchema,
  endsAt: date, listing: sponsoredListingSchema }).strict()).max(3) }).strict()
