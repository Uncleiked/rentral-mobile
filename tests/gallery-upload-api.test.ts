import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ identity: vi.fn(), permission: vi.fn(), upload: vi.fn(), transaction: {} }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/listings/gallery', () => ({ assertGalleryPermission: mocks.permission }))
vi.mock('@/lib/storage-claims/service', () => ({ uploadStoredObject: mocks.upload, removeStoredObjects: vi.fn() }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: async (work: (tx: object) => Promise<unknown>) => work(mocks.transaction) }))
import { POST } from '@/app/api/v1/uploads/[bucket]/route'
import { ApiError } from '@/lib/api/http'
const path = 'owner/gallery/photo.jpg'
const request = (query = '') => new Request(`https://rentral.example/api/v1/uploads/listings-media${query}`, { method: 'POST', headers: { 'x-upload-path': path, 'content-type': 'image/jpeg' }, body: new Uint8Array([255,216,255,224]) })
const context = { params: Promise.resolve({ bucket: 'listings-media' }) }
beforeEach(() => { vi.resetAllMocks(); mocks.identity.mockResolvedValue({ userId: 'owner' }); mocks.permission.mockResolvedValue(3); mocks.upload.mockResolvedValue({ path }) })
it('authorizes explicit gallery byte uploads using the current account and exact grant revision', async () => {
  expect((await POST(request('?mediaSource=approved_gallery&permissionRevision=3'), context)).status).toBe(201)
  expect(mocks.permission).toHaveBeenCalledExactlyOnceWith(mocks.transaction, 'owner', 3)
  expect(mocks.upload).toHaveBeenCalledWith('owner', 'listings-media', path, expect.anything(), 'image/jpeg')
})
it('rejects revoked, changed or omitted gallery approval before reserving or streaming any file', async () => {
  mocks.permission.mockRejectedValue(new ApiError(403, 'GALLERY_PERMISSION_REQUIRED', 'Current approval required.'))
  expect((await POST(request('?mediaSource=approved_gallery&permissionRevision=2'), context)).status).toBe(403)
  for (const query of ['?mediaSource=approved_gallery', '?mediaSource=approved_gallery&permissionRevision=', '?mediaSource=approved_gallery&permissionRevision=1.5']) expect((await POST(request(query), context)).status).toBe(400)
  expect(mocks.upload).not.toHaveBeenCalled()
})
it('retains the original recorded upload protocol without granting gallery permission', async () => {
  expect((await POST(request(), context)).status).toBe(201)
  expect(mocks.permission).not.toHaveBeenCalled()
})
