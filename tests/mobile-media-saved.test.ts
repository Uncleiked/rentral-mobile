import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listing: vi.fn(), media: vi.fn(), sign: vi.fn(), muxSign: vi.fn(), save: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: {
  listing: { findFirst: mocks.listing }, mediaAsset: { findUnique: mocks.media },
  savedListing: { upsert: mocks.save, deleteMany: mocks.remove },
} }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ user: { updateMany: async () => ({ count: 1 }) }, listing: { findFirst: mocks.listing }, savedListing: { upsert: mocks.save } }) }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: mocks.sign }) } }) }))
vi.mock('@/lib/media/mux', () => ({ muxClient: () => ({ jwt: { signPlaybackId: mocks.muxSign } }) }))
import { listingMediaForApi } from '@/lib/api/media'
import { updateSavedListing } from '@/lib/api/saved'
import { activeAccountWhere } from '@/lib/accounts/availability'

const owner = '55bfc098-ff33-4fdd-b7ae-68d810a74050'
const viewer = '5bf5d643-96cc-4114-80eb-fb83c325257f'
const listingId = '52db23e2-fb48-4cf7-9dfc-06e3c96c301f'
const paths = { poster_path: `${owner}/folder/100_poster.jpg`, video_path: `${owner}/folder/100_video.mp4` }
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('MUX_ENABLED', 'false') })
afterEach(() => vi.unstubAllEnvs())

it('authorizes listing ownership/publication before signing and hides inaccessible inventory', async () => {
  mocks.listing.mockResolvedValue(null)
  await expect(listingMediaForApi(viewer, listingId)).rejects.toMatchObject({ status: 404 })
  expect(mocks.sign).not.toHaveBeenCalled()
  expect(mocks.listing).toHaveBeenCalledWith(expect.objectContaining({ where: { id: listingId, lister: { is: activeAccountWhere }, OR: [{ lister_id: viewer }, { listing_status: 'active' }] } }))
  mocks.listing.mockResolvedValue({ lister_id: owner, listing_status: 'draft', ...paths })
  await expect(listingMediaForApi(viewer, listingId)).rejects.toMatchObject({ status: 404 })
  expect(mocks.sign).not.toHaveBeenCalled()
})

it('provides short-lived URLs without forwarding Supabase credentials to native players', async () => {
  mocks.listing.mockResolvedValue({ lister_id: owner, listing_status: 'active', ...paths })
  mocks.sign.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://storage.example/signed/${path}?token=storage-signature` }, error: null }))
  const before = Date.now()
  const media = await listingMediaForApi(viewer, listingId)
  expect(media.posterUrl).toContain('storage-signature')
  expect(media.videoUrl).toContain('storage-signature')
  expect(new Date(media.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 300000)
  expect(mocks.sign).toHaveBeenCalledWith(paths.video_path, 300)
  expect(mocks.media).not.toHaveBeenCalled()
})

it('rejects cross-owner and traversal media references without signing them', async () => {
  for (const video_path of [`${viewer}/folder/video.mp4`, `${owner}/../video.mp4`, `${owner}/folder/deed.pdf`]) {
    mocks.listing.mockResolvedValue({ lister_id: owner, listing_status: 'active', poster_path: null, video_path })
    await expect(listingMediaForApi(viewer, listingId)).rejects.toMatchObject({ status: 404 })
  }
  expect(mocks.sign).not.toHaveBeenCalled()
})

it('requires signed Mux playback while enabled and never exposes a raw fallback', async () => {
  vi.stubEnv('MUX_ENABLED', 'true')
  for (const name of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) vi.stubEnv(name, 'test-only')
  mocks.listing.mockResolvedValue({ lister_id: owner, listing_status: 'active', ...paths })
  mocks.media.mockResolvedValue({ status: 'processing', playback_id: null })
  await expect(listingMediaForApi(viewer, listingId)).rejects.toMatchObject({ status: 409 })
  expect(mocks.sign).not.toHaveBeenCalled()
  mocks.media.mockResolvedValue({ status: 'ready', playback_id: 'playback-id' })
  mocks.muxSign.mockResolvedValue({ 'playback-token': 'video-signature', 'thumbnail-token': 'thumbnail-signature' })
  expect(await listingMediaForApi(viewer, listingId)).toMatchObject({
    videoUrl: 'https://stream.mux.com/playback-id.m3u8?token=video-signature',
    posterUrl: 'https://image.mux.com/playback-id/thumbnail.jpg?token=thumbnail-signature',
  })
  expect(mocks.sign).not.toHaveBeenCalled()
})

it('saves idempotently for the authenticated actor and refuses unavailable inventory', async () => {
  mocks.listing.mockResolvedValue(null)
  await expect(updateSavedListing(viewer, listingId, true)).rejects.toMatchObject({ status: 404 })
  expect(mocks.save).not.toHaveBeenCalled()
  mocks.listing.mockResolvedValue({ id: listingId, lister_id: owner })
  expect(await updateSavedListing(viewer, listingId, true)).toEqual({ saved: true })
  expect(mocks.save).toHaveBeenCalledWith({ where: { user_id_listing_id: { user_id: viewer, listing_id: listingId } }, create: { user_id: viewer, listing_id: listingId }, update: {} })
})

it('removes only the actors save even after its listing becomes unavailable', async () => {
  expect(await updateSavedListing(viewer, listingId, false)).toEqual({ saved: false })
  expect(mocks.remove).toHaveBeenCalledWith({ where: { user_id: viewer, listing_id: listingId } })
  expect(mocks.listing).not.toHaveBeenCalled()
})
