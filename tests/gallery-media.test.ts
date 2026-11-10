import { createHash } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ ready: vi.fn(), user: vi.fn(), lock: vi.fn(), claim: vi.fn(), photos: vi.fn(), files: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertOwnerAdminReady: mocks.ready }))
vi.mock('@/lib/db', () => ({ default: {} }))
vi.mock('@/lib/storage-claims/service', async original => ({ ...await original<typeof import('@/lib/storage-claims/service')>(), prepareGalleryPhotos: mocks.photos, prepareListingStorage: mocks.files, claimStorageObjects: mocks.claim }))
import { assertGalleryPermission, assertGalleryPublication, galleryIsPublic, prepareGalleryMedia } from '@/lib/listings/gallery'
import { saveDraftInputSchema, saveListingInputSchema } from '@/lib/contracts/listings'

const objectId = (path: string) => createHash('sha256').update(`listings-media\0${path.toLowerCase()}`).digest('hex')
const image = (name: string) => ({ kind: 'image' as const, path: `owner/gallery/${name}.jpg`, objectId: objectId(`owner/gallery/${name}.jpg`), digest: 'a'.repeat(64), sizeBytes: 100, contentType: 'image/jpeg' as const })
const proof = [image('one'), image('two')]
const listing = { id: 'listing', lister_id: 'owner', media_source: 'approved_gallery', gallery_permission_revision: 3, gallery_media: proof, gallery_media_paths: proof.map(item => item.path.toLowerCase()), video_path: null, poster_path: proof[0].path }
const tx = { user: { findFirst: mocks.user, updateMany: mocks.lock } } as unknown as Parameters<typeof assertGalleryPermission>[0]
beforeEach(() => {
  vi.resetAllMocks(); mocks.ready.mockResolvedValue(undefined); mocks.user.mockResolvedValue({ gallery_upload_allowed: true, gallery_permission_revision: 3 }); mocks.lock.mockResolvedValue({ count: 1 }); mocks.claim.mockResolvedValue(undefined)
})

it('allows a photo-only gallery command but rejects fabricated recording evidence, duplicate photos and client-built proofs', () => {
  const input = { category: 'house', address: 'Fixture address, Yaba, Lagos', basePrice: '100', metadata: {}, documentPath: 'owner/gallery/deed.pdf', mediaSource: 'approved_gallery', galleryPhotos: [proof[0].path] }
  expect(saveListingInputSchema.safeParse(input).success).toBe(true)
  for (const patch of [{ captureId: '11111111-1111-4111-8111-111111111111' }, { galleryPhotos: [] }, { galleryPhotos: [proof[0].path, proof[0].path.toUpperCase()] }, { gallery_media: proof }, { lat: 6.5, lng: 3.4 }]) expect(saveListingInputSchema.safeParse({ ...input, ...patch }).success).toBe(false)
  expect(saveListingInputSchema.safeParse({ ...input, mediaSource: undefined }).success).toBe(false)
  expect(saveDraftInputSchema.safeParse({ category: 'house', wizardStep: 'capture', mediaSource: 'approved_gallery', galleryPhotos: [], metadata: {} }).success).toBe(true)
})

it('checks current approval and exact permission revision, with a real user-row write against revocation races', async () => {
  expect(await assertGalleryPermission(tx, 'owner', 3)).toBe(3)
  expect(mocks.lock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'owner', gallery_upload_allowed: true, OR: [{ gallery_permission_revision: 3 }] }), data: { revision: { increment: 1 } } }))
  mocks.user.mockResolvedValue({ gallery_upload_allowed: false, gallery_permission_revision: 4 })
  await expect(assertGalleryPermission(tx, 'owner')).rejects.toMatchObject({ code: 'GALLERY_PERMISSION_REQUIRED' })
  mocks.user.mockResolvedValue({ gallery_upload_allowed: true, gallery_permission_revision: 5 })
  await expect(assertGalleryPermission(tx, 'owner', 3)).rejects.toMatchObject({ code: 'GALLERY_PERMISSION_REQUIRED' })
  mocks.user.mockResolvedValue({ gallery_upload_allowed: true, gallery_permission_revision: 3 }); mocks.lock.mockResolvedValue({ count: 0 })
  await expect(assertGalleryPermission(tx, 'owner', 3)).rejects.toMatchObject({ code: 'GALLERY_PERMISSION_REQUIRED' })
})

it('publishes photo-only media only by claiming every exact owned immutable object', async () => {
  expect(await assertGalleryPublication(tx, listing)).toEqual({ hasVideo: false })
  expect(mocks.claim).toHaveBeenCalledExactlyOnceWith(tx, 'owner', proof.map(item => ({ id: item.objectId, bucket: 'listings-media', path: item.path, digest: item.digest, sizeBytes: 100, contentType: 'image/jpeg' })))
})

it('rejects stale grants and broken video/poster/reference bindings before any gallery claim', async () => {
  for (const patch of [{ gallery_permission_revision: 2 }, { poster_path: proof[1].path }, { video_path: 'owner/gallery/unbound.mp4' }, { gallery_media_paths: [proof[0].path] }, { gallery_media: [{ ...proof[0], objectId: 'b'.repeat(64) }] }]) {
    await expect(assertGalleryPublication(tx, { ...listing, ...patch })).rejects.toMatchObject({ status: expect.any(Number) })
  }
  expect(mocks.claim).not.toHaveBeenCalled()
})

it('removes revoked and regranted-but-unreviewed gallery listings from public projections without changing recorded legacy rows', () => {
  const current = { ...listing, lister: { gallery_upload_allowed: true, gallery_permission_revision: 3 } }
  expect(galleryIsPublic(current)).toBe(true)
  expect(galleryIsPublic({ ...current, lister: { gallery_upload_allowed: false, gallery_permission_revision: 4 } })).toBe(false)
  expect(galleryIsPublic({ ...current, lister: { gallery_upload_allowed: true, gallery_permission_revision: 5 } })).toBe(false)
  expect(galleryIsPublic({ ...current, media_source: 'unknown' })).toBe(false)
  expect(galleryIsPublic({})).toBe(true)
})

it('builds gallery proofs only from verified object metadata and chooses the first photo as primary poster', async () => {
  const objects = proof.map(item => ({ id: item.objectId, bucket: 'listings-media', path: item.path, digest: item.digest, sizeBytes: 100, contentType: 'image/jpeg' }))
  mocks.photos.mockResolvedValue(objects); mocks.files.mockResolvedValue([])
  expect(await prepareGalleryMedia('owner', { galleryPhotos: proof.map(item => item.path) })).toEqual({ objects, proof, paths: proof.map(item => item.path), posterPath: proof[0].path })
  expect(mocks.files).toHaveBeenCalledWith('owner', { videoPath: undefined, documentPath: undefined, posterPath: undefined })
})
