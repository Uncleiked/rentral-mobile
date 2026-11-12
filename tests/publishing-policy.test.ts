import { describe, expect, it } from 'vitest'
import { validPublicationGrant, freePostingGranted, directPublishingGranted } from '@/lib/listings/publishing-policy'
const evidence = { allowed: true, by: '11111111-1111-4111-8111-111111111111', at: new Date('2026-11-12T00:00:00Z'), reason: 'Reviewed listing permission evidence.' }
describe('independent administrative publishing grants', () => {
  it('accepts only full issuer, date and reason evidence', () => {
    expect(validPublicationGrant(evidence)).toBe(true)
    for (const invalid of [{ allowed: false }, { by: null }, { by: 'owner' }, { at: 'invalid' }, { reason: 'short' }]) expect(validPublicationGrant({ ...evidence, ...invalid })).toBe(false)
    expect(freePostingGranted({ listing_fee_exempt: true })).toBe(false)
    expect(directPublishingGranted({ direct_publish_allowed: true })).toBe(false)
  })
  it('does not conflate waived fees with publication or gallery permissions', () => {
    const account = { listing_fee_exempt: true, listing_fee_exempt_by: evidence.by, listing_fee_exempt_at: evidence.at, listing_fee_exempt_reason: evidence.reason }
    expect(freePostingGranted(account)).toBe(true)
    expect(directPublishingGranted(account)).toBe(false)
    expect(freePostingGranted(null)).toBe(false)
  })
})
