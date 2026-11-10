import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: vi.fn(async () => undefined) }))

const mocks = vi.hoisted(() => ({ identity: vi.fn(), find: vi.fn(), transactionFind: vi.fn(), update: vi.fn(), raw: vi.fn(), count: vi.fn(), review: vi.fn(), capture: vi.fn(), geocode: vi.fn(), verification: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireVerifiedUserId: mocks.identity, revalidateProfilePaths: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: mocks.find }, $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
  $queryRaw: mocks.raw, listing: { findFirst: mocks.transactionFind, update: mocks.update }, booking: { count: mocks.count }, documentReview: { updateMany: mocks.review },
}) } }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.raw, withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ listing: { findFirst: mocks.transactionFind, update: mocks.update }, booking: { count: mocks.count }, documentReview: { updateMany: mocks.review }, listingVerification: { upsert: mocks.verification } }) }))
vi.mock('@/lib/listings/capture', () => ({ readCaptureForSubmission: mocks.capture }))
vi.mock('@/lib/listings/spatial', async original => ({ ...await original<typeof import('@/lib/listings/spatial')>(), geocodeListingAddress: mocks.geocode }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
import { updateListing } from '@/app/actions/listingActions'
import { AccountUnavailableError, assertActiveAccounts } from '@/lib/accounts/availability'

const data = { listingId: '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d', address: 'Changed address, Lagos', basePrice: '500000', metadata: { bedrooms: '2', bathrooms: '2', sizeSqm: '80', amenities: '' } }
const captureId = '11111111-1111-4111-8111-111111111111', videoPath = 'user-1/video.mp4'
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  mocks.identity.mockResolvedValue('user-1'); mocks.find.mockResolvedValue({ id: data.listingId, category: 'house', listing_status: 'active', text_address: 'Original address, Lagos', capture_id: captureId, video_path: videoPath, lister: { username: 'host' } })
  mocks.transactionFind.mockResolvedValue({ text_address: 'Original address, Lagos', capture_id: captureId, video_path: videoPath }); mocks.count.mockResolvedValue(0)
  mocks.capture.mockResolvedValue({ id: captureId, video_path: videoPath, start_geometry: { type: 'Point', coordinates: [3.4, 6.45] } }); mocks.geocode.mockResolvedValue({ longitude: 3.4, latitude: 6.45 })
  mocks.raw.mockResolvedValue(true)
})
afterEach(() => vi.unstubAllEnvs())

it('rejects a closed account definitively before editing a posted listing', async () => {
  vi.mocked(assertActiveAccounts).mockRejectedValueOnce(new AccountUnavailableError())
  const result = await updateListing(data)
  expect(result).toMatchObject({ success: false, code: 'ACCOUNT_UNAVAILABLE' })
  expect(result).not.toHaveProperty('uncertain', true)
  expect(mocks.update).not.toHaveBeenCalled()
})

it('removes a changed address from discovery and requires document review again', async () => {
  expect(await updateListing(data)).toEqual({ success: true })
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: data.listingId, lister_id: 'user-1' }, data: expect.objectContaining({ listing_status: 'pending_verification' }) }))
  expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'needs_review', reviewed_by: null } }))
})
it('does not relocate an asset with an existing confirmed booking', async () => {
  mocks.count.mockResolvedValue(1)
  expect(await updateListing(data)).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})
it('keeps review state when only prices or nonphysical metadata change', async () => {
  mocks.transactionFind.mockResolvedValue({ text_address: data.address })
  expect(await updateListing(data)).toEqual({ success: true })
  expect(mocks.review).not.toHaveBeenCalled()
  expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty('listing_status')
})
it('rejects a changed address that does not match the immutable recording point', async () => {
  mocks.geocode.mockResolvedValue({ longitude: 3.4, latitude: 6.5 })
  expect(await updateListing(data)).toMatchObject({ success: false, code: 'ADDRESS_MISMATCH' })
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.review).not.toHaveBeenCalled()
})
it('does not overwrite a newer posted address edit after delayed geocoding without a client revision', async () => {
  mocks.find.mockResolvedValue({ id: data.listingId, revision: 1, category: 'house', listing_status: 'pending_verification', text_address: 'Original address', capture_id: captureId, video_path: videoPath, lister: { username: 'host' } })
  mocks.transactionFind.mockResolvedValue({ revision: 2, text_address: 'Newer address', capture_id: captureId, video_path: videoPath })
  expect(await updateListing(data)).toMatchObject({ success: false, code: 'STALE_LISTING' })
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.verification).not.toHaveBeenCalled()
})
