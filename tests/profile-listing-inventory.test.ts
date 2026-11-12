import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listings: vi.fn(), visible: vi.fn(), media: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { findMany: mocks.listings } } }))
vi.mock('@/lib/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireSessionUserId: vi.fn() }))
vi.mock('@/lib/accounts/bootstrap', () => ({ ensureAccountHandle: vi.fn() }))
vi.mock('@/lib/storage', () => ({ listingMediaUrl: (id: string, kind: string) => `/private-media/${id}/${kind}`, listingPhotoUrl: (id: string, index: number) => `/private-photo/${id}/${index}` }))
vi.mock('@/lib/listings/gallery', () => ({ galleryIsPublic: mocks.visible, galleryPhotoPaths: (row: { media_source?: string }) => row.media_source === 'approved_gallery' ? ['private-photo-path'] : [], galleryListingSelect: { media_source: true, gallery_media: true, gallery_permission_revision: true }, galleryUserSelect: { gallery_upload_allowed: true, gallery_permission_revision: true } }))
vi.mock('@/lib/media/config', () => ({ muxEnabled: () => false }))
vi.mock('@/lib/media/status', () => ({ listingMediaStatuses: mocks.media }))
import { deriveListingTitle, getListingsForProfile } from '@/lib/profile-data'

beforeEach(() => { vi.clearAllMocks(); mocks.media.mockResolvedValue(new Map()); mocks.visible.mockReturnValue(false) })
it('retains gallery drafts and submitted rows for their owner even if public gallery visibility is withdrawn', async () => {
  mocks.listings.mockResolvedValue(['draft', 'pending_verification'].map((status, index) => ({ id: 'owned-' + index, category: 'house', listing_status: status, media_source: 'approved_gallery', poster_path: null, video_path: null, base_rent_amount: 90000, asset_metadata: { listingTitle: 'My saved studio', bedrooms: '0', pricePeriod: 'month' }, archived_at: null, document_path: 'private-deed.pdf', hardware_coordinates: 'PRIVATE GPS' })))
  const rows = await getListingsForProfile('owner', { includeDrafts: true })
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ title: 'My saved studio', priceDenomination: 'month', posterUrl: '/private-photo/owned-0/0', status: 'draft' })
  expect(rows[1].status).toBe('pending_verification')
  expect(mocks.listings.mock.calls[0][0].where).toMatchObject({ lister_id: 'owner' })
  expect(mocks.listings.mock.calls[0][0].where).not.toHaveProperty('listing_status')
  expect(JSON.stringify(rows)).not.toMatch(/private-deed|PRIVATE GPS|document_path|hardware_coordinates/)
})
it('keeps visitor queries restricted to public active listings and gallery visibility checks', async () => {
  mocks.listings.mockResolvedValue([{ id: 'not-public', category: 'house', listing_status: 'active', media_source: 'approved_gallery' }])
  expect(await getListingsForProfile('owner')).toEqual([])
  expect(mocks.listings.mock.calls[0][0].where.listing_status).toEqual({ in: ['active'] })
  expect(mocks.visible).toHaveBeenCalled()
})
it('uses the entered title and keeps zero-bedroom studios meaningful when no title exists', () => {
  expect(deriveListingTitle('house', { listingTitle: '  Peaceful self-contained studio  ', bedrooms: '0' })).toBe('Peaceful self-contained studio')
  expect(deriveListingTitle('house', { bedrooms: 0 })).toBe('0 Bed House')
})
