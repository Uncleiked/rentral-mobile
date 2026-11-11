import { createHash, randomUUID } from 'node:crypto'
import type { Prisma, StorageObject } from '@prisma/client'
import prisma from '@/lib/db'
import { assertStorageClaimsReady, lifecyclePrepared, capturePrepared, ownerAdminPrepared, organizationsPrepared } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import { createLocalStorage, defaultStorageDirectory, type ObjectMetadata } from '@/lib/local-storage/core'
import { verifiedAvatarReference } from '@/lib/local-storage/avatars'
import { requireOwnedStoragePath, storagePath, storageFailure, uploadPolicy, StorageError, type StorageBucket } from '@/lib/local-storage/policy'

const UPLOAD_LEASE_MS = 60 * 60 * 1000
const DELETE_LEASE_MS = 5 * 60 * 1000
type ListingPaths = { videoPath?: string | null; posterPath?: string | null; documentPath?: string | null }
export type PreparedStorageObject = Readonly<{ id: string; bucket: StorageBucket; path: string; digest: string; sizeBytes: number; contentType: string }>

/** NTFS case aliases share the same durable lock even when the backend later runs on Linux. */
export function storageObjectId(bucket: StorageBucket, path: string): string {
  storagePath(bucket, path)
  return createHash('sha256').update(`${bucket}\0${path.toLowerCase()}`).digest('hex')
}

function uniqueConflict(error: unknown): boolean { return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002') }
function unavailable(): StorageError { return new StorageError(409, 'FILE_UNAVAILABLE', 'This file is missing, being removed or no longer available. Upload it with a new filename.') }
function sameObject(record: StorageObject, ownerId: string, bucket: StorageBucket, path: string): void {
  if (record.owner_id !== ownerId || record.bucket !== bucket || record.path.toLowerCase() !== path.toLowerCase()) throw unavailable()
}
function metadataFields(info: ObjectMetadata) { return { digest: info.digest, size_bytes: info.size, content_type: info.contentType } }

async function ensureRecord(ownerId: string, bucket: StorageBucket, path: string, info?: ObjectMetadata): Promise<StorageObject> {
  requireOwnedStoragePath(bucket, path, ownerId)
  const id = storageObjectId(bucket, path)
  try {
    return await prisma.storageObject.upsert({ where: { id }, update: {}, create: {
      id, bucket, path, owner_id: ownerId, state: 'available', digest: info?.digest ?? null,
      size_bytes: info?.size ?? null, content_type: info?.contentType ?? null, operation_token: null, lease_expires_at: null,
    } })
  } catch (error) {
    // Concurrent adoption may race on a deterministic id. This operation is outside
    // any business transaction; reading its winner never replays a listing create.
    if (!uniqueConflict(error)) throw error
    return prisma.storageObject.findUniqueOrThrow({ where: { id } })
  }
}

async function prepareObject(ownerId: string, bucket: StorageBucket, path: string): Promise<PreparedStorageObject> {
  requireOwnedStoragePath(bucket, path, ownerId)
  const info = await createLocalStorage(defaultStorageDirectory()).info(bucket, path).catch(error => { throw storageFailure(error) })
  const record = await ensureRecord(ownerId, bucket, path, info)
  sameObject(record, ownerId, bucket, path)
  if (record.state !== 'available') throw unavailable()
  if (record.digest === null || record.digest === undefined) {
    const updated = await prisma.storageObject.updateMany({ where: { id: record.id, owner_id: ownerId, state: 'available',
      OR: [{ digest: null }, { digest: { isSet: false } }] }, data: { ...metadataFields(info), revision: { increment: 1 } } })
    if (updated.count !== 1) {
      const fresh = await prisma.storageObject.findUniqueOrThrow({ where: { id: record.id } })
      if (fresh.state !== 'available' || fresh.digest !== info.digest || fresh.size_bytes !== info.size || fresh.content_type !== info.contentType) throw unavailable()
    }
  } else if (record.digest !== info.digest || record.size_bytes !== info.size || record.content_type !== info.contentType) throw unavailable()
  return { id: record.id, bucket, path, digest: info.digest, sizeBytes: info.size, contentType: info.contentType }
}

/** Verify actual immutable files before entering a retryable listing transaction. */
export async function prepareListingStorage(ownerId: string, paths: ListingPaths): Promise<PreparedStorageObject[]> {
  await assertStorageClaimsReady()
  const objects: PreparedStorageObject[] = []
  if (paths.videoPath) {
    const object = await prepareObject(ownerId, 'listings-media', paths.videoPath)
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(object.contentType)) throw new StorageError(415, 'INVALID_VIDEO', 'Choose an uploaded MP4, MOV or WebM walkthrough.')
    objects.push(object)
  }
  if (paths.posterPath) {
    const object = await prepareObject(ownerId, 'listings-media', paths.posterPath)
    if (object.contentType !== 'image/jpeg' || !/\.jpg$/i.test(object.path)) throw new StorageError(415, 'INVALID_POSTER', 'Choose the JPEG poster captured with this walkthrough.')
    objects.push(object)
  }
  if (paths.documentPath) objects.push(await prepareObject(ownerId, 'compliance-docs', paths.documentPath))
  return objects
}

