import { z } from 'zod'

export const COMMERCIAL_PRICE_VERSION = 'commercial-v1'
export const commercialEnvironmentSchema = z.enum(['test', 'live'])
export const commercialKindSchema = z.enum(['insights', 'sponsorship'])
export type CommercialKind = z.infer<typeof commercialKindSchema>
export class CommercialError extends Error {
  constructor(message: string, readonly code = 'COMMERCIAL_UNAVAILABLE', readonly status = 409) { super(message) }
}
const exact = /^[1-9]\d{0,11}$/
export const commercialMoneySchema = z.string().regex(exact).refine(value => exact.test(value) && BigInt(value) <= BigInt(100000000000), 'Use a positive bounded integer amount in kobo.')
const days = z.number().int().min(1).max(366)
export const commercialOrderInputSchema = z.object({ clientId: z.uuid(), kind: commercialKindSchema, campaignId: z.uuid().optional() }).strict()
  .refine(value => value.kind === 'sponsorship' ? Boolean(value.campaignId) : !value.campaignId, 'A sponsorship order must identify its reviewed campaign.')
export const campaignInputSchema = z.object({ clientId: z.uuid(), listingId: z.uuid(), headline: z.string().trim().min(5).max(80), startsAt: z.string().datetime({ offset: true }) }).strict()
export const campaignDecisionSchema = z.object({ decision: z.enum(['approve', 'reject', 'pause']), reason: z.string().trim().min(30).max(2000) }).strict()
export function campaignPeriod(start: Date, serviceDays: number, now = new Date()): { startsAt: Date; endsAt: Date } {
  if (!Number.isFinite(start.getTime()) || start < now || start.getTime() > now.getTime() + 366 * 86400000) throw new CommercialError('Choose a campaign start between now and the next year.', 'INVALID_CAMPAIGN_PERIOD')
  return { startsAt: start, endsAt: new Date(start.getTime() + days.parse(serviceDays) * 86400000) }
}
