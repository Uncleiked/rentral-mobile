import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type { Prisma, StorageObject } from '@prisma/client'
import { createLocalStorage } from '@/lib/local-storage/core'

const mocks = vi.hoisted(() => ({ ready: vi.fn(), create: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), find: vi.fn(), deleteMany: vi.fn(), reference: vi.fn(), organizations: vi.fn(), organizationReference: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertStorageClaimsReady: mocks.ready, organizationsPrepared: mocks.organizations, ownerAdminPrepared: async () => true, capturePrepared: async () => false, lifecyclePrepared: async () => false }))
vi.mock('@/lib/db', () => ({ default: { storageObject: { create: mocks.create, upsert: mocks.upsert, updateMany: mocks.updateMany,
  findUniqueOrThrow: mocks.find, deleteMany: mocks.deleteMany } } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ storageObject: { updateMany: mocks.updateMany, findUniqueOrThrow: mocks.find }, listing: { findFirst: mocks.reference }, organizationApplication: { findFirst: mocks.organizationReference }, mediaAsset: { findFirst: mocks.reference } }) }))
import { prepareGalleryPhotos, prepareListingStorage, claimStorageObjects, removeStoredObjects, uploadStoredObject, storageObjectId } from '@/lib/storage-claims/service'

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
  mocks.organizations.mockResolvedValue(false)
  mocks.create.mockResolvedValue(undefined)
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.deleteMany.mockResolvedValue({ count: 1 })
  mocks.upsert.mockImplementation(({ create }: { create: Prisma.StorageObjectCreateInput }): StorageObject => ({
    revision: 0, digest: null, size_bytes: null, content_type: null, operation_token: null, ...create,
    createdAt: new Date(), updatedAt: new Date(), lease_expires_at: null,
    upload_completed_at: typeof create.upload_completed_at === 'string' ? new Date(create.upload_completed_at) : create.upload_completed_at ?? null,
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

it('validates actual JPEG/PNG gallery bytes and rejects a video used as a photo', async () => {
  const storage = createLocalStorage(root), jpg = 'owner/gallery/one.jpeg', png = 'owner/gallery/two.png'
  await storage.upload('listings-media', jpg, stream(new Uint8Array([255,216,255,224,0,0,0,0])), 'image/jpeg')
  await storage.upload('listings-media', png, stream(new Uint8Array([137,80,78,71,13,10,26,10])), 'image/png')
  expect((await prepareGalleryPhotos('owner', [jpg,png])).map(item => item.contentType)).toEqual(['image/jpeg','image/png'])
  await storage.upload('listings-media', path, stream(movie), 'video/quicktime')
  await expect(prepareGalleryPhotos('owner', [path])).rejects.toMatchObject({ code: 'INVALID_GALLERY_PHOTO' })
})

it('retains a secondary gallery photo referenced only through the normalized gallery path registry', async () => {
  const storage = createLocalStorage(root), photo = 'owner/gallery/secondary.jpg'
  await storage.upload('listings-media', photo, stream(new Uint8Array([255,216,255,224,0,0,0,0])), 'image/jpeg')
  const info = await storage.info('listings-media', photo)
  mocks.find.mockResolvedValue({ id: storageObjectId('listings-media', photo), owner_id: 'owner', bucket: 'listings-media', path: photo, state: 'available', digest: info.digest })
  mocks.reference.mockImplementation(({ where }: { where: Record<string, unknown> }) => where.gallery_media_paths ? { id: 'gallery-listing' } : null)
  await expect(removeStoredObjects('owner', 'listings-media', [photo])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
  expect(await storage.info('listings-media', photo)).toMatchObject({ digest: info.digest })
  expect(mocks.reference).toHaveBeenCalledWith({ where: { gallery_media_paths: { has: photo } }, select: { id: true } })
})

it('records verified immutable metadata before making an upload available', async () => {
  expect(await uploadStoredObject('owner', 'listings-media', path, stream(movie), 'video/quicktime')).toEqual({ path })
  expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: storageObjectId('listings-media', path), owner_id: 'owner', state: 'uploading', operation_token: expect.any(String) }) })
  const info = await createLocalStorage(root).info('listings-media', path)
  expect(mocks.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ state: 'uploading', operation_token: expect.any(String) }),
    data: expect.objectContaining({ state: 'available', digest: info.digest, size_bytes: movie.length, content_type: 'video/quicktime', upload_completed_at: expect.any(Date) }) })
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

