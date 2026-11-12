import { describe, expect, it } from 'vitest'
import { filterOwnerListings, ownerListingFilter, ownerListingGroup, ownerListingHref } from '@/lib/listings/owner-inventory'
import type { ListingSummary } from '@/lib/profile-data'

function listing(id: string, status: string, rest: Partial<ListingSummary> = {}): ListingSummary {
  return { id, status, title: 'Yaba studio', price: '500,000', priceDenomination: 'year', posterUrl: null, videoUrl: null, useMux: false, media: null, badges: ['House'], ...rest }
}
describe('private owner inventory', () => {
  it('keeps submitted rows out of Drafts while discoverable in All and Submitted', () => {
    const rows = [listing('draft', 'draft'), listing('submitted', 'pending_verification', { mediaSource: 'approved_gallery' }), listing('live', 'active')]
    expect(filterOwnerListings(rows, 'draft', '').map(row => row.id)).toEqual(['draft'])
    expect(filterOwnerListings(rows, 'submitted', '').map(row => row.id)).toEqual(['submitted'])
    expect(filterOwnerListings(rows, 'all', '')).toHaveLength(3)
  })
  it('prioritizes archive state and avoids offering an archived draft editor', () => {
    const row = listing('saved/private-id', 'draft', { archivedAt: '2026-11-12T10:00:00.000Z', mediaSource: 'approved_gallery' })
    expect(ownerListingGroup(row)).toBe('archived')
    expect(ownerListingHref(row)).toBe('/marketplace/listing/saved%2Fprivate-id')
  })
  it('resumes gallery drafts in the same gallery flow and searches complete words without case sensitivity', () => {
    const row = listing('draft-42', 'draft', { mediaSource: 'approved_gallery', title: 'Sunny Yaba Studio' })
    expect(ownerListingHref(row)).toBe('/marketplace/listing/create?draft=draft-42&gallery=1')
    expect(filterOwnerListings([row], 'draft', '  YABA house ')).toEqual([row])
    expect(filterOwnerListings([row], 'all', '42')).toEqual([row])
    expect(filterOwnerListings([row], 'draft', 'yaba boat')).toEqual([])
  })
  it('shows suspended or unfamiliar private statuses under Needs attention and sanitizes a URL filter', () => {
    expect(ownerListingGroup(listing('suspended', 'suspended'))).toBe('attention')
    expect(ownerListingGroup(listing('unknown', 'future-private-state'))).toBe('attention')
    expect(ownerListingFilter('arbitrary')).toBe('all')
  })
})
