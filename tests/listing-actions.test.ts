import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userId: vi.fn(), transaction: vi.fn(), query: vi.fn(), execute: vi.fn(), update: vi.fn(), create: vi.fn(), revalidate: vi.fn(), mediaCreate: vi.fn(),
}))
vi.mock('@/lib/action-helpers', () => ({ requireVerifiedUserId: mocks.userId, revalidateProfilePaths: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction } }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('next/server', () => ({ after: vi.fn() }))
import { saveListing, saveDraft, updateListing } from '@/app/actions/listingActions'

const input = {
  draftId: '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d', category: 'house',
  address: 'Test property address', basePrice: '500000',
  metadata: { bedrooms: '2', bathrooms: '2', sizeSqm: '80', amenities: '' },
  videoPath: 'user-1/folder/video.webm', documentPath: 'user-1/folder/deed.pdf',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MUX_ENABLED', 'false')
  mocks.userId.mockResolvedValue('user-1')
  const tx = { $queryRaw: mocks.query, $executeRaw: mocks.execute, listing: { update: mocks.update, create: mocks.create }, mediaAsset: { create: mocks.mediaCreate } }
  mocks.transaction.mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx))
  mocks.update.mockResolvedValue({ id: input.draftId, lister: { username: 'renter' } })
})

afterEach(() => vi.unstubAllEnvs())

it.each([saveListing, saveDraft, updateListing])('blocks a direct mutation without verified eligibility', async action => {
  mocks.userId.mockResolvedValue(null)
  expect(await action(input)).toMatchObject({ success: false })
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it('rejects references to another owner\'s media before writing', async () => {
  expect(await saveListing({ ...input, videoPath: 'someone-else/folder/video.webm' })).toMatchObject({ success: false })
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it('rejects a missing or already submitted draft within the transaction', async () => {
  mocks.query.mockResolvedValue([])
  expect(await saveListing(input)).toMatchObject({ success: false, error: 'Draft not found or already submitted.' })
  expect(mocks.update).not.toHaveBeenCalled()
})

it('refuses inherited GPS when the locked row contains different footage', async () => {
  mocks.query.mockResolvedValue([{ has_coords: true, video_path: 'user-1/folder/replacement.webm' }])
  expect(await saveListing(input)).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})

it('submits a valid owner draft for verification, never directly for publication', async () => {
  mocks.query.mockResolvedValue([{ has_coords: true, video_path: input.videoPath }])
  expect(await saveListing(input)).toMatchObject({ success: true, listingId: input.draftId })
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: input.draftId }, data: { listing_status: 'pending_verification' } })
})

it('does not instruct clients to delete committed media when cache refresh fails', async () => {
  mocks.query.mockResolvedValue([{ has_coords: true, video_path: input.videoPath }])
  mocks.revalidate.mockImplementation(() => { throw new Error('cache unavailable') })
  expect(await saveListing(input)).toMatchObject({ success: true, listingId: input.draftId })
})

it('atomically queues media with a submitted listing when configured', async () => {
  vi.stubEnv('MUX_ENABLED', 'true')
  for (const key of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) vi.stubEnv(key, 'test-only')
  try {
    mocks.query.mockResolvedValue([{ has_coords: true, video_path: input.videoPath }])
    expect(await saveListing(input)).toMatchObject({ success: true })
    expect(mocks.mediaCreate).toHaveBeenCalledWith({ data: { listing_id: input.draftId, source_path: input.videoPath } })
  } finally {
    vi.unstubAllEnvs()
  }
})