it('retains current and historical organization registration evidence when deletion is requested', async () => {
  const storage = createLocalStorage(root), document = 'owner/previous/Registration.pdf'
  await storage.upload('compliance-docs', document, stream(new Uint8Array(Buffer.from('%PDF-1.7\nSynthetic retained registration proof.'))), 'application/pdf')
  const info = await storage.info('compliance-docs', document)
  mocks.find.mockResolvedValue({ id: storageObjectId('compliance-docs', document), owner_id: 'owner', bucket: 'compliance-docs', path: document, state: 'available', digest: info.digest })
  mocks.organizations.mockResolvedValue(true)
  mocks.organizationReference.mockResolvedValue({ id: 'organization-application' })
  await expect(removeStoredObjects('owner', 'compliance-docs', [document])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
  expect(mocks.organizationReference).toHaveBeenCalledExactlyOnceWith({ where: { evidence_paths: { has: document.toLowerCase() } }, select: { id: true } })
  expect(await storage.info('compliance-docs', document)).toMatchObject({ digest: info.digest })
  expect(mocks.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'deleting' }) }))
})
function preparedPhoto(name: string) {
  const photoPath = 'owner/batch/' + name + '.jpg'
  return { id: storageObjectId('listings-media', photoPath), bucket: 'listings-media' as const, path: photoPath, digest: 'a'.repeat(64), sizeBytes: 100, contentType: 'image/jpeg' }
}
it('claims a maximum gallery batch with one bounded write that retains every immutable object binding', async () => {
  const objects = Array.from({ length: 10 }, (_, index) => preparedPhoto(String(index)))
  const write = vi.fn().mockResolvedValue({ count: objects.length }), tx = { storageObject: { updateMany: write } } as unknown as Prisma.TransactionClient
  await claimStorageObjects(tx, 'owner', objects)
  expect(write).toHaveBeenCalledOnce()
  const query = write.mock.calls[0][0]
  expect(query.where).toMatchObject({ owner_id: 'owner', state: 'available' })
  expect(query.where.OR).toHaveLength(objects.length)
  for (const object of objects) expect(query.where.OR).toContainEqual({ id: object.id, bucket: object.bucket, digest: object.digest, size_bytes: object.sizeBytes, content_type: object.contentType })
})
it('rejects a partial batch claim instead of accepting the files that happened to match', async () => {
  const write = vi.fn().mockResolvedValue({ count: 1 }), tx = { storageObject: { updateMany: write } } as unknown as Prisma.TransactionClient
  await expect(claimStorageObjects(tx, 'owner', [preparedPhoto('one'), preparedPhoto('two')])).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
  expect(write).toHaveBeenCalledOnce()
})
it('validates every proof before any write and refuses conflicting duplicate fingerprints', async () => {
  const first = preparedPhoto('one'), write = vi.fn(), tx = { storageObject: { updateMany: write } } as unknown as Prisma.TransactionClient
  for (const objects of [[first, { ...preparedPhoto('two'), sizeBytes: -1 }], [first, { ...first, digest: 'b'.repeat(64) }], [{ ...first, sizeBytes: -1 }, first]]) {
    await expect(claimStorageObjects(tx, 'owner', objects)).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
  }
  expect(write).not.toHaveBeenCalled()
})
it('deduplicates equivalent case aliases and keeps an empty proof set free of writes', async () => {
  const first = preparedPhoto('one'), write = vi.fn().mockResolvedValue({ count: 1 }), tx = { storageObject: { updateMany: write } } as unknown as Prisma.TransactionClient
  await claimStorageObjects(tx, 'owner', [first, { ...first, path: 'owner/BATCH/ONE.JPG' }])
  expect(write).toHaveBeenCalledOnce()
  write.mockClear(); await claimStorageObjects(tx, 'owner', []); expect(write).not.toHaveBeenCalled()
})


async function galleryFixturePhotos(count: number): Promise<string[]> {
  const storage = createLocalStorage(root), paths = Array.from({ length: count }, (_, index) => 'owner/concurrent/photo_' + index + '.jpg')
  for (const path of paths) await storage.upload('listings-media', path, stream(new Uint8Array([255,216,255,224,0,0,0,0])), 'image/jpeg')
  return paths
}
it('bounds gallery verification to four concurrent jobs while preserving the chosen photo order', async () => {
  const paths = await galleryFixturePhotos(10), original = mocks.upsert.getMockImplementation()!
  let active = 0, peak = 0, draining = false
  const releases = new Map<string, () => void>()
  mocks.upsert.mockImplementation(async (args: { create: Prisma.StorageObjectCreateInput }) => {
    active += 1; peak = Math.max(peak, active)
    try { if (!draining) await new Promise<void>(resolve => releases.set(String(args.create.path), resolve)); return original(args) }
    finally { active -= 1 }
  })
  const pending = prepareGalleryPhotos('owner', paths)
  try {
    for (const batch of [paths.slice(0,4), paths.slice(4,8), paths.slice(8)]) {
      await vi.waitFor(() => expect(batch.every(path => releases.has(path))).toBe(true))
      for (const path of [...batch].reverse()) { releases.get(path)!(); releases.delete(path) }
    }
    expect((await pending).map(object => object.path)).toEqual(paths)
    expect(peak).toBe(4); expect(active).toBe(0)
  } finally { draining = true; for (const release of releases.values()) release(); await pending.catch(() => undefined) }
})
it('drains the current verification batch before rejecting and never starts later photos after a failure', async () => {
  const paths = await galleryFixturePhotos(5), original = mocks.upsert.getMockImplementation()!
  const jobs = new Map<string, { resolve: () => void; reject: (error: Error) => void }>()
  let settled = false, draining = false
  mocks.upsert.mockImplementation(async (args: { create: Prisma.StorageObjectCreateInput }) => {
    if (!draining) await new Promise<void>((resolve, reject) => jobs.set(String(args.create.path), { resolve, reject }))
    return original(args)
  })
  const pending = prepareGalleryPhotos('owner', paths).then(() => { settled = true; return null }, error => { settled = true; return error })
  try {
    await vi.waitFor(() => expect(jobs.size).toBe(4))
    jobs.get(paths[0])!.reject(new Error('Owned verification failure'))
    await Promise.resolve(); await Promise.resolve()
    expect(settled).toBe(false)
    for (const path of paths.slice(1,4)) jobs.get(path)!.resolve()
    expect(await pending).toMatchObject({ message: 'Owned verification failure' })
    expect(mocks.upsert).toHaveBeenCalledTimes(4)
    expect(jobs.has(paths[4])).toBe(false)
  } finally { draining = true; for (const job of jobs.values()) job.resolve(); await pending }
})
