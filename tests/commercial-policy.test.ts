import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { campaignInputSchema, campaignPeriod, commercialMoneySchema, commercialOrderInputSchema } from '@/lib/commerce/policy'
import { commercialEnabled, commercialTerms } from '@/lib/commerce/config'

beforeEach(() => {
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('COMMERCIAL_ENABLED', 'true')
  vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned-commercial-fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'test')
  vi.stubEnv('INSIGHTS_PRICE_KOBO', '100025'); vi.stubEnv('SPONSORSHIP_PRICE_KOBO', '200000'); vi.stubEnv('INSIGHTS_TERM_DAYS', '30'); vi.stubEnv('SPONSORSHIP_TERM_DAYS', '7')
})
afterEach(() => vi.unstubAllEnvs())
it('snapshots exact configured commercial prices, terms and Paystack environment without recurring mandates', () => {
  expect(commercialTerms('insights')).toEqual({ kind: 'insights', amountKobo: '100025', serviceDays: 30, currency: 'NGN', billingEnvironment: 'test', priceVersion: 'commercial-v1' })
  expect(commercialTerms('sponsorship').serviceDays).toBe(7)
})
it.each(['0', '-1', '1.5', '1e4', '01', '100000000001'])('fails closed on invalid configured prices %s', price => {
  vi.stubEnv('INSIGHTS_PRICE_KOBO', price)
  expect(() => commercialTerms('insights')).toThrow('Pricing needs operator configuration')
  expect(commercialMoneySchema.safeParse(price).success).toBe(false)
})
it.each(['0', '1.0', '1e2', '367', '01'])('fails closed on invalid configured term %s', term => {
  vi.stubEnv('INSIGHTS_TERM_DAYS', term)
  expect(() => commercialTerms('insights')).toThrow('Pricing needs operator configuration')
})
it('requires explicit commercial/payment gates and matching provider credentials', () => {
  vi.stubEnv('COMMERCIAL_ENABLED', 'false'); expect(commercialEnabled()).toBe(false)
  expect(() => commercialTerms('insights')).toThrow('not available')
  vi.stubEnv('COMMERCIAL_ENABLED', 'true'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'live'); expect(commercialEnabled()).toBe(false)
})
it('rejects client prices/actors and binds sponsorship orders to a campaign', () => {
  const clientId = '11111111-1111-4111-8111-111111111111'
  expect(commercialOrderInputSchema.safeParse({ clientId, kind: 'insights', amountKobo: '1' }).success).toBe(false)
  expect(commercialOrderInputSchema.safeParse({ clientId, kind: 'insights', userId: clientId }).success).toBe(false)
  expect(commercialOrderInputSchema.safeParse({ clientId, kind: 'sponsorship' }).success).toBe(false)
  expect(commercialOrderInputSchema.safeParse({ clientId, kind: 'insights', campaignId: clientId }).success).toBe(false)
  expect(campaignInputSchema.safeParse({ clientId, listingId: clientId, headline: 'Owned test ad', startsAt: new Date().toISOString(), isApproved: true }).success).toBe(false)
})
it('uses a fixed reviewed campaign window and rejects past or remote-future starts', () => {
  const now = new Date('2030-01-01T00:00:00Z'), start = new Date('2030-01-02T00:00:00Z')
  expect(campaignPeriod(start, 7, now)).toEqual({ startsAt: start, endsAt: new Date('2030-01-09T00:00:00Z') })
  expect(() => campaignPeriod(new Date('2029-01-01'), 7, now)).toThrow('campaign start')
  expect(() => campaignPeriod(new Date('2032-01-01'), 7, now)).toThrow('campaign start')
})
