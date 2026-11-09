import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ find: vi.fn(), write: vi.fn(), ready: vi.fn(), info: vi.fn(), stream: vi.fn(),
  create: vi.fn(), upload: vi.fn(), uploads: vi.fn(), assets: vi.fn(), asset: vi.fn(), chunk: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { mediaAsset: { findFirst: mocks.find, updateMany: mocks.write } } }))
vi.mock('@/lib/database/readiness', () => ({ assertMediaUploadReady: mocks.ready }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ info: mocks.info, stream: mocks.stream }) } }) }))
vi.mock('@/lib/media/mux', () => ({ muxClient: () => ({ video: {
  uploads: { create: mocks.create, retrieve: mocks.upload, list: mocks.uploads }, assets: { list: mocks.assets, retrieve: mocks.asset },
} }) }))
vi.mock('@/lib/media/resumable-upload', async original => ({ ...await original<typeof import('@/lib/media/resumable-upload')>(), sendMediaChunk: mocks.chunk }))
import { processListingMedia } from '@/lib/media/processing'

const updatedAt = new Date('2026-10-01T10:00:00Z')
const job = { id: 'media-1', listing_id: 'listing-1', status: 'queued', source_path: 'owner/folder/video.webm', attempts: 0, updatedAt,
  mux_asset_id: null, mux_upload_id: null, upload_reconcile_page: 1, upload_reconcile_candidates: null }
const upload = { id: 'upload-1', status: 'waiting', url: 'https://storage.googleapis.com/private-session',
  new_asset_settings: { passthrough: job.id, playback_policies: ['signed'] } }
const asset = { id: 'asset-1', passthrough: job.id, status: 'ready', duration: 110, playback_ids: [{ id: 'playback-1', policy: 'signed' }], tracks: [{ type: 'video' }] }
const run = () => processListingMedia('listing-1', 'owner')
const states = () => mocks.write.mock.calls.map(([input]) => input.data)

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MUX_ENABLED', 'true')
  for (const key of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) vi.stubEnv(key, 'test-only')
  mocks.find.mockResolvedValue({ ...job }); mocks.write.mockResolvedValue({ count: 1 }); mocks.ready.mockResolvedValue(undefined)
  mocks.info.mockResolvedValue({ data: { size: 10000, contentType: 'video/webm' }, error: null })
  mocks.create.mockResolvedValue(upload); mocks.upload.mockResolvedValue(upload); mocks.chunk.mockResolvedValue({ bytes: 10000, complete: true })
  mocks.uploads.mockResolvedValue({ data: [] }); mocks.assets.mockResolvedValue({ data: [] }); mocks.asset.mockResolvedValue(asset)
})
afterEach(() => vi.unstubAllEnvs())

