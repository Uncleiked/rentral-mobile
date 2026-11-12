import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/listings/publishing', () => ({ applySubmissionPublishing: vi.fn(async () => undefined) }))
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: vi.fn(async () => undefined) }))

const mocks = vi.hoisted(() => ({
  userId: vi.fn(), transaction: vi.fn(), find: vi.fn(), lock: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), revalidate: vi.fn(), mediaCreate: vi.fn(), locationUpsert: vi.fn(), locationDelete: vi.fn(), prepareStorage: vi.fn(), claimStorage: vi.fn(), captureRead: vi.fn(), captureBind: vi.fn(), geocode: vi.fn(), verification: vi.fn(), galleryPermission: vi.fn(), galleryPrepare: vi.fn(), documentReview: vi.fn(),
}))
vi.mock('@/lib/action-helpers', () => ({ requireVerifiedUserId: mocks.userId, revalidateProfilePaths: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction, listing: { findFirst: mocks.find } } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: mocks.transaction, lockRecord: mocks.lock }))
vi.mock('@/lib/storage-claims/service', () => ({ prepareListingStorage: mocks.prepareStorage, claimStorageObjects: mocks.claimStorage }))
vi.mock('@/lib/listings/capture', () => ({ readCaptureForSubmission: mocks.captureRead, bindCaptureToListing: mocks.captureBind }))
vi.mock('@/lib/listings/gallery', () => ({ assertGalleryPermission: mocks.galleryPermission, prepareGalleryMedia: mocks.galleryPrepare }))
vi.mock('@/lib/listings/spatial', async original => ({ ...await original<typeof import('@/lib/listings/spatial')>(), geocodeListingAddress: mocks.geocode }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('next/server', () => ({ after: vi.fn() }))
import { saveListing, saveDraft, updateListing } from '@/app/actions/listingActions'
import { AccountUnavailableError, assertActiveAccounts } from '@/lib/accounts/availability'
import { ApiError } from '@/lib/api/http'

const input = {
  draftId: '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d', category: 'house',
  address: 'Test property address', basePrice: '500000',
  metadata: { bedrooms: '2', bathrooms: '2', sizeSqm: '80', amenities: '' },
  videoPath: 'user-1/folder/video.webm', documentPath: 'user-1/folder/deed.pdf',
  captureId: '11111111-1111-4111-8111-111111111111',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MUX_ENABLED', 'false')
  mocks.userId.mockResolvedValue('user-1')
  mocks.prepareStorage.mockResolvedValue([{ path: input.videoPath, id: 'video', digest: 'a'.repeat(64), bucket: 'listings-media', sizeBytes: 100, contentType: 'video/webm' }])
  const capture = { id: input.captureId, start_geometry: { type: 'Point', coordinates: [3.4, 6.45] }, begin_hash: 'begin', video_digest: 'a'.repeat(64), start_accuracy: 8 }
  mocks.captureRead.mockResolvedValue(capture); mocks.captureBind.mockResolvedValue(capture); mocks.geocode.mockResolvedValue({ longitude: 3.4, latitude: 6.45 })
  mocks.claimStorage.mockResolvedValue(undefined)
  mocks.galleryPermission.mockResolvedValue(3)
  const tx = { listing: { findFirst: mocks.find, update: mocks.update, updateMany: mocks.updateMany, create: mocks.create }, mediaAsset: { create: mocks.mediaCreate }, listingLocation: { upsert: mocks.locationUpsert, deleteMany: mocks.locationDelete }, listingVerification: { upsert: mocks.verification }, documentReview: { updateMany: mocks.documentReview } }
  mocks.transaction.mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx))
  mocks.update.mockResolvedValue({ id: input.draftId, lister: { username: 'renter' } })
  mocks.create.mockResolvedValue({ id: input.draftId, lister: { username: 'renter' } })
  mocks.find.mockResolvedValue({ id: input.draftId, video_path: input.videoPath, privateLocation: { id: input.draftId } })
  mocks.lock.mockResolvedValue(true)
  mocks.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => vi.unstubAllEnvs())

