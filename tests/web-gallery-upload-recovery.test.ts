import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearGalleryRecovery, galleryFileFingerprint, galleryUploadRecoveryKey, persistGalleryRecovery, readGalleryRecovery, readGalleryUpload, reselectedGalleryFileMatches, type GalleryBrowserRecovery, type GalleryUploadMarker } from '@/lib/listings/gallery-upload-recovery'

const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', folder = '33333333-3333-4333-8333-333333333333'
const path = `${actor}/${folder}/44444444-4444-4444-8444-444444444444.png`
let values: Map<string, string>, failWrites = false
const marker = (): GalleryUploadMarker => ({ kind: 'photo', photoIndex: 0, bucket: 'listings-media', path, name: 'original.png', size: 10, contentType: 'image/png', fingerprintVersion: 'chunked-sha256-v1', fingerprint: 'a'.repeat(64) })
const recovery = (): GalleryBrowserRecovery => ({ version: 1, actorId: actor, routeDraftId: null, draftId: null, revision: null, category: 'house', folderId: folder,
  form: { address: '14 Synthetic Street, Bariga, Lagos', basePrice: '250000', listingTitle: 'Kept gallery form', bedrooms: '1' }, photos: [{ name: 'original.png', path: null }],
  videoPath: null, videoName: null, documentPath: null, documentName: null, pendingUpload: marker() })
beforeEach(() => {
  values = new Map(); failWrites = false
  const storage: Storage = { get length() { return values.size }, key(index) { return [...values.keys()][index] ?? null }, clear() { values.clear() }, getItem(key) { return values.get(key) ?? null }, setItem(key, value) { if (failWrites) throw new Error('Storage unavailable'); values.set(key, value) }, removeItem(key) { values.delete(key) } }
  vi.stubGlobal('window', { sessionStorage: storage })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('persists the original raw-upload path, confirmed paths and current form without bytes, tokens or GPS', () => {
  const input = recovery(); input.form = { ...input.form, access_token: 'PRIVATE_TOKEN', latitude: 'PRIVATE_GPS', hardware_coordinates: 'PRIVATE_GPS' }
  input.videoPath = `${actor}/${folder}/video.mp4`
  persistGalleryRecovery(input)
  const restored = readGalleryRecovery(actor)
  expect(restored).toMatchObject({ pendingUpload: marker(), videoPath: input.videoPath, form: { listingTitle: 'Kept gallery form', address: input.form.address } })
  expect(values.get(galleryUploadRecoveryKey(actor))).not.toMatch(/PRIVATE_TOKEN|PRIVATE_GPS|access_token|latitude|hardware_coordinates|ArrayBuffer|blob:/)
})
it('fails closed if durable recovery cannot be written or belongs to another actor/path', () => {
  failWrites = true
  expect(() => persistGalleryRecovery(recovery())).toThrow('Storage unavailable')
  failWrites = false; persistGalleryRecovery(recovery())
  const stored = JSON.parse(values.get(galleryUploadRecoveryKey(actor))!)
  stored.pendingUpload.path = path.replace(actor, other)
  values.set(galleryUploadRecoveryKey(actor), JSON.stringify(stored))
  expect(() => readGalleryRecovery(actor)).toThrow('cannot be confirmed')
})
it('cannot replace an uncertain original path or content fingerprint and requires its exact marker before clearing', () => {
  const input = recovery(); persistGalleryRecovery(input)
  expect(() => persistGalleryRecovery({ ...input, pendingUpload: { ...marker(), path: `${actor}/${folder}/other.png` } })).toThrow('different gallery upload')
  expect(() => persistGalleryRecovery({ ...input, pendingUpload: { ...marker(), fingerprint: 'b'.repeat(64) } })).toThrow('original upload instructions')
  expect(() => clearGalleryRecovery(actor, `${actor}/${folder}/wrong.png`)).toThrow('original gallery upload')
  expect(readGalleryRecovery(actor)?.pendingUpload).toEqual(marker())
  persistGalleryRecovery({ ...input, photos: [{ name: 'original.png', path }], pendingUpload: null }, path)
  expect(readGalleryRecovery(actor)?.photos).toEqual([{ name: 'original.png', path }])
})
it('recovers a confirmed owned raw upload with GET only and checks path, size and content type', async () => {
  persistGalleryRecovery(recovery())
  const request = vi.fn().mockResolvedValue(Response.json({ success: true, data: { path, size: 10, contentType: 'image/png' } }))
  vi.stubGlobal('fetch', request)
  expect(await readGalleryUpload(actor, marker())).toEqual({ path, size: 10, contentType: 'image/png' })
  expect(request).toHaveBeenCalledExactlyOnceWith(`/api/v1/uploads/listings-media/info?path=${encodeURIComponent(path)}`, expect.objectContaining({ method: 'GET', headers: { 'X-Rentral-Account': actor } }))
  expect(readGalleryRecovery(actor)?.pendingUpload?.path).toBe(path)
  request.mockResolvedValueOnce(Response.json({ success: true, data: { path, size: 11, contentType: 'image/png' } }))
  await expect(readGalleryUpload(actor, marker())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('preserves an unavailable upload marker after readback instead of issuing a replacement POST', async () => {
  persistGalleryRecovery(recovery())
  const request = vi.fn().mockResolvedValue(Response.json({ success: false, code: 'UPLOAD_UNCONFIRMED', error: 'Still unavailable.' }, { status: 409 }))
  vi.stubGlobal('fetch', request)
  await expect(readGalleryUpload(actor, marker())).rejects.toMatchObject({ code: 'UPLOAD_UNCONFIRMED', status: 409 })
  expect(request).toHaveBeenCalledTimes(1)
  expect(readGalleryRecovery(actor)?.pendingUpload).toEqual(marker())
})
it('fingerprints all ordered file chunks with bounded reads and distinguishes reselection from the server digest', async () => {
  const bytes = new Uint8Array(2 * 1024 * 1024 + 5); bytes[0] = 1; bytes[1024 * 1024] = 2; bytes[bytes.length - 1] = 3
  const file = new File([bytes], 'tour.mp4', { type: 'video/mp4' })
  const wholeRead = vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('Whole file allocation forbidden'))
  const slice = vi.spyOn(file, 'slice')
  const fingerprint = await galleryFileFingerprint(file)
  expect(fingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect(fingerprint).not.toBe(createHash('sha256').update(bytes).digest('hex'))
  expect(wholeRead).not.toHaveBeenCalled(); expect(slice).toHaveBeenCalledTimes(3)
  for (const [start = 0, end = file.size] of slice.mock.calls) expect(end - start).toBeLessThanOrEqual(1024 * 1024)
  const original: GalleryUploadMarker = { ...marker(), kind: 'video', photoIndex: null, path: path.replace('.png', '.mp4'), contentType: 'video/mp4', size: file.size, fingerprint }
  expect(await reselectedGalleryFileMatches(new File([bytes], 'renamed.mp4', { type: 'video/mp4' }), original)).toBe(true)
  bytes[bytes.length - 1] = 4
  expect(await reselectedGalleryFileMatches(new File([bytes], 'tour.mp4', { type: 'video/mp4' }), original)).toBe(false)
})
it('explains secure-context requirements before attempting unsupported browser fingerprinting', async () => {
  vi.stubGlobal('crypto', {})
  await expect(galleryFileFingerprint(new File(['content'], 'photo.png', { type: 'image/png' }))).rejects.toThrow('localhost or HTTPS')
})
