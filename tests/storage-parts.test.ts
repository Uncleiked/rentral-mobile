import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ ready: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), part: vi.fn(), info: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertStorageClaimsReady: mocks.ready }))
vi.mock('@/lib/db', () => ({ default: { storageObject: { findUnique: mocks.find, findUniqueOrThrow: mocks.find, create: mocks.create, updateMany: mocks.update } } }))
vi.mock('@/lib/local-storage/app', () => ({ createAppStorage: () => ({ uploadPart: mocks.part, info: mocks.info, remove: mocks.remove }) }))
import { uploadStoredPart } from '@/lib/storage-claims/service'
const path = 'owner/folder/photo.png', total = 4000000, digest = 'a'.repeat(64)
const record = { id: 'claim', owner_id: 'owner', bucket: 'listings-media', path, state: 'uploading', operation_token: 'chunked:fixture-token', revision: 0 }
const send = (part = 0) => uploadStoredPart('owner', 'listings-media', path, new Blob(['bounded']).stream(), 'image/png', total, part)
beforeEach(() => { vi.resetAllMocks(); mocks.ready.mockResolvedValue(undefined); mocks.find.mockResolvedValue(record); mocks.create.mockImplementation(({ data }) => ({ ...data, revision: 0 })); mocks.update.mockResolvedValue({ count: 1 }); mocks.part.mockResolvedValue({ path, complete: false, nextPart: 1 }); mocks.info.mockResolvedValue({ size: total, contentType: 'image/png', digest, createdAt: new Date().toISOString() }) })
it('reserves one immutable claim and does not publish or release partial uploads', async () => {
 mocks.find.mockResolvedValue(null); expect(await send()).toMatchObject({ complete: false })
 expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ owner_id: 'owner', state: 'uploading', operation_token: expect.stringMatching(/^chunked:/) }) }); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.info).not.toHaveBeenCalled()
})
it('reuses the original claim for later and explicitly repeated parts', async () => { await send(1); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.part).toHaveBeenCalledWith('listings-media', path, expect.anything(), 'image/png', total, 1) })
it('marks a claim available only after final full-file metadata is confirmed', async () => {
 mocks.part.mockResolvedValue({ path, complete: true, nextPart: 2 }); await send(1)
 expect(mocks.update).toHaveBeenCalledWith({ where: expect.objectContaining({ state: 'uploading', operation_token: record.operation_token }), data: expect.objectContaining({ state: 'available', digest, size_bytes: total, operation_token: null }) })
})
it('retains original chunks/claim on an ambiguous acknowledgement for readback and explicit retry', async () => {
 mocks.part.mockRejectedValue(new Error('acknowledgement lost')); await expect(send()).rejects.toThrow('acknowledgement lost'); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled()
})
it.each([{ ...record, owner_id: 'other' }, { ...record, state: 'deleted' }, { ...record, operation_token: 'single-request-token' }])('rejects another owner, a tombstone or a conflicting upload protocol before writing bytes', async item => { mocks.find.mockResolvedValue(item); await expect(send()).rejects.toMatchObject({ status: 409 }); expect(mocks.part).not.toHaveBeenCalled() })
it('rejects a later part without its first claim and fails closed before any claim if setup is missing', async () => {
 mocks.find.mockResolvedValue(null); await expect(send(1)).rejects.toMatchObject({ code: 'UPLOAD_PART_ORDER' }); expect(mocks.create).not.toHaveBeenCalled()
 mocks.ready.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED')); await expect(send()).rejects.toThrow('DATABASE_SETUP_REQUIRED'); expect(mocks.create).not.toHaveBeenCalled()
})
it('recovers a final claim acknowledgement using its exact stored digest', async () => {
 mocks.part.mockResolvedValue({ path, complete: true, nextPart: 2 }); mocks.update.mockResolvedValue({ count: 0 }); mocks.find.mockResolvedValueOnce(record).mockResolvedValueOnce({ ...record, state: 'available', digest, size_bytes: total, content_type: 'image/png' })
 expect(await send(1)).toMatchObject({ complete: true }); expect(mocks.remove).not.toHaveBeenCalled()
})