it('submits an authorized photo-only gallery for manual review without GPS, geocoding or a Mux job', async () => {
  vi.stubEnv('MUX_ENABLED', 'true'); for (const name of ['MUX_TOKEN_ID','MUX_TOKEN_SECRET','MUX_WEBHOOK_SECRET','MUX_SIGNING_KEY_ID','MUX_SIGNING_PRIVATE_KEY']) vi.stubEnv(name, '')
  const photo = 'user-1/gallery/photo.png', proof = [{ kind: 'image', path: photo, objectId: 'a'.repeat(64), digest: 'b'.repeat(64), sizeBytes: 100, contentType: 'image/png' }]
  mocks.galleryPrepare.mockResolvedValue({ proof, paths: [photo], posterPath: photo, objects: [{ id: 'a'.repeat(64), bucket: 'listings-media', path: photo, digest: 'b'.repeat(64), sizeBytes: 100, contentType: 'image/png' }] })
  const result = await saveListing({ ...input, captureId: undefined, videoPath: undefined, mediaSource: 'approved_gallery', galleryPhotos: [photo] })
  expect(result).toEqual({ success: true, listingId: input.draftId })
  expect(mocks.galleryPermission).toHaveBeenCalledTimes(2)
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ media_source: 'approved_gallery', capture_id: null, video_path: null, poster_path: photo, gallery_media: proof, gallery_permission_revision: 3 }) }))
  expect(mocks.locationDelete).toHaveBeenCalledWith({ where: { listing_id: input.draftId } })
  expect(mocks.captureRead).not.toHaveBeenCalled(); expect(mocks.captureBind).not.toHaveBeenCalled(); expect(mocks.geocode).not.toHaveBeenCalled(); expect(mocks.locationUpsert).not.toHaveBeenCalled(); expect(mocks.verification).not.toHaveBeenCalled(); expect(mocks.mediaCreate).not.toHaveBeenCalled()
})

it('rejects gallery use before reading files when approval is absent and rechecks revocation before attachment', async () => {
  const data = { ...input, captureId: undefined, videoPath: undefined, mediaSource: 'approved_gallery', galleryPhotos: ['user-1/gallery/photo.jpg'] }
  mocks.galleryPermission.mockRejectedValueOnce(new ApiError(403, 'GALLERY_PERMISSION_REQUIRED', 'Approval required.'))
  expect(await saveListing(data)).toMatchObject({ success: false, code: 'GALLERY_PERMISSION_REQUIRED' })
  expect(mocks.galleryPrepare).not.toHaveBeenCalled(); expect(mocks.claimStorage).not.toHaveBeenCalled()
  mocks.galleryPermission.mockResolvedValueOnce(3).mockRejectedValueOnce(new ApiError(403, 'GALLERY_PERMISSION_REQUIRED', 'Approval changed.'))
  mocks.galleryPrepare.mockResolvedValue({ objects: [], proof: [], paths: [], posterPath: null })
  expect(await saveListing(data)).toMatchObject({ success: false, code: 'GALLERY_PERMISSION_REQUIRED' })
  expect(mocks.claimStorage).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
})

it('requires fresh manual review when a gallery host edits after a new grant revision', async () => {
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  mocks.find.mockResolvedValue({ id: input.draftId, revision: 7, category: 'house', listing_status: 'suspended', media_source: 'approved_gallery', gallery_permission_revision: 2, text_address: input.address, lister: { username: 'renter' } })
  expect(await updateListing({ listingId: input.draftId, address: input.address, basePrice: input.basePrice, metadata: input.metadata })).toEqual({ success: true })
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ gallery_permission_revision: 3, listing_status: 'pending_verification' }) }))
  expect(mocks.documentReview).toHaveBeenCalledWith({ where: { listing_id: input.draftId }, data: { status: 'needs_review', reviewed_by: null } })
  expect(mocks.geocode).not.toHaveBeenCalled(); expect(mocks.captureRead).not.toHaveBeenCalled()
})

it.each([saveListing, saveDraft, updateListing])('blocks a direct mutation without authentication', async action => {
  mocks.userId.mockResolvedValue(null)
  expect(await action(input)).toMatchObject({ success: false })
  expect(mocks.transaction).not.toHaveBeenCalled()
})