describe('resumable local media dispatch', () => {
  it('keeps disabled installations independent of new collections', async () => {
    vi.stubEnv('MUX_ENABLED', 'false'); expect(await run()).toBe('skipped'); expect(mocks.ready).not.toHaveBeenCalled()
  })
  it('requires preparation before any provider or database mutation', async () => {
    mocks.ready.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED'))
    await expect(run()).rejects.toThrow('DATABASE_SETUP_REQUIRED'); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled()
  })
  it('pushes private local bytes without exposing a LAN source URL', async () => {
    expect(await run()).toBe('submitted')
    expect(mocks.find).toHaveBeenCalledWith({ where: expect.objectContaining({ listing: expect.objectContaining({ lister_id: 'owner', lister: expect.any(Object) }) }) })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ new_asset_settings: { playback_policies: ['signed'], video_quality: 'basic', passthrough: job.id } }))
    expect(states()).toContainEqual({ mux_upload_id: upload.id, status: 'uploading' })
    expect(mocks.chunk).toHaveBeenCalledWith(upload.url, expect.objectContaining({ size: 10000, stream: expect.any(Function) }))
    expect(JSON.stringify(states())).not.toContain('https:')
  })
  it('allows only the current lease and observed revision to submit', async () => {
    mocks.write.mockResolvedValue({ count: 0 }); expect(await run()).toBe('skipped'); expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ updatedAt, attempts: 0, AND: expect.any(Array) }) }))
  })
  it('rechecks the scheduler cutoff and limits new creation attempts', async () => {
    mocks.find.mockResolvedValue(null)
    await processListingMedia('listing-1', 'owner', updatedAt)
    expect(mocks.find).toHaveBeenCalledWith({ where: expect.objectContaining({ updatedAt: { lte: updatedAt } }) })
    mocks.find.mockResolvedValue({ ...job, attempts: 5 }); expect(await run()).toBe('skipped'); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('retries a preflight failure without creating a provider job', async () => {
    mocks.info.mockResolvedValue({ error: true }); expect(await run()).toBe('retryable')
    expect(mocks.create).not.toHaveBeenCalled(); expect(states()).toContainEqual({ status: 'queued', error_code: 'source_unavailable' })
  })
  it('never creates again after an unknown creation acknowledgement', async () => {
    mocks.create.mockRejectedValue(new Error('lost acknowledgement')); expect(await run()).toBe('uncertain')
    mocks.find.mockResolvedValue({ ...job, status: 'uncertain', attempts: 1 }); expect(await run()).toBe('uncertain')
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(states()).toContainEqual(expect.objectContaining({ error_code: 'submission_review_required' }))
  })
  it.each([400, 401, 403, 404, 422])('only retries a definite creation rejection %s', async status => {
    mocks.create.mockRejectedValue({ status }); expect(await run()).toBe('retryable')
  })
  it('retains a known upload session after a transport timeout', async () => {
    mocks.find.mockResolvedValue({ ...job, status: 'uploading', mux_upload_id: upload.id, attempts: 5 })
    mocks.chunk.mockRejectedValue(new Error('offline')); expect(await run()).toBe('uncertain'); expect(mocks.create).not.toHaveBeenCalled()
    expect(states()).not.toContainEqual(expect.objectContaining({ mux_upload_id: null }))
    expect(mocks.write).toHaveBeenLastCalledWith(expect.objectContaining({ data: { upload_lease_token: null, upload_lease_expires_at: null } }))
  })
  it('bounds a continuation to two chunks and records acknowledged bytes', async () => {
    mocks.chunk.mockResolvedValueOnce({ bytes: 8388608, complete: false }).mockResolvedValueOnce({ bytes: 16777216, complete: false })
    mocks.info.mockResolvedValue({ data: { size: 25000000, contentType: 'video/webm' } })
    await run(); expect(mocks.chunk).toHaveBeenCalledTimes(2)
    expect(states()).toContainEqual({ status: 'uploading', upload_bytes: 16777216, error_code: null })
    expect(mocks.asset).not.toHaveBeenCalled()
  })
  it('does not stream or overwrite when an earlier webhook wins binding', async () => {
    mocks.write.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    expect(await run()).toBe('skipped'); expect(mocks.chunk).not.toHaveBeenCalled()
  })
  it('validates authoritative provider binding before exposing playback', async () => {
    mocks.upload.mockResolvedValue({ ...upload, status: 'asset_created', asset_id: asset.id })
    await run(); expect(states()).toContainEqual(expect.objectContaining({ status: 'ready', mux_asset_id: asset.id, playback_id: 'playback-1' }))
    expect(mocks.chunk).not.toHaveBeenCalled()
  })
  it('rejects a mismatched upload even if it has a plausible upload URL', async () => {
    mocks.upload.mockResolvedValue({ ...upload, new_asset_settings: { passthrough: 'someone-else', playback_policies: ['signed'] } })
    expect(await run()).toBe('uncertain'); expect(mocks.chunk).not.toHaveBeenCalled()
  })
  it('preserves actual video duration and signed-only checks on recovery', async () => {
    mocks.upload.mockResolvedValue({ ...upload, status: 'asset_created', asset_id: asset.id })
    mocks.asset.mockResolvedValue({ ...asset, duration: 121 }); await run()
    expect(states()).toContainEqual(expect.objectContaining({ status: 'errored', error_code: 'invalid_output' }))
  })
  it.each(['cancelled', 'timed_out', 'errored'])('stops a provider-confirmed %s session without another create', async status => {
    mocks.find.mockResolvedValue({ ...job, status: 'uploading', mux_upload_id: upload.id }); mocks.upload.mockResolvedValue({ ...upload, status })
    await run(); expect(states()).toContainEqual({ status: 'errored', error_code: 'upload_' + status }); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('accumulates a bounded recovery scan without premature binding', async () => {
    mocks.find.mockResolvedValue({ ...job, status: 'uncertain', attempts: 1 })
    mocks.uploads.mockResolvedValue({ data: [upload, ...Array.from({ length: 99 }, (_, index) => ({ id: 'other-' + index }))] })
    await run(); expect(states()).toContainEqual({ status: 'uncertain', error_code: 'submission_reconciling', upload_reconcile_page: 2, upload_reconcile_candidates: { uploads: [upload.id], assets: [] } })
    expect(mocks.chunk).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('recovers one previously acknowledged candidate after completing the scan', async () => {
    mocks.find.mockResolvedValue({ ...job, status: 'uncertain', attempts: 1, upload_reconcile_page: 2, upload_reconcile_candidates: { uploads: [upload.id], assets: [] } })
    await run(); expect(mocks.uploads).toHaveBeenCalledWith({ page: 2, limit: 100 }); expect(mocks.chunk).toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('quarantines duplicate provider candidates', async () => {
    mocks.find.mockResolvedValue({ ...job, status: 'uncertain', attempts: 1 })
    mocks.uploads.mockResolvedValue({ data: [upload, { ...upload, id: 'upload-2' }] }); await run()
    expect(states()).toContainEqual(expect.objectContaining({ error_code: 'submission_binding_conflict' })); expect(mocks.chunk).not.toHaveBeenCalled()
  })
  it('can recover an older pull asset without fetching localhost again', async () => {
    mocks.find.mockResolvedValue({ ...job, status: 'uncertain', attempts: 1 }); mocks.assets.mockResolvedValue({ data: [asset] })
    await run(); expect(states()).toContainEqual(expect.objectContaining({ mux_asset_id: asset.id, status: 'ready' })); expect(mocks.create).not.toHaveBeenCalled()
  })
})
