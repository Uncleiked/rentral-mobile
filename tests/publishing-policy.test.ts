import { describe, expect, it } from 'vitest'
import { validPublicationGrant, freePostingGranted, directPublishingGranted, galleryPublishingGranted, publicationReviewBypassed } from '@/lib/listings/publishing-policy'
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

it('uses current gallery revision as gallery-only review bypass without inventing a direct grant or free posting', () => {
  const gallery = { gallery_upload_allowed: true, gallery_permission_revision: 3 }
  expect(galleryPublishingGranted(gallery)).toBe(true)
  expect(publicationReviewBypassed(gallery, 'approved_gallery')).toBe(true)
  expect(publicationReviewBypassed(gallery, 'recorded')).toBe(false)
  expect(directPublishingGranted(gallery)).toBe(false)
  expect(freePostingGranted(gallery)).toBe(false)
  expect(galleryPublishingGranted({ gallery_upload_allowed: true })).toBe(true)
  for (const revision of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(galleryPublishingGranted({ ...gallery, gallery_permission_revision: revision })).toBe(false)
  expect(publicationReviewBypassed({ ...gallery, gallery_upload_allowed: false }, 'approved_gallery')).toBe(false)
})
