import { createHash } from 'node:crypto'
import type { ListingCapture, Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { claimStorageObjects, prepareListingStorage, storageObjectId, type PreparedStorageObject } from '@/lib/storage-claims/service'
import { beginCaptureInputSchema, finishCaptureInputSchema, sealCaptureInputSchema, checkCaptureAddressInputSchema,
  captureStatusSchema, captureAddressResultSchema, CAPTURE_FINISH_WINDOW_MS, CAPTURE_SEAL_WINDOW_MS, type CaptureReading } from '@/lib/contracts/capture'
import { addressFingerprint, decodeGeographicPoint, distanceMetersWgs84, geocodeListingAddressWithReason, SPATIAL_TOLERANCE_METERS } from './spatial'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const point = (reading: CaptureReading) => ({ type: 'Point', coordinates: [reading.longitude, reading.latitude] })
const unavailable = () => new ApiError(409, 'CAPTURE_REQUIRED', 'Record a new walkthrough with its location before submitting this listing.')
const expired = () => new ApiError(409, 'CAPTURE_EXPIRED', 'This recording session expired. Record a fresh walkthrough.')

export function assertFreshCaptureReading(reading: CaptureReading, now = new Date()): void {
  const age = now.getTime() - new Date(reading.capturedAt).getTime()
  if (reading.mocked || age < -5000 || age > 15000) throw new ApiError(400, 'GPS_READING_REJECTED', 'A fresh, precise device location is required. Enable precise location and record again.')
}

function captureDto(row: ListingCapture, now = new Date()) {
  const hasExpired = row.state === 'recording' ? row.finish_by <= now : row.state === 'recorded' && (!row.seal_by || row.seal_by <= now)
  return captureStatusSchema.parse({ id: row.id, status: hasExpired ? 'expired' : row.state,
    startedAt: row.started_at.toISOString(), finishBy: row.finish_by.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null,
    sealBy: row.seal_by?.toISOString() ?? null, videoPath: row.video_path ?? null, listingId: row.listing_id ?? null })
}

async function assertRecordingSession(tx: Prisma.TransactionClient, ownerId: string, sessionId: string | undefined, now: Date): Promise<void> {
  if (!sessionId || !await tx.authSession.findFirst({ where: { id: sessionId, user_id: ownerId, OR: [{ revoked_at: null }, { revoked_at: { isSet: false } }], expires_at: { gt: now } }, select: { id: true } })) {
    throw new ApiError(401, 'SESSION_REQUIRED', 'Sign in again before recording your walkthrough.')
  }
}
async function ownedCapture(tx: Prisma.TransactionClient, ownerId: string, id: string, sessionId?: string): Promise<ListingCapture> {
  const owned = await tx.listingCapture.findFirst({ where: { id, owner_id: ownerId, ...(sessionId !== undefined ? { session_id: sessionId } : {}) }, select: { id: true } })
  if (!owned) throw new ApiError(404, 'CAPTURE_NOT_FOUND', 'This recording session is unavailable to your account.')
  if (!await lockRecord(tx, 'listingCapture', id)) throw new ApiError(404, 'CAPTURE_NOT_FOUND', 'This recording session is unavailable to your account.')
  const row = await tx.listingCapture.findFirst({ where: { id, owner_id: ownerId } })
  if (!row || sessionId !== undefined && row.session_id !== sessionId) throw new ApiError(404, 'CAPTURE_NOT_FOUND', 'This recording session is unavailable to this signed-in session.')
  return row
}

export async function getCaptureForOwner(ownerId: string, id: string) {
  const row = await prisma.listingCapture.findFirst({ where: { id, owner_id: ownerId } })
  if (!row) throw new ApiError(404, 'CAPTURE_NOT_FOUND', 'This recording session is unavailable to your account.')
  return captureDto(row)
}

export async function beginCaptureForOwner(ownerId: string, sessionId: string | undefined, input: unknown) {
  const data = beginCaptureInputSchema.parse(input), hash = digest(data)
  try {
    return await withTransaction(async tx => {
      const now = new Date()
      await assertActiveAccounts(tx, [ownerId]); await assertRecordingSession(tx, ownerId, sessionId, now)
      const existing = await tx.listingCapture.findUnique({ where: { id: data.id } })
      if (existing) {
        if (existing.owner_id !== ownerId || existing.session_id !== sessionId || existing.begin_hash !== hash) throw new ApiError(409, 'CAPTURE_CONFLICT', 'This recording identifier belongs to another capture. Record a new take.')
        return captureDto(existing)
      }
      assertFreshCaptureReading(data.reading, now)
      const row = await tx.listingCapture.create({ data: { id: data.id, owner_id: ownerId, session_id: sessionId!, begin_hash: hash,
        start_geometry: point(data.reading), start_accuracy: data.reading.accuracy, start_sample_at: new Date(data.reading.capturedAt),
        started_at: now, finish_by: new Date(now.getTime() + CAPTURE_FINISH_WINDOW_MS) } })
      return captureDto(row)
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ApiError(409, 'CAPTURE_CONFLICT', 'Read back this recording session before starting another.')
    throw error
  }
}

export async function finishCaptureForOwner(ownerId: string, sessionId: string | undefined, id: string, input: unknown) {
  const data = finishCaptureInputSchema.parse(input), hash = digest(data)
  return withTransaction(async tx => {
    const now = new Date()
    await assertActiveAccounts(tx, [ownerId]); await assertRecordingSession(tx, ownerId, sessionId, now)
    const row = await ownedCapture(tx, ownerId, id, sessionId)
    if (row.finish_hash) {
      if (row.finish_hash !== hash) throw new ApiError(409, 'CAPTURE_CONFLICT', 'The recording was already finished with different evidence.')
      return captureDto(row)
    }
    if (row.state !== 'recording' || row.finish_by <= now) throw expired()
    assertFreshCaptureReading(data.reading, now)
    const elapsed = (now.getTime() - row.started_at.getTime()) / 1000
    const start = decodeGeographicPoint(row.start_geometry)
    if (!start || elapsed < data.durationSeconds - 3 || elapsed > data.durationSeconds + 45 ||
      new Date(data.reading.capturedAt) < row.start_sample_at ||
      distanceMetersWgs84(start, { longitude: data.reading.longitude, latitude: data.reading.latitude }) > SPATIAL_TOLERANCE_METERS) {
      throw new ApiError(400, 'CAPTURE_MOVED_OR_INTERRUPTED', 'Recording time or location changed too much. Stay at the asset and record a fresh continuous walkthrough.')
    }
    const updated = await tx.listingCapture.update({ where: { id, state: 'recording' }, data: { state: 'recorded', finish_hash: hash,
      end_geometry: point(data.reading), end_accuracy: data.reading.accuracy, end_sample_at: new Date(data.reading.capturedAt),
      duration_seconds: data.durationSeconds, finished_at: now, seal_by: new Date(now.getTime() + CAPTURE_SEAL_WINDOW_MS) } })
    return captureDto(updated)
  })
}

export async function sealCaptureForOwner(ownerId: string, sessionId: string | undefined, id: string, input: unknown) {
  const data = sealCaptureInputSchema.parse(input)
  const original = await prisma.listingCapture.findFirst({ where: { id, owner_id: ownerId, session_id: sessionId ?? '' } })
  if (!original) throw new ApiError(404, 'CAPTURE_NOT_FOUND', 'This recording session is unavailable to this signed-in session.')
  if (!['recorded', 'sealed'].includes(original.state) || !original.finished_at) throw unavailable()
  const objectId = storageObjectId('listings-media', data.videoPath)
  const upload = await prisma.storageObject.findFirst({ where: { id: objectId, owner_id: ownerId, bucket: 'listings-media', path: data.videoPath, state: 'available' },
    select: { createdAt: true, upload_completed_at: true } })
  // Do not adopt a legacy file to manufacture recording provenance. Only a
  // completed fresh upload has this marker; filesystem adoption never sets it.
  if (!upload || !upload.upload_completed_at || upload.createdAt < original.started_at || upload.upload_completed_at < original.finished_at) {
    throw new ApiError(409, 'CAPTURE_VIDEO_REJECTED', 'Upload the new walkthrough recorded in this session. Older or adopted files cannot acquire a new location lock.')
  }
  // Verify actual immutable bytes outside retry callbacks. A filename alone is not evidence.
  const objects = await prepareListingStorage(ownerId, { videoPath: data.videoPath })
  const video = objects.find(object => object.path === data.videoPath)
  if (!video) throw unavailable()
  try {
    return await withTransaction(async tx => {
      const now = new Date()
      await assertActiveAccounts(tx, [ownerId]); await assertRecordingSession(tx, ownerId, sessionId, now)
      const row = await ownedCapture(tx, ownerId, id, sessionId)
      if (row.state === 'sealed') {
        if (row.video_path !== video.path || row.video_digest !== video.digest || row.video_object_id !== video.id) throw new ApiError(409, 'CAPTURE_CONFLICT', 'This recording is already bound to different uploaded footage.')
        await claimStorageObjects(tx, ownerId, objects)
        return captureDto(row)
      }
      if (row.state !== 'recorded' || !row.finished_at || !row.seal_by || row.seal_by <= now) throw expired()
      const object = await tx.storageObject.findUnique({ where: { id: video.id }, select: { createdAt: true, upload_completed_at: true } })
      if (!object || !object.upload_completed_at || object.createdAt < row.started_at || object.upload_completed_at < row.finished_at) throw new ApiError(409, 'CAPTURE_VIDEO_REJECTED', 'Use the video uploaded after this recording session began.')
      await claimStorageObjects(tx, ownerId, objects)
      return captureDto(await tx.listingCapture.update({ where: { id, state: 'recorded' }, data: { state: 'sealed', video_path: video.path, video_object_id: video.id, video_digest: video.digest, sealed_at: now } }))
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ApiError(409, 'CAPTURE_VIDEO_REUSED', 'This uploaded video already belongs to another recording. Record a fresh walkthrough.')
    throw error
  }
}

export async function checkCaptureAddressForOwner(ownerId: string, id: string, input: unknown) {
  const data = checkCaptureAddressInputSchema.parse(input)
  const row = await prisma.listingCapture.findFirst({ where: { id, owner_id: ownerId } })
  if (!row || !['recorded', 'sealed'].includes(row.state)) throw unavailable()
  if (row.state === 'recorded' && (!row.seal_by || row.seal_by <= new Date())) throw expired()
  let resolved: Awaited<ReturnType<typeof geocodeListingAddressWithReason>> = { status: 'unavailable', reason: 'provider_unavailable' }
  try { resolved = await geocodeListingAddressWithReason(data.address) } catch { /* Unexpected provider failures never become a match. */ }
  const start = decodeGeographicPoint(row.start_geometry)
  return captureAddressResultSchema.parse({ captureId: id, status: !start || resolved.status === 'unavailable' ? 'unavailable' : distanceMetersWgs84(start, resolved.point) <= SPATIAL_TOLERANCE_METERS ? 'matched' : 'mismatch',
    ...(resolved.status === 'unavailable' ? { reason: resolved.reason } : {}), addressHash: addressFingerprint(data.address), toleranceMeters: SPATIAL_TOLERANCE_METERS })
}

/** The listing lock and storage claims surround this call in the SAME transaction. */
export async function bindCaptureToListing(tx: Prisma.TransactionClient, ownerId: string, captureId: string, listingId: string, video: PreparedStorageObject): Promise<ListingCapture> {
  const row = await ownedCapture(tx, ownerId, captureId)
  if (row.state !== 'sealed' || row.video_path !== video.path || row.video_digest !== video.digest || row.video_object_id !== video.id || row.listing_id && row.listing_id !== listingId) throw unavailable()
  if (!row.listing_id) await tx.listingCapture.update({ where: { id: captureId, state: 'sealed', OR: [{ listing_id: null }, { listing_id: { isSet: false } }] }, data: { listing_id: listingId } })
  return row
}

export async function readCaptureForSubmission(ownerId: string, captureId: string | undefined, videoPath: string): Promise<ListingCapture> {
  if (!captureId) throw unavailable()
  const row = await prisma.listingCapture.findFirst({ where: { id: captureId, owner_id: ownerId, state: 'sealed', video_path: videoPath } })
  if (!row || !decodeGeographicPoint(row.start_geometry)) throw unavailable()
  return row
}
