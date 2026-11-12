import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminListingMediaSchema } from '@/lib/contracts/admin-media'
const state = vi.hoisted(() => ({ permission: vi.fn(), ready: vi.fn(), listing: vi.fn(), objects: vi.fn(), info: vi.fn(), sign: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: state.listing }, storageObject: { findMany: state.objects } } }))
vi.mock('@/lib/auth/roles', () => ({ hasStaffPermission: state.permission }))
vi.mock('@/lib/database/readiness', () => ({ assertOwnerAdminReady: state.ready }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ info: state.info, createSignedUrl: state.sign }) } }) }))
vi.mock('@/lib/local-storage/urls', () => ({ storageFileUrl: (_bucket: string, path: string) => `https://rentral.invalid/api/v1/files/listings-media/${path}` }))
vi.mock('@/lib/storage-claims/service', async () => {
  const { createHash } = await import('node:crypto')
  return { storageObjectId: (bucket: string, path: string) => createHash('sha256').update(`${bucket}\0${path.toLowerCase()}`).digest('hex') }
})
import { getAdminListingMedia } from '@/lib/operations/admin-media'

const actor = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222', id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const photo = `${owner}/gallery/photo.jpg`, video = `${owner}/gallery/video.mp4`, digest = 'a'.repeat(64)
function object(path = photo, contentType = 'image/jpeg') {
  return { id: createHash('sha256').update(`listings-media\0${path.toLowerCase()}`).digest('hex'), revision: 1, bucket: 'listings-media', path, owner_id: owner, state: 'available', digest, size_bytes: 200, content_type: contentType }
}
function proof(path = photo, kind: 'image' | 'video' = 'image') {
  const value = object(path, kind === 'image' ? 'image/jpeg' : 'video/mp4')
  return { kind, path, objectId: value.id, digest, sizeBytes: 200, contentType: value.content_type }
}
function listing() {
  return { id, revision: 2, lister_id: owner, listing_status: 'pending_verification', media_source: 'approved_gallery', video_path: null,
    poster_path: photo, gallery_media: [proof()], gallery_media_paths: [photo.toLowerCase()] }
}
beforeEach(() => {
  state.permission.mockReset().mockResolvedValue(true); state.ready.mockReset().mockResolvedValue(undefined)
  state.listing.mockReset().mockResolvedValue(listing()); state.objects.mockReset().mockResolvedValue([object()])
  state.info.mockReset().mockResolvedValue({ data: { digest, size: 200, contentType: 'image/jpeg' }, error: null })
  state.sign.mockReset().mockImplementation(async (path: string) => ({ data: { signedUrl: `https://rentral.invalid/api/v1/files/listings-media/${path}?token=scoped-proof` }, error: null }))
})