it.each([saveListing, saveDraft])('returns a definite closed-account rejection without ambiguous-save cleanup instructions', async action => {
  vi.mocked(assertActiveAccounts).mockRejectedValueOnce(new AccountUnavailableError())
  const result = await action(action === saveDraft ? { ...input, wizardStep: 'details' } : input)
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

it('refuses a capture that is not sealed against the exact submitted footage', async () => {
  mocks.captureRead.mockRejectedValue(new ApiError(409, 'CAPTURE_REQUIRED', 'Record a new walkthrough.'))
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

it('copies the sealed recording GPS privately in the same submission transaction', async () => {
  expect(await saveListing({ ...input, draftId: undefined })).toMatchObject({ success: true })
  expect(mocks.locationUpsert).toHaveBeenCalledWith({ where: { listing_id: input.draftId }, create: { id: input.draftId, listing_id: input.draftId, capture_id: input.captureId, geometry: { type: 'Point', coordinates: [3.4, 6.45] } }, update: { capture_id: input.captureId, geometry: { type: 'Point', coordinates: [3.4, 6.45] } } })
  expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty('geometry')
})

it('cannot submit a legacy draft without recording-time evidence', async () => {
  expect(await saveListing({ ...input, captureId: undefined })).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})

it('rejects a draft deleted during its revision lock', async () => {
  mocks.lock.mockResolvedValue(false)
  expect(await saveListing(input)).toMatchObject({ success: false })
  expect(mocks.update).not.toHaveBeenCalled()
})

it.each(['user-1/folder/retake.mp4', undefined])('clears inherited GPS when a draft replaces or removes its footage: %s', async videoPath => {
  expect(await saveDraft({ ...input, wizardStep: 'details', videoPath, captureId: undefined })).toMatchObject({ success: true })
  expect(mocks.locationDelete).toHaveBeenCalledWith({ where: { listing_id: input.draftId } })
  expect(mocks.locationUpsert).not.toHaveBeenCalled()
})

it('does not attach a GPS record to a new draft with no recorded video', async () => {
  expect(await saveDraft({ category: 'house', wizardStep: 'capture', metadata: {} })).toMatchObject({ success: true })
  expect(mocks.locationUpsert).not.toHaveBeenCalled()
})

it('marks a transaction/commit failure uncertain so clients retain uploaded footage', async () => {
  mocks.transaction.mockRejectedValue(new Error('commit result unknown'))
  expect(await saveListing(input)).toMatchObject({ success: false, uncertain: true })
  expect(await saveDraft({ ...input, wizardStep: 'details' })).toMatchObject({ success: false, uncertain: true })
})

it('blocks a mismatched address before creating or submitting any listing', async () => {
  mocks.geocode.mockResolvedValue({ longitude: 3.4, latitude: 6.5 })
  expect(await saveListing(input)).toMatchObject({ success: false, code: 'ADDRESS_MISMATCH', status: 409 })
  expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.prepareStorage).not.toHaveBeenCalled()
})
it.each([null, 'failure'])('fails closed when address resolution is unavailable: %s', async result => {
  if (result === null) mocks.geocode.mockResolvedValue(null)
  else mocks.geocode.mockRejectedValue(new Error('provider response unavailable'))
  expect(await saveListing(input)).toMatchObject({ success: false, code: 'ADDRESS_UNAVAILABLE', status: 503 })
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('does not let a new caller override sealed coordinates through an action payload', async () => {
  expect(await saveListing({ ...input, lat: 6.45, lng: 3.4 })).toMatchObject({ success: false })
  expect(mocks.geocode).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled()
})
it('rejects changed capture bytes between geocoding and final transaction readback', async () => {
  mocks.captureBind.mockResolvedValue({ id: input.captureId, begin_hash: 'begin', video_digest: 'b'.repeat(64) })
  expect(await saveListing(input)).toMatchObject({ success: false, code: 'STALE_LISTING' })
  expect(mocks.locationUpsert).not.toHaveBeenCalled(); expect(mocks.verification).not.toHaveBeenCalled()
})
it('rejects a delayed geocoder result after another screen changes the draft even without a client revision', async () => {
  mocks.find.mockResolvedValueOnce({ id: input.draftId, revision: 1 }).mockResolvedValueOnce({ id: input.draftId, revision: 2 })
  expect(await saveListing(input)).toMatchObject({ success: false, code: 'STALE_LISTING' })
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.verification).not.toHaveBeenCalled()
})
