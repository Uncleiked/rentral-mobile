import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), retrieve: vi.fn(), dispatch: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ default: { mediaAsset: {
  findMany: mocks.findMany, updateMany: mocks.updateMany, count: mocks.count,
} } }))
vi.mock('@/lib/media/mux', () => ({ muxClient: () => ({ video: { assets: { retrieve: mocks.retrieve } } }) }))
vi.mock('@/lib/media/processing', () => ({ processListingMedia: mocks.dispatch }))

import { mediaWorkerAuthorized } from '@/lib/media/worker-auth'
import { runMediaWorker } from '@/lib/media/worker'
import { POST } from '@/app/api/internal/media-worker/route'

const secret = 'local-test-only-worker-secret-123456789'
const updatedAt = new Date('2026-09-24T08:00:00Z')
const job = { id: 'media-1', mux_asset_id: 'asset-1', updatedAt }
const asset = {
  id: 'asset-1', passthrough: 'media-1', status: 'ready', duration: 100,
  playback_ids: [{ id: 'playback-1', policy: 'signed' }], tracks: [{ type: 'video' }],
}
const request = (authorization: string | null = `Bearer ${secret}`): Request => new Request(
  'https://rentral.test/api/internal/media-worker',
  { method: 'POST', headers: authorization ? { authorization } : {} },
)

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-24T09:00:00Z'))
  vi.stubEnv('MEDIA_WORKER_SECRET', secret)
  vi.stubEnv('MEDIA_WORKER_ENABLED', 'true')
  vi.stubEnv('MUX_ENABLED', 'true')
  for (const key of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) {
    vi.stubEnv(key, 'test-only')
  }
  mocks.findMany.mockResolvedValue([])
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.count.mockResolvedValue(0)
  mocks.retrieve.mockResolvedValue(asset)
  mocks.dispatch.mockResolvedValue('submitted')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('worker service authorization', () => {
  it.each([null, '', 'Bearer wrong', secret, `Basic ${secret}`, `bearer ${secret}`])('denies invalid authorization %s', async header => {
    expect(mediaWorkerAuthorized(header)).toBe(false)
    const response = await POST(request(header))
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
  it.each(['', 'short', ' '.repeat(32)])('fails closed for invalid configured secret', async value => {
    vi.stubEnv('MEDIA_WORKER_SECRET', value)
    expect((await POST(request())).status).toBe(401)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
  it.each(['MEDIA_WORKER_ENABLED', 'MUX_ENABLED', 'MUX_TOKEN_SECRET'])('does not query tables when %s is missing', async key => {
    vi.stubEnv(key, '')
    expect((await POST(request())).status).toBe(503)
    await expect(runMediaWorker()).rejects.toThrow('media-worker-disabled')
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
  it('returns only counters for an authorized empty batch', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: {
      dispatch: { skipped: 0, submitted: 0, retryable: 0, uncertain: 0, failed: 0 },
      reconciliation: { updated: 0, skipped: 0, failed: 0 }, staleSubmissions: 0, needsReview: 0,
    } })
  })
  it('sanitizes database failures', async () => {
    mocks.findMany.mockRejectedValue(new Error('password=private database connection'))
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('password')
  })
})

describe('scheduled dispatch and stalled submissions', () => {
  it('uses bounded, ordered batches and a cooldown without identity onboarding', async () => {
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([
      { listing_id: 'listing-1', listing: { lister_id: 'owner' } },
    ])
    const result = await runMediaWorker()
    const cutoff = new Date('2026-09-24T08:55:00Z')
    expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      take: 2, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      where: { status: 'queued', attempts: { lt: 5 }, updatedAt: { lte: cutoff },
        listing: { listing_status: { in: ['pending_verification', 'active'] } } },
    }))
    expect(mocks.dispatch).toHaveBeenCalledWith('listing-1', 'owner', cutoff)
    expect(result.dispatch.submitted).toBe(1)
  })
  it('marks only unchanged stale submissions uncertain, never queued', async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: 'media-1', updatedAt }])
    const result = await runMediaWorker()
    expect(mocks.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: {
      status: 'submitting', OR: [{ mux_asset_id: null }, { mux_asset_id: { isSet: false } }], updatedAt: { lte: new Date('2026-09-24T08:50:00Z') },
    } }))
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'media-1', status: 'submitting', OR: [{ mux_asset_id: null }, { mux_asset_id: { isSet: false } }], updatedAt },
      data: { status: 'uncertain', error_code: 'submission_unknown' },
    })
    expect(result.staleSubmissions).toBe(1)
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it('does not count a stale submission when a webhook wins the race', async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: 'media-1', updatedAt }])
    mocks.updateMany.mockResolvedValue({ count: 0 })
    expect((await runMediaWorker()).staleSubmissions).toBe(0)
  })
  it('finishes other jobs after a dispatch failure and reports partial failure', async () => {
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([
      { listing_id: 'listing-1', listing: { lister_id: 'owner' } },
      { listing_id: 'listing-2', listing: { lister_id: 'owner' } },
    ])
    mocks.dispatch.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce('submitted')
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ success: false, data: { dispatch: { failed: 1, submitted: 1 } } })
  })
  it('counts uncertain, invalid and exhausted jobs for operator alerts', async () => {
    mocks.count.mockResolvedValue(3)
    expect((await runMediaWorker()).needsReview).toBe(3)
    expect(mocks.count).toHaveBeenCalledWith({ where: { OR: [
      { status: { in: ['uncertain', 'errored'] } }, { status: 'queued', attempts: { gte: 5 } },
    ] } })
  })
})

