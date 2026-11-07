import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), find: vi.fn(), transactionFind: vi.fn(), update: vi.fn(), raw: vi.fn(), count: vi.fn(), review: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireVerifiedUserId: mocks.identity, revalidateProfilePaths: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: mocks.find }, $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
  $queryRaw: mocks.raw, listing: { findFirst: mocks.transactionFind, update: mocks.update }, booking: { count: mocks.count }, documentReview: { updateMany: mocks.review },
}) } }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
import { updateListing } from '@/app/actions/listingActions'

const data = { listingId: '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d', address: 'Changed address, Lagos', basePrice: '500000', metadata: { bedrooms: '2', bathrooms: '2', sizeSqm: '80', amenities: '' } }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  mocks.identity.mockResolvedValue('user-1'); mocks.find.mockResolvedValue({ id: data.listingId, category: 'house', listing_status: 'active', lister: { username: 'host' } })
  mocks.transactionFind.mockResolvedValue({ text_address: 'Original address, Lagos' }); mocks.count.mockResolvedValue(0)
})
afterEach(() => vi.unstubAllEnvs())

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
