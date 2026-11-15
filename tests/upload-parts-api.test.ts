import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ identity: vi.fn(), part: vi.fn(), single: vi.fn(), gallery: vi.fn(), allow: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: m.identity }))
vi.mock('@/lib/api/rate-limit', () => ({ apiRateLimiter: { allow: m.allow } }))
vi.mock('@/lib/storage-claims/service', () => ({ uploadStoredPart: m.part, uploadStoredObject: m.single, removeStoredObjects: vi.fn() }))
vi.mock('@/lib/local-storage/app', () => ({ createAppStorage: vi.fn(), appStorageDriver: () => 'mongodb' }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (task: (tx: unknown) => unknown) => task({}) }))
vi.mock('@/lib/listings/gallery', () => ({ assertGalleryPermission: m.gallery }))
import { GET, POST } from '@/app/api/v1/uploads/[bucket]/route'
import { UPLOAD_PART_BYTES } from '@/lib/contracts/upload-transport'
import { ApiError } from '@/lib/api/http'
const path = 'owner/folder/photo.png', context = { params: Promise.resolve({ bucket: 'listings-media' }) }
const request = (extra: Record<string, string> = {}, query = '') => new Request('https://rentral.example/api/v1/uploads/listings-media' + query, { method: 'POST', headers: { 'x-upload-path': path, 'content-type': 'image/png', 'x-upload-total-size': '4000000', 'x-upload-part': '0', ...extra }, body: new Uint8Array([1,2,3]) })
beforeEach(() => { vi.resetAllMocks(); m.identity.mockResolvedValue({ userId: 'owner' }); m.allow.mockReturnValue(true); m.part.mockResolvedValue({ path, complete: false, nextPart: 1 }) })
it('advertises only the bounded upload capability to an authenticated account', async () => { const response = await GET(new Request('https://rentral.example/api/v1/uploads/listings-media?capabilities=1'), context); expect(await response.json()).toEqual({ success: true, data: { chunked: true, partSize: UPLOAD_PART_BYTES } }) })
it('preserves mutation authorization and uses a separate bounded part rate bucket', async () => {
 const response = await POST(request(), context); expect(response.status).toBe(201)
 expect(m.identity).toHaveBeenCalledWith(expect.any(Request), { mutation: true, rateLimit: 'upload_part' }); expect(m.part).toHaveBeenCalledWith('owner', 'listings-media', path, expect.anything(), 'image/png', 4000000, 0); expect(m.single).not.toHaveBeenCalled()
})
it('checks current gallery permission on every part and refuses a revoked revision', async () => { m.gallery.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Permission revoked')); expect((await POST(request({ 'x-upload-part': '1' }, '?mediaSource=approved_gallery&permissionRevision=3'), context)).status).toBe(403); expect(m.gallery).toHaveBeenCalledWith(expect.anything(), 'owner', 3); expect(m.part).not.toHaveBeenCalled() })
const invalidHeaders: Record<string, string>[] = [{ 'x-upload-path': 'other/folder/photo.png' }, { 'x-upload-part': '-1' }, { 'x-upload-total-size': 'invalid' }, { 'content-length': String(UPLOAD_PART_BYTES + 1) }]
it.each(invalidHeaders)('rejects cross-account paths and invalid or oversized part headers', async extra => { expect((await POST(request(extra), context)).status).toBeGreaterThanOrEqual(400); expect(m.part).not.toHaveBeenCalled() })
it('stops new upload starts when their dedicated cap is exceeded', async () => { m.allow.mockReturnValue(false); expect((await POST(request(), context)).status).toBe(429); expect(m.part).not.toHaveBeenCalled() })

