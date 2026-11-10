import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ find: vi.fn(), unique: vi.fn(), create: vi.fn(), update: vi.fn(), session: vi.fn(), lock: vi.fn(), transaction: vi.fn(), prepare: vi.fn(), claim: vi.fn(), object: vi.fn(), geocode: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listingCapture: { findFirst: mocks.find }, storageObject: { findFirst: mocks.object } } }))
vi.mock('@/lib/accounts/availability', () => ({ assertActiveAccounts: vi.fn(async () => undefined) }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: mocks.transaction }))
vi.mock('@/lib/storage-claims/service', () => ({ prepareListingStorage: mocks.prepare, claimStorageObjects: mocks.claim, storageObjectId: () => 'object' }))
vi.mock('@/lib/listings/spatial', async original => ({ ...await original<typeof import('@/lib/listings/spatial')>(), geocodeListingAddressWithReason: mocks.geocode }))
import { beginCaptureForOwner, finishCaptureForOwner, sealCaptureForOwner, getCaptureForOwner, checkCaptureAddressForOwner, bindCaptureToListing, assertFreshCaptureReading } from '@/lib/listings/capture'
import { beginCaptureInputSchema, captureReadingSchema } from '@/lib/contracts/capture'
import { saveListingInputSchema, saveDraftInputSchema } from '@/lib/contracts/listings'
import { assertAppendOnlyOperation } from '@/lib/database/append-only'

const id = '11111111-1111-4111-8111-111111111111', owner = 'owner', sessionId = 'session'
const started = new Date('2026-11-10T09:00:00.000Z'), now = new Date('2026-11-10T09:00:20.000Z')
const reading = () => ({ latitude: 6.45, longitude: 3.4, accuracy: 8, capturedAt: new Date().toISOString(), mocked: false })
const video = { id: 'object', bucket: 'listings-media' as const, path: 'owner/video.mp4', digest: 'a'.repeat(64), sizeBytes: 100, contentType: 'video/mp4' }
function record(state = 'recording') {
  return { id, revision: 0, owner_id: owner, session_id: sessionId, begin_hash: 'begin', finish_hash: null, state,
    start_geometry: { type: 'Point', coordinates: [3.4, 6.45] }, start_accuracy: 8, start_sample_at: started, started_at: started,
    finish_by: new Date(started.getTime() + 180000), end_geometry: null, end_accuracy: null, end_sample_at: null,
    finished_at: state === 'recording' ? null : now, seal_by: state === 'recording' ? null : new Date(now.getTime() + 7 * 86400000), duration_seconds: state === 'recording' ? null : 20,
    video_path: state === 'sealed' ? video.path : null, video_object_id: state === 'sealed' ? video.id : null,
    video_digest: state === 'sealed' ? video.digest : null, listing_id: null, sealed_at: state === 'sealed' ? now : null }
}
const tx = { listingCapture: { findFirst: mocks.find, findUnique: mocks.unique, create: mocks.create, update: mocks.update }, authSession: { findFirst: mocks.session }, storageObject: { findUnique: mocks.object } }
type RecordRow = ReturnType<typeof record>
let row: RecordRow
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); row = record()
  mocks.transaction.mockImplementation(async (work: (client: typeof tx) => Promise<unknown>) => work(tx))
  mocks.find.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => where.owner_id !== owner || where.session_id && where.session_id !== sessionId ? null : row)
  mocks.unique.mockResolvedValue(null); mocks.lock.mockResolvedValue(true); mocks.session.mockResolvedValue({ id: sessionId })
  mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }))
  mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }))
  mocks.prepare.mockResolvedValue([video]); mocks.claim.mockResolvedValue(undefined); mocks.object.mockResolvedValue({ createdAt: new Date(started.getTime() + 1000), upload_completed_at: now })
  mocks.geocode.mockResolvedValue({ status: 'resolved', point: { longitude: 3.4, latitude: 6.45 } })
})
afterEach(() => vi.useRealTimers())

