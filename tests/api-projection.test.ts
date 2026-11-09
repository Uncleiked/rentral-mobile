import { expect, it } from 'vitest'
import { publicListingDetails } from '@/lib/api/projection'
import type { ListingDetails } from '@/lib/discovery'

it('allows only documented listing metadata across the mobile API boundary', () => {
  const listing: ListingDetails = {
    id: '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d', title: 'Studio home', category: 'house',
    location: 'Lekki, Lagos', price: '5,000,000', priceDenomination: 'year', intent: 'rent',
    posterUrl: '/api/listings/id/source?kind=poster', videoUrl: '/api/listings/id/source?kind=video',
    useMux: false, username: 'host', avatarUrl: null, isVerified: true, badges: ['Studio'],
    saved: false, savingAvailable: true, listerId: 'private-auth-identifier', isOwner: false,
    status: 'active', metadata: { bedrooms: '0', kitchens: '1', rentalIntent: 'rent', description: 'A sunny studio.', listingTitle: 'My studio',
      document_path: 'host/folder/private-deed.pdf', hardware_coordinates: '6.123,3.456',
      internalAuditNote: 'private review finding' },
    hostBio: 'Hello Lagos', hostSince: '2026-01-01T00:00:00.000Z', hostAccountType: 'Individual', postedOn: '2026-11-07T00:00:00.000Z',
  }
  const result = publicListingDetails(listing)
  expect(result.metadata).toEqual({ bedrooms: '0', kitchens: '1', rentalIntent: 'rent', description: 'A sunny studio.', listingTitle: 'My studio' })
  expect(result.host.username).toBe('host')
  const serialized = JSON.stringify(result)
  expect(serialized).not.toContain('private-auth-identifier')
  expect(serialized).not.toContain('private-deed')
  expect(serialized).not.toContain('hardware_coordinates')
  expect(serialized).not.toContain('private review finding')
})
