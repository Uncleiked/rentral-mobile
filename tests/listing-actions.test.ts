import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: vi.fn(async () => undefined) }))

const mocks = vi.hoisted(() => ({
  userId: vi.fn(), transaction: vi.fn(), find: vi.fn(), lock: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), revalidate: vi.fn(), mediaCreate: vi.fn(), locationUpsert: vi.fn(), locationDelete: vi.fn(), prepareStorage: vi.fn(), claimStorage: vi.fn(),
}))
vi.mock('@/lib/action-helpers', () => ({ requireVerifiedUserId: mocks.userId, revalidateProfilePaths: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: mocks.transaction, lockRecord: mocks.lock }))
vi.mock('@/lib/storage-claims/service', () => ({ prepareListingStorage: mocks.prepareStorage, claimStorageObjects: mocks.claimStorage }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('next/server', () => ({ after: vi.fn() }))
import { saveListing, saveDraft, updateListing } from '@/app/actions/listingActions'
import { AccountUnavailableError, assertActiveAccounts } from '@/lib/accounts/availability'

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
  mocks.prepareStorage.mockResolvedValue([])
  mocks.claimStorage.mockResolvedValue(undefined)
  const tx = { listing: { findFirst: mocks.find, update: mocks.update, updateMany: mocks.updateMany, create: mocks.create }, mediaAsset: { create: mocks.mediaCreate }, listingLocation: { upsert: mocks.locationUpsert, deleteMany: mocks.locationDelete } }
  mocks.transaction.mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx))
  mocks.update.mockResolvedValue({ id: input.draftId, lister: { username: 'renter' } })
  mocks.create.mockResolvedValue({ id: input.draftId, lister: { username: 'renter' } })
  mocks.find.mockResolvedValue({ id: input.draftId, video_path: input.videoPath, privateLocation: { id: input.draftId } })
  mocks.lock.mockResolvedValue(true)
  mocks.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => vi.unstubAllEnvs())

it.each([saveListing, saveDraft, updateListing])('blocks a direct mutation without authentication', async action => {
  mocks.userId.mockResolvedValue(null)
  expect(await action(input)).toMatchObject({ success: false })
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it.each([saveListing, saveDraft])('returns a definite closed-account rejection without ambiguous-save cleanup instructions', async action => {
  vi.mocked(assertActiveAccounts).mockRejectedValueOnce(new AccountUnavailableError())
  const result = await action({ ...input, listingId: input.draftId, wizardStep: 'details' })
  expect(result).toMatchObject({ success: false, code: 'ACCOUNT_UNAVAILABLE' })
  expect(result).not.toHaveProperty('uncertain', true)
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
})

it('rejects references to another owner\'s media before writing', async () => {
  expect(await saveListing({ ...input, videoPath: 'someone-else/folder/video.webm' })).toMatchObject({ success: false })
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it('rejects a missing or already submitted draft within the transaction', async () => {
  mocks.find.mockResolvedValue(null)
  expect(await saveListing(input)).toMatchObject({ success: false, error: 'Draft not found or already submitted.' })
  expect(mocks.update).not.toHaveBeenCalled()
})

it('refuses inherited GPS when the locked row contains different footage', async () => {
  mocks.find.mockResolvedValue({ id: input.draftId, privateLocation: { id: input.draftId }, video_path: 'user-1/folder/replacement.webm' })
  expect(await saveListing(input)).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})

it('submits a valid owner draft for verification, never directly for publication', async () => {
  expect(await saveListing(input)).toMatchObject({ success: true, listingId: input.draftId })
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: input.draftId }, data: { listing_status: 'pending_verification' } })
  expect(mocks.lock).toHaveBeenCalledWith(expect.any(Object), 'listing', input.draftId)
  expect(mocks.update.mock.calls[0][0].data.base_rent_amount).toBe(500000)
})

it('does not instruct clients to delete committed media when cache refresh fails', async () => {
  mocks.revalidate.mockImplementation(() => { throw new Error('cache unavailable') })
  expect(await saveListing(input)).toMatchObject({ success: true, listingId: input.draftId })
})

it('atomically queues media with a submitted listing when configured', async () => {
  vi.stubEnv('MUX_ENABLED', 'true')
  for (const key of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) vi.stubEnv(key, 'test-only')
  try {
    expect(await saveListing(input)).toMatchObject({ success: true })
    expect(mocks.mediaCreate).toHaveBeenCalledWith({ data: { listing_id: input.draftId, source_path: input.videoPath, mux_asset_id: null, playback_id: null } })
  } finally {
    vi.unstubAllEnvs()
  }
})

it('stores a fresh video GPS fix in the private collection in the same transaction', async () => {
  expect(await saveListing({ ...input, draftId: undefined, lat: 6.45, lng: 3.4, accuracy: 8 })).toMatchObject({ success: true })
  expect(mocks.locationUpsert).toHaveBeenCalledWith({ where: { listing_id: input.draftId }, create: { id: input.draftId, listing_id: input.draftId, geometry: { type: 'Point', coordinates: [3.4, 6.45] } }, update: { geometry: { type: 'Point', coordinates: [3.4, 6.45] } } })
  expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty('geometry')
})

it('cannot publish an existing draft with no private GPS record', async () => {
  mocks.find.mockResolvedValue({ id: input.draftId, video_path: input.videoPath, privateLocation: null })
  expect(await saveListing(input)).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})

it('rejects a draft deleted during its revision lock', async () => {
  mocks.lock.mockResolvedValue(false)
  expect(await saveListing(input)).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})

it.each(['user-1/folder/retake.mp4', undefined])('clears inherited GPS when a draft replaces or removes its footage: %s', async videoPath => {
  expect(await saveDraft({ ...input, wizardStep: 'details', videoPath })).toMatchObject({ success: true })
  expect(mocks.locationDelete).toHaveBeenCalledWith({ where: { listing_id: input.draftId } })
  expect(mocks.locationUpsert).not.toHaveBeenCalled()
})

it('does not attach a GPS record to a new draft with no recorded video', async () => {
  expect(await saveDraft({ category: 'house', wizardStep: 'capture', metadata: {}, lat: 6.45, lng: 3.4 })).toMatchObject({ success: true })
  expect(mocks.locationUpsert).not.toHaveBeenCalled()
})

it('marks a transaction/commit failure uncertain so clients retain uploaded footage', async () => {
  mocks.transaction.mockRejectedValue(new Error('commit result unknown'))
  expect(await saveListing(input)).toMatchObject({ success: false, uncertain: true })
  expect(await saveDraft({ ...input, wizardStep: 'details' })).toMatchObject({ success: false, uncertain: true })
})