describe('recording-time evidence admission', () => {
  it('locks a fresh GPS reading and server times before returning a coordinate-free acknowledgement', async () => {
    const result = await beginCaptureForOwner(owner, sessionId, { id, reading: reading() })
    expect(result.status).toBe('recording')
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id, owner_id: owner, session_id: sessionId, start_geometry: { type: 'Point', coordinates: [3.4, 6.45] }, started_at: now }) })
    expect(JSON.stringify(result)).not.toMatch(/geometry|latitude|longitude|session_id|accuracy|6\.45|3\.4/)
  })
  it.each([-5001, 15001])('rejects a sample outside the permitted clock window: age %s', age => {
    expect(() => assertFreshCaptureReading({ ...reading(), capturedAt: new Date(now.getTime() - age).toISOString() })).toThrow()
  })
  it.each([{ mocked: true }, { accuracy: 101 }, { accuracy: 0 }, { latitude: 91 }])('rejects known mocked or invalid GPS evidence %o', override => {
    const sample = { ...reading(), ...override }
    if (captureReadingSchema.safeParse(sample).success) expect(() => assertFreshCaptureReading(sample)).toThrow()
    else expect(captureReadingSchema.safeParse(sample).success).toBe(false)
  })
  it('requires the current unrevoked auth session before creating recording evidence', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(beginCaptureForOwner(owner, sessionId, { id, reading: reading() })).rejects.toMatchObject({ code: 'SESSION_REQUIRED' })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('allows exact begin readback without rewriting an old accepted point', async () => {
    const input = { id, reading: reading() }
    await beginCaptureForOwner(owner, sessionId, input)
    row = { ...row, ...mocks.create.mock.calls[0][0].data }
    mocks.unique.mockResolvedValue(row); vi.setSystemTime(new Date(now.getTime() + 20000))
    await expect(beginCaptureForOwner(owner, sessionId, input)).resolves.toMatchObject({ id })
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.update).not.toHaveBeenCalled()
  })
  it('rejects a reused begin identifier with different readings', async () => {
    mocks.unique.mockResolvedValue(row)
    await expect(beginCaptureForOwner(owner, sessionId, { id, reading: reading() })).rejects.toMatchObject({ code: 'CAPTURE_CONFLICT' })
  })
  it('requires an actual recording interval and seals the end sample once', async () => {
    const result = await finishCaptureForOwner(owner, sessionId, id, { reading: reading(), durationSeconds: 20 })
    expect(result.status).toBe('recorded')
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id, state: 'recording' }, data: expect.objectContaining({ end_geometry: { type: 'Point', coordinates: [3.4, 6.45] }, duration_seconds: 20 }) }))
  })
  it.each([{ durationSeconds: 100 }, { durationSeconds: 20, latitude: 6.5 }])('rejects impossible duration or movement during recording %o', ({ durationSeconds, latitude }) => {
    return expect(finishCaptureForOwner(owner, sessionId, id, { reading: { ...reading(), ...(latitude ? { latitude } : {}) }, durationSeconds })).rejects.toMatchObject({ code: 'CAPTURE_MOVED_OR_INTERRUPTED' })
  })
  it('does not take a write lock on another owner or another session capture', async () => {
    await expect(finishCaptureForOwner('other', sessionId, id, { reading: reading(), durationSeconds: 20 })).rejects.toMatchObject({ code: 'CAPTURE_NOT_FOUND' })
    expect(mocks.lock).not.toHaveBeenCalled()
    await expect(finishCaptureForOwner(owner, 'another-session', id, { reading: reading(), durationSeconds: 20 })).rejects.toMatchObject({ code: 'CAPTURE_NOT_FOUND' })
    expect(mocks.lock).not.toHaveBeenCalled()
  })
  it('finishes exact replay without mutating completed evidence and refuses changed replay', async () => {
    const input = { reading: reading(), durationSeconds: 20 }
    await finishCaptureForOwner(owner, sessionId, id, input)
    row = { ...row, ...mocks.update.mock.calls[0][0].data }; mocks.update.mockClear()
    vi.setSystemTime(new Date(now.getTime() + 20000))
    await expect(finishCaptureForOwner(owner, sessionId, id, input)).resolves.toMatchObject({ status: 'recorded' })
    expect(mocks.update).not.toHaveBeenCalled()
    await expect(finishCaptureForOwner(owner, sessionId, id, { ...input, durationSeconds: 21 })).rejects.toMatchObject({ code: 'CAPTURE_CONFLICT' })
  })
})