describe('private submitted-listing media preview', () => {
  it('returns only short-lived same-origin capabilities, preserving gallery provenance', async () => {
    const result = await getAdminListingMedia(actor, id)
    expect(result).toEqual({ source: 'approved_gallery', items: [{ kind: 'image', url: `/api/v1/files/listings-media/${photo}?token=scoped-proof`, expiresAt: expect.any(String) }] })
    expect(Date.parse(result.items[0].expiresAt) - Date.now()).toBeGreaterThan(58000)
    expect(state.sign).toHaveBeenCalledWith(photo, 60)
    expect(state.listing.mock.calls[0][0].where).toEqual({ id, listing_status: { not: 'draft' } })
    expect(JSON.stringify(result)).not.toContain('compliance-docs'); expect(JSON.stringify(result)).not.toContain(digest)
    expect(state.permission).toHaveBeenCalledTimes(3)
  })
  it('supports recorded video with a poster and does not falsely label it gallery media', async () => {
    state.listing.mockResolvedValue({ ...listing(), media_source: 'recorded', video_path: video, gallery_media: [], gallery_media_paths: [] })
    state.objects.mockResolvedValue([object(), object(video, 'video/mp4')])
    state.info.mockImplementation(async (path: string) => ({ data: { digest, size: 200, contentType: path === video ? 'video/mp4' : 'image/jpeg' }, error: null }))
    const result = await getAdminListingMedia(actor, id)
    expect(result.source).toBe('recorded'); expect(result.items.map(item => item.kind)).toEqual(['video', 'image'])
  })
  it('denies staff or draft access without signing any file', async () => {
    state.permission.mockResolvedValue(false)
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ status: 403, code: 'STAFF_REQUIRED' })
    expect(state.listing).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled()
    state.permission.mockResolvedValue(true); state.listing.mockResolvedValue(null)
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ status: 404 })
    expect(state.sign).not.toHaveBeenCalled()
  })
  it('rejects foreign-owner files before querying or signing objects', async () => {
    const other = `${actor}/gallery/photo.jpg`
    state.listing.mockResolvedValue({ ...listing(), poster_path: other, gallery_media: [proof(other)], gallery_media_paths: [other] })
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    expect(state.objects).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled()
  })
  it('rejects changed proof, missing registry records or changed actual bytes without issuing links', async () => {
    state.listing.mockResolvedValue({ ...listing(), gallery_media: [{ ...proof(), digest: 'b'.repeat(64) }] })
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    state.listing.mockResolvedValue(listing()); state.objects.mockResolvedValue([])
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    state.objects.mockResolvedValue([object()]); state.info.mockResolvedValue({ data: { digest: 'b'.repeat(64), size: 200, contentType: 'image/jpeg' }, error: null })
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    expect(state.sign).not.toHaveBeenCalled()
  })
  it('rejects deleted/changing objects and listing revisions at the last read', async () => {
    state.objects.mockResolvedValueOnce([object()]).mockResolvedValue([])
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    expect(state.sign).not.toHaveBeenCalled()
    state.objects.mockResolvedValue([object()]); state.listing.mockResolvedValueOnce(listing()).mockResolvedValue(null)
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    expect(state.sign).not.toHaveBeenCalled()
  })
  it('denies a role revoked during file inspection before signing or returning links', async () => {
    state.permission.mockResolvedValueOnce(true).mockResolvedValue(false)
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'STAFF_REQUIRED' }); expect(state.sign).not.toHaveBeenCalled()
    state.permission.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false)
    await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'STAFF_REQUIRED' })
    expect(state.sign).toHaveBeenCalledTimes(1)
  })
  it('rejects a foreign-origin or unscoped signed URL and never returns a public file URL', async () => {
    for (const signedUrl of [`https://foreign.invalid/api/v1/files/listings-media/${photo}?token=bad`, `https://rentral.invalid/api/v1/files/compliance-docs/${photo}?token=bad`, `https://rentral.invalid/api/v1/files/listings-media/${photo}`, 'malformed-url']) {
      state.sign.mockResolvedValue({ data: { signedUrl }, error: null })
      await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    }
  })
  it('rejects more than ten images or one video, duplicated proofs and mismatched bound paths', async () => {
    const tooMany = Array.from({ length: 11 }, (_, index) => proof(`${owner}/gallery/photo${index}.jpg`))
    for (const row of [{ ...listing(), gallery_media: tooMany }, { ...listing(), gallery_media: [proof(), proof()] }, { ...listing(), gallery_media_paths: [] }, { ...listing(), video_path: video }]) {
      state.listing.mockResolvedValue(row)
      await expect(getAdminListingMedia(actor, id)).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    }
    expect(state.sign).not.toHaveBeenCalled()
  })
  it('keeps document/external URLs outside the media DTO', () => {
    const expiresAt = new Date().toISOString()
    for (const url of ['https://external.invalid/file.jpg', '//external.invalid/file.jpg', '/api/v1/files/compliance-docs/private?token=proof', '/api/v1/files/listings-media/private', '/api/v1/files/listings-media/../compliance-docs/private?token=proof']) {
      expect(adminListingMediaSchema.safeParse({ source: 'approved_gallery', items: [{ kind: 'image', url, expiresAt }] }).success).toBe(false)
    }
  })
})