/** Gallery images use the same immutable byte/type/digest checks as other media. */
export async function prepareGalleryPhotos(ownerId: string, paths: readonly string[]): Promise<PreparedStorageObject[]> {
  await assertStorageClaimsReady()
  if (paths.length > 10 || new Set(paths.map(path => path.toLowerCase())).size !== paths.length) throw new StorageError(400, 'INVALID_GALLERY', 'Choose up to ten different photos.')
  const objects: PreparedStorageObject[] = []
  for (const path of paths) {
    const object = await prepareObject(ownerId, 'listings-media', path)
    if (!['image/jpeg', 'image/png'].includes(object.contentType)) throw new StorageError(415, 'INVALID_GALLERY_PHOTO', 'Choose an uploaded JPEG or PNG photo.')
    objects.push(object)
  }
  return objects
}

export async function prepareAvatarStorage(ownerId: string, inputUrl: string): Promise<{ reference: string; objects: PreparedStorageObject[] }> {
  await assertStorageClaimsReady()
  const reference = await verifiedAvatarReference(inputUrl, ownerId)
  const path = reference.slice('/api/v1/files/profile-avatars/'.length)
  return { reference, objects: [await prepareObject(ownerId, 'profile-avatars', path)] }
}

/** Call in the SAME transaction that writes every listing/avatar reference. */
export async function claimStorageObjects(tx: Prisma.TransactionClient, ownerId: string, objects: readonly PreparedStorageObject[]): Promise<void> {
  await assertStorageClaimsReady()
  const sorted = [...new Map(objects.map(object => [object.id, object])).values()].sort((a, b) => a.id.localeCompare(b.id))
  for (const object of sorted) {
    requireOwnedStoragePath(object.bucket, object.path, ownerId)
    const policy = uploadPolicy(object.bucket, object.path, object.contentType)
    if (object.id !== storageObjectId(object.bucket, object.path) || !/^[a-f0-9]{64}$/.test(object.digest) ||
      !Number.isSafeInteger(object.sizeBytes) || object.sizeBytes <= 0 || object.sizeBytes > policy.maximumBytes) throw unavailable()
    // A real write, not a no-op read, conflicts with another process's deletion
    // transaction. The parent reference and this revision commit atomically.
    const locked = await tx.storageObject.updateMany({ where: { id: object.id, owner_id: ownerId, bucket: object.bucket,
      state: 'available', digest: object.digest, size_bytes: object.sizeBytes, content_type: object.contentType }, data: { revision: { increment: 1 } } })
    if (locked.count !== 1) throw unavailable()
  }
}

/** Reserve an immutable path before any bytes are streamed, then publish its verified metadata. */
export async function uploadStoredObject(ownerId: string, bucket: StorageBucket, path: string, body: ReadableStream<Uint8Array> | null, contentType: string | null): Promise<{ path: string }> {
  await assertStorageClaimsReady()
  requireOwnedStoragePath(bucket, path, ownerId)
  const policy = uploadPolicy(bucket, path, contentType)
  if (!body) throw new StorageError(400, 'EMPTY_FILE', 'Choose a non-empty file.')
  const id = storageObjectId(bucket, path), token = randomUUID()
  try {
    await prisma.storageObject.create({ data: { id, bucket, path, owner_id: ownerId, state: 'uploading',
      operation_token: token, lease_expires_at: new Date(Date.now() + UPLOAD_LEASE_MS), digest: null, size_bytes: null, content_type: null } })
  } catch (error) {
    if (!uniqueConflict(error)) throw error
    const existing = await prisma.storageObject.findUniqueOrThrow({ where: { id } })
    sameObject(existing, ownerId, bucket, path)
    if (['deleting', 'deleted'].includes(existing.state)) throw unavailable()
    throw new StorageError(409, 'FILE_EXISTS', 'This filename is already used or uploading. Use a new filename for another file.')
  }
  const storage = createLocalStorage(defaultStorageDirectory())
  let result: { path: string }
  try { result = await storage.upload(bucket, path, body, policy.contentType) }
  catch (error) {
    // A duplicate upload can encounter an existing pre-claims object. Adopt its
    // verified metadata without removing or replacing those existing bytes.
    const existing = await storage.info(bucket, path).catch(() => null)
    if (existing) await prisma.storageObject.updateMany({ where: { id, state: 'uploading', operation_token: token },
      data: { state: 'available', ...metadataFields(existing), operation_token: null, lease_expires_at: null, revision: { increment: 1 } } }).catch(() => undefined)
    else await prisma.storageObject.deleteMany({ where: { id, state: 'uploading', operation_token: token } }).catch(() => undefined)
    throw error
  }
  try {
    const info = await storage.info(bucket, path)
    const finished = await prisma.storageObject.updateMany({ where: { id, owner_id: ownerId, state: 'uploading', operation_token: token },
      data: { state: 'available', ...metadataFields(info), upload_completed_at: new Date(), operation_token: null, lease_expires_at: null, revision: { increment: 1 } } })
    if (finished.count === 1) return result
    const current = await prisma.storageObject.findUniqueOrThrow({ where: { id } })
    if (current.state === 'available' && current.digest === info.digest && current.size_bytes === info.size && current.content_type === info.contentType) return result
    if (['deleting', 'deleted'].includes(current.state)) {
      await storage.remove(bucket, path)
      await prisma.storageObject.updateMany({ where: { id, state: 'deleting' }, data: { state: 'deleted', operation_token: null, lease_expires_at: null } })
      throw unavailable()
    }
  } catch (error) {
    if (error instanceof StorageError && error.code === 'FILE_UNAVAILABLE') throw error
    // An acknowledgement can be lost AFTER available committed. Keep the bytes:
    // another request may already have attached them to a listing in that case.
    throw new StorageError(503, 'UPLOAD_UNCERTAIN', 'The upload could not be confirmed. Check your files before trying again; the uploaded bytes were retained.')
  }
  throw new StorageError(503, 'UPLOAD_UNCERTAIN', 'The upload could not be confirmed. Check your files before trying again.')
}

