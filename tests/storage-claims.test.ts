import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type { Prisma, StorageObject } from '@prisma/client'
import { createLocalStorage } from '@/lib/local-storage/core'

const mocks = vi.hoisted(() => ({ ready: vi.fn(), create: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), find: vi.fn(), deleteMany: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertStorageClaimsReady: mocks.ready }))
vi.mock('@/lib/db', () => ({ default: { storageObject: { create: mocks.create, upsert: mocks.upsert, updateMany: mocks.updateMany,
  findUniqueOrThrow: mocks.find, deleteMany: mocks.deleteMany } } }))
import { prepareListingStorage, claimStorageObjects, uploadStoredObject, storageObjectId } from '@/lib/storage-claims/service'

let root: string
const path = 'owner/capture/video.mov'
const movie = new Uint8Array(64)
movie.set([0, 0, 0, 24, ...Buffer.from('ftypqt  ')])
function stream(bytes: Uint8Array): ReadableStream<Uint8Array> { return new Blob([new Uint8Array(bytes)]).stream() }

beforeEach(async () => {
  vi.resetAllMocks()
  const base = resolve('test-results'); await mkdir(base, { recursive: true }); root = await mkdtemp(join(base, 'storage-claims-unit-'))
  vi.stubEnv('RENTRAL_STORAGE_DIR', root)
  mocks.ready.mockResolvedValue(undefined)
  mocks.create.mockResolvedValue(undefined)
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.deleteMany.mockResolvedValue({ count: 1 })
  mocks.upsert.mockImplementation(({ create }: { create: Prisma.StorageObjectCreateInput }): StorageObject => ({
    revision: 0, digest: null, size_bytes: null, content_type: null, operation_token: null, ...create,
    createdAt: new Date(), updatedAt: new Date(), lease_expires_at: null,
  }))
})
afterEach(async () => {
  vi.unstubAllEnvs()
  if (!resolve(root).startsWith(`${resolve('test-results')}${sep}`) || !root.includes('storage-claims-unit-')) throw new Error('Unsafe owned fixture cleanup')
  await rm(root, { recursive: true, force: true })
})

it('fails closed before creating a record when storage indexes are not prepared', async () => {
  mocks.ready.mockRejectedValue(new Error('STORAGE_SETUP_REQUIRED'))
  await expect(uploadStoredObject('owner', 'listings-media', path, stream(movie), 'video/quicktime')).rejects.toThrow('STORAGE_SETUP_REQUIRED')
  expect(mocks.create).not.toHaveBeenCalled()
})

it('requires real file bytes before preparing a listing reference', async () => {
  await expect(prepareListingStorage('owner', { videoPath: path })).rejects.toMatchObject({ status: 404 })
  expect(mocks.upsert).not.toHaveBeenCalled()
})

it('records verified immutable metadata before making an upload available', async () => {
  expect(await uploadStoredObject('owner', 'listings-media', path, stream(movie), 'video/quicktime')).toEqual({ path })
  expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: storageObjectId('listings-media', path), owner_id: 'owner', state: 'uploading', operation_token: expect.any(String) }) })
  const info = await createLocalStorage(root).info('listings-media', path)
  expect(mocks.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ state: 'uploading', operation_token: expect.any(String) }),
    data: expect.objectContaining({ state: 'available', digest: info.digest, size_bytes: movie.length, content_type: 'video/quicktime' }) })
})

it('retains file bytes after an ambiguous database acknowledgement', async () => {
  mocks.updateMany.mockRejectedValueOnce(new Error('Acknowledgement lost'))
  await expect(uploadStoredObject('owner', 'listings-media', path, stream(movie), 'video/quicktime')).rejects.toMatchObject({ code: 'UPLOAD_UNCERTAIN' })
  expect((await createLocalStorage(root).info('listings-media', path)).size).toBe(movie.length)
  expect(mocks.deleteMany).not.toHaveBeenCalled()
})

it('adopts a pre-claims file on duplicate upload without removing or replacing it', async () => {
  const storage = createLocalStorage(root)
  await storage.upload('listings-media', path, stream(movie), 'video/quicktime')
  const original = await storage.info('listings-media', path)
  await expect(uploadStoredObject('owner', 'listings-media', path, stream(movie), 'video/quicktime')).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await storage.info('listings-media', path)).toEqual(original)
  expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'available', digest: original.digest }) }))
  expect(mocks.deleteMany).not.toHaveBeenCalled()
})

it('releases only its failed upload reservation when no final object exists', async () => {
  await expect(uploadStoredObject('owner', 'listings-media', path, stream(new Uint8Array([1, 2, 3])), 'video/quicktime')).rejects.toMatchObject({ status: 415 })
  expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: storageObjectId('listings-media', path), state: 'uploading', operation_token: expect.any(String) } })
})

it('uses one canonical serialization key for case aliases', () => {
  expect(storageObjectId('listings-media', path)).toBe(storageObjectId('listings-media', 'owner/CAPTURE/VIDEO.MOV'))
  expect(storageObjectId('compliance-docs', path)).not.toBe(storageObjectId('listings-media', path))
})

it('does not claim a file that another process already marked for deletion', async () => {
  await createLocalStorage(root).upload('listings-media', path, stream(movie), 'video/quicktime')
  const prepared = await prepareListingStorage('owner', { videoPath: path })
  const locked = vi.fn().mockResolvedValue({ count: 0 })
  // This isolated transaction boundary supplies only the actual delegate used.
  const tx = { storageObject: { updateMany: locked } } as unknown as Prisma.TransactionClient
  await expect(claimStorageObjects(tx, 'owner', prepared)).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
  expect(locked).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ state: 'available', digest: prepared[0].digest }), data: { revision: { increment: 1 } } }))
})

it('rejects another account before adopting or claiming its file', async () => {
  await expect(prepareListingStorage('stranger', { videoPath: path })).rejects.toMatchObject({ status: 403 })
  expect(mocks.upsert).not.toHaveBeenCalled()
})