describe('video binding and address checks', () => {
  it('binds actual validated video digest under the same transaction as its claim', async () => {
    row = record('recorded')
    await expect(sealCaptureForOwner(owner, sessionId, id, { videoPath: video.path })).resolves.toMatchObject({ status: 'sealed', videoPath: video.path })
    expect(mocks.claim).toHaveBeenCalledWith(tx, owner, [video])
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ video_digest: video.digest, video_object_id: video.id }) }))
  })
  it('refuses preexisting video objects that were uploaded before capture began', async () => {
    row = record('recorded'); mocks.object.mockResolvedValue({ createdAt: new Date(started.getTime() - 1) })
    await expect(sealCaptureForOwner(owner, sessionId, id, { videoPath: video.path })).rejects.toMatchObject({ code: 'CAPTURE_VIDEO_REJECTED' })
    expect(mocks.claim).not.toHaveBeenCalled()
  })
  it.each([null, { createdAt: now, upload_completed_at: null }])('refuses to manufacture a location lock from a missing or adopted object %o', async object => {
    row = record('recorded'); mocks.object.mockResolvedValue(object)
    await expect(sealCaptureForOwner(owner, sessionId, id, { videoPath: video.path })).rejects.toMatchObject({ code: 'CAPTURE_VIDEO_REJECTED' })
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled()
  })
  it('does not reseal with different footage even for the same owner', async () => {
    row = record('sealed'); mocks.prepare.mockResolvedValue([{ ...video, digest: 'b'.repeat(64) }])
    await expect(sealCaptureForOwner(owner, sessionId, id, { videoPath: video.path })).rejects.toMatchObject({ code: 'CAPTURE_CONFLICT' })
  })
  it('cannot attach one sealed recording to two different listings or video objects', async () => {
    row = { ...record('sealed'), listing_id: 'another-listing' } as unknown as RecordRow
    await expect(bindCaptureToListing(tx as never, owner, id, 'new-listing', video)).rejects.toMatchObject({ code: 'CAPTURE_REQUIRED' })
    row = record('sealed')
    await expect(bindCaptureToListing(tx as never, owner, id, 'new-listing', { ...video, digest: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'CAPTURE_REQUIRED' })
  })
  it('preflights a recorded capture before the large video is uploaded', async () => {
    row = record('recorded')
    expect(await checkCaptureAddressForOwner(owner, id, { address: 'Building, Lekki, Lagos' })).toMatchObject({ captureId: id, status: 'matched', toleranceMeters: 100 })
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('never treats ambiguous or failed geocoding as a match', async () => {
    row = record('recorded'); mocks.geocode.mockResolvedValueOnce({ status: 'unavailable', reason: 'no_result' }).mockRejectedValueOnce(new Error('private upstream diagnostics'))
    expect(await checkCaptureAddressForOwner(owner, id, { address: 'Building, Lekki, Lagos' })).toMatchObject({ status: 'unavailable', reason: 'no_result' })
    const failed = await checkCaptureAddressForOwner(owner, id, { address: 'Building, Lekki, Lagos' })
    expect(failed).toMatchObject({ status: 'unavailable', reason: 'provider_unavailable' }); expect(JSON.stringify(failed)).not.toContain('private upstream')
    mocks.geocode.mockResolvedValue({ status: 'resolved', point: { longitude: 3.4, latitude: 6.5 } })
    expect(await checkCaptureAddressForOwner(owner, id, { address: 'Building, Lekki, Lagos' })).toMatchObject({ status: 'mismatch' })
  })
  it('does not expose precise stored evidence in owner readback', async () => {
    row = record('sealed')
    expect(JSON.stringify(await getCaptureForOwner(owner, id))).not.toMatch(/start_geometry|end_geometry|accuracy|session_id|video_digest/)
  })
})

describe('server evidence boundaries', () => {
  it('rejects mutable coordinates on new draft and submission payloads', () => {
    expect(saveDraftInputSchema.safeParse({ category: 'house', wizardStep: 'capture', metadata: {}, lat: 6.45, lng: 3.4 }).success).toBe(false)
    expect(saveListingInputSchema.shape).not.toHaveProperty('lat')
    expect(saveListingInputSchema.shape).not.toHaveProperty('accuracy')
    expect(beginCaptureInputSchema.safeParse({ id, reading: reading(), ownerId: 'other' }).success).toBe(false)
  })
  it.each(['start_geometry', 'start_accuracy', 'start_sample_at', 'started_at', 'owner_id', 'session_id', 'begin_hash'])('blocks rewriting immutable capture %s through the shared Prisma boundary', field => {
    expect(() => assertAppendOnlyOperation('ListingCapture', 'update', { where: { id }, data: { [field]: 'changed' } })).toThrow('IMMUTABLE_CAPTURE')
  })
  it('blocks deleting or reopening sealed evidence and permits only one-way end/video writes', () => {
    expect(() => assertAppendOnlyOperation('ListingCapture', 'delete', { where: { id } })).toThrow('IMMUTABLE_CAPTURE')
    expect(() => assertAppendOnlyOperation('ListingCapture', 'update', { where: { id, state: 'sealed' }, data: { state: 'recording' } })).toThrow('IMMUTABLE_CAPTURE')
    expect(() => assertAppendOnlyOperation('ListingCapture', 'update', { where: { id, state: 'sealed' }, data: { end_geometry: {} } })).toThrow('IMMUTABLE_CAPTURE')
    expect(() => assertAppendOnlyOperation('StorageObject', 'update', { where: { id }, data: { upload_completed_at: now } })).toThrow('IMMUTABLE_UPLOAD_PROVENANCE')
  })
})