async function referenced(tx: Prisma.TransactionClient, bucket: StorageBucket, path: string): Promise<boolean> {
  // New domain fields retaining object paths must join this reference registry
  // and use claimStorageObjects in their reference-writing transaction.
  const match = { equals: path, mode: 'insensitive' as const }
  if (bucket === 'listings-media') {
    if (await tx.listing.findFirst({ where: { OR: [{ video_path: match }, { poster_path: match }] }, select: { id: true } })) return true
    if (await ownerAdminPrepared() && await tx.listing.findFirst({ where: { gallery_media_paths: { has: path.toLowerCase() } }, select: { id: true } })) return true
    if (await capturePrepared() && await tx.listingCapture.findFirst({ where: { state: 'sealed', video_path: match }, select: { id: true } })) return true
    return Boolean(await tx.mediaAsset.findFirst({ where: { source_path: match }, select: { id: true } }))
  }
  if (bucket === 'compliance-docs') {
    if (await organizationsPrepared() && await tx.organizationApplication.findFirst({ where: { evidence_paths: { has: path.toLowerCase() } }, select: { id: true } })) return true
    if (await tx.listing.findFirst({ where: { document_path: match }, select: { id: true } })) return true
    if (!await lifecyclePrepared()) return false
    if (await tx.renewal.findFirst({ where: { evidence_path: match }, select: { id: true } })) return true
    return Boolean(await tx.leaseTermination.findFirst({ where: { evidence_path: match }, select: { id: true } }))
  }
  return Boolean(await tx.user.findFirst({ where: { avatar_url: { endsWith: `/profile-avatars/${path}`, mode: 'insensitive' } }, select: { id: true } }))
}

/** Commit a durable deletion tombstone before touching disk. Safe to retry after crashes. */
export async function removeStoredObjects(ownerId: string, bucket: StorageBucket, paths: readonly string[]): Promise<void> {
  await assertStorageClaimsReady()
  if (!paths.length || paths.length > 100) throw new StorageError(400, 'INVALID_REQUEST', 'Remove between 1 and 100 files at a time.')
  for (const path of paths) requireOwnedStoragePath(bucket, path, ownerId)
  const objects = [...new Map(paths.map(path => [storageObjectId(bucket, path), path])).entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [, path] of objects) await ensureRecord(ownerId, bucket, path)
  await withTransaction(async tx => {
    for (const [id, path] of objects) {
      await tx.storageObject.updateMany({ where: { id, owner_id: ownerId }, data: { revision: { increment: 1 } } })
      const current = await tx.storageObject.findUniqueOrThrow({ where: { id } })
      sameObject(current, ownerId, bucket, path)
      if (current.state === 'uploading' && (!current.lease_expires_at || current.lease_expires_at > new Date())) throw new StorageError(409, 'UPLOAD_IN_PROGRESS', 'This file is still uploading. Wait for the upload to finish before removing it.')
      if (await referenced(tx, bucket, path)) throw new StorageError(409, 'FILE_IN_USE', 'This file is attached to a listing or profile and cannot be removed.')
    }
    // Validate the entire batch before authorizing any deletion.
    for (const [id] of objects) await tx.storageObject.update({ where: { id }, data: { state: 'deleting',
      operation_token: randomUUID(), lease_expires_at: new Date(Date.now() + DELETE_LEASE_MS) } })
  })
  const storage = createLocalStorage(defaultStorageDirectory())
  for (const [id, path] of objects) {
    await storage.remove(bucket, path)
    await prisma.storageObject.updateMany({ where: { id, state: 'deleting' }, data: { state: 'deleted', operation_token: null, lease_expires_at: null } })
  }
}