describe('known asset reconciliation', () => {
  function queueProcessing(): void {
    mocks.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([job])
  }
  it('recovers a missed ready callback with the same signed-output validation', async () => {
    queueProcessing()
    const result = await runMediaWorker()
    expect(mocks.retrieve).toHaveBeenCalledWith('asset-1')
    expect(mocks.updateMany).toHaveBeenLastCalledWith({
      where: { id: job.id, status: 'processing', mux_asset_id: 'asset-1', updatedAt: new Date() },
      data: { status: 'ready', playback_id: 'playback-1', duration: 100, error_code: null },
    })
    expect(result.reconciliation.updated).toBe(1)
  })
  it('allows only the winner of the claim to call Mux', async () => {
    queueProcessing()
    mocks.updateMany.mockResolvedValue({ count: 0 })
    expect((await runMediaWorker()).reconciliation.skipped).toBe(1)
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })
  it('does not overwrite a webhook that completes while the provider request is running', async () => {
    queueProcessing()
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    mocks.retrieve.mockResolvedValue({ ...asset, status: 'preparing' })
    expect((await runMediaWorker()).reconciliation.skipped).toBe(1)
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
      id: job.id, status: 'processing', mux_asset_id: 'asset-1', updatedAt: new Date(),
    } }))
  })
  it.each([{ id: 'other-asset' }, { passthrough: 'other-media' }])('rejects mismatched binding %j', async replacement => {
    queueProcessing()
    mocks.retrieve.mockResolvedValue({ ...asset, ...replacement })
    expect((await runMediaWorker()).reconciliation.failed).toBe(1)
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { error_code: 'reconciliation_unavailable' } }))
  })
  it('does not create a second asset on provider errors', async () => {
    queueProcessing()
    mocks.retrieve.mockRejectedValue(new Error('timeout'))
    expect((await runMediaWorker()).reconciliation.failed).toBe(1)
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
  it('rejects public playback output instead of publishing it', async () => {
    queueProcessing()
    mocks.retrieve.mockResolvedValue({ ...asset, playback_ids: [{ id: 'public', policy: 'public' }] })
    await runMediaWorker()
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { status: 'errored', playback_id: null, duration: null, error_code: 'invalid_output' },
    }))
  })
  it('leaves a still-preparing asset processing for a later scheduled check', async () => {
    queueProcessing()
    mocks.retrieve.mockResolvedValue({ ...asset, status: 'preparing' })
    await runMediaWorker()
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: {
      status: 'processing', playback_id: null, duration: null, error_code: null,
    } }))
  })
})
