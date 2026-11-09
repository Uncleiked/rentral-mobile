import { z } from 'zod'
import { platformEnabled } from '@/lib/platform'
import { paymentsEnabled } from '@/lib/payments/config'
import { paystackEnvironment } from '@/lib/payments/providers/paystack/client'
import { COMMERCIAL_PRICE_VERSION, CommercialError, commercialMoneySchema, type CommercialKind } from './policy'

export function commercialEnvironment(): 'test' | 'live' | null {
  try { return paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim()) }
  catch { return null }
}
export function commercialEnabled(): boolean { return platformEnabled() && process.env.COMMERCIAL_ENABLED === 'true' && paymentsEnabled() && commercialEnvironment() !== null }
export function commercialTerms(kind: CommercialKind) {
  if (!commercialEnabled()) throw new CommercialError('Commercial purchases are not available yet. Existing purchase history is preserved.', 'COMMERCIAL_DISABLED', 503)
  const price = commercialMoneySchema.safeParse(process.env[kind === 'insights' ? 'INSIGHTS_PRICE_KOBO' : 'SPONSORSHIP_PRICE_KOBO'])
  const rawDays = process.env[kind === 'insights' ? 'INSIGHTS_TERM_DAYS' : 'SPONSORSHIP_TERM_DAYS'] ?? (kind === 'insights' ? '30' : '7')
  const term = z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().int().min(1).max(366)).safeParse(rawDays)
  const environment = commercialEnvironment()
  if (!price.success || !term.success || !environment) throw new CommercialError('Pricing needs operator configuration before this purchase is available.', 'COMMERCIAL_PRICING_UNAVAILABLE', 503)
  return { kind, amountKobo: price.data, serviceDays: term.data, currency: 'NGN' as const, billingEnvironment: environment, priceVersion: COMMERCIAL_PRICE_VERSION }
}
