import { createHmac } from 'node:crypto'
import Mux from '@mux/mux-node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(),
  receipt: vi.fn(), receiptCreate: vi.fn(), query: vi.fn(), transaction: vi.fn(),
  create: vi.fn(), retrieve: vi.fn(), sign: vi.fn(), unwrap: vi.fn(),
  info: vi.fn(), signedUrl: vi.fn(), user: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ default: {
  mediaAsset: { findFirst: mocks.findFirst, findUnique: mocks.findUnique, updateMany: mocks.updateMany },
  mediaWebhookReceipt: { findUnique: mocks.receipt }, $transaction: mocks.transaction,
} }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ info: mocks.info, createSignedUrl: mocks.signedUrl }) } }) }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.user }))
vi.mock('@/lib/media/mux', () => ({ muxClient: () => ({
  video: { assets: { create: mocks.create, retrieve: mocks.retrieve } },
  webhooks: { unwrap: mocks.unwrap }, jwt: { signPlaybackId: mocks.sign },
}) }))

import { ownsVideoPath, validSource, mediaDecision } from '@/lib/media/policy'
import { processListingMedia } from '@/lib/media/processing'
import { applyMediaEvent } from '@/lib/media/webhook'
import { POST } from '@/app/api/webhooks/mux/route'
import { GET } from '@/app/api/listings/[id]/playback/route'

const listingId = '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d'
const asset = { id: 'mux-asset', passthrough: 'media-1', status: 'ready' as const, duration: 120, playback_ids: [{ id: 'playback-1', policy: 'signed' as const }], tracks: [{ id: 'track-1', type: 'video' as const }] }
const secret = 'test-webhook-secret'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('MUX_ENABLED', 'true')
  for (const key of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) vi.stubEnv(key, 'test-only')
  mocks.findFirst.mockResolvedValue({ id: 'media-1', listing_id: listingId, status: 'queued', source_path: 'owner/folder/123_video.webm', attempts: 0 })
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.info.mockResolvedValue({ data: { contentType: 'video/webm', size: 10000 }, error: null })
  mocks.signedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/signed-video' }, error: null })
  mocks.create.mockResolvedValue({ id: 'mux-asset' })
  mocks.retrieve.mockResolvedValue(asset)
  mocks.query.mockResolvedValue([{ id: 'media-1', status: 'submitting', mux_asset_id: null }])
  mocks.receiptCreate.mockResolvedValue({ count: 1 })
  mocks.transaction.mockImplementation(async work => work({ $queryRaw: mocks.query, mediaWebhookReceipt: { createMany: mocks.receiptCreate }, mediaAsset: { update: mocks.update } }))
  const sdk = new Mux({ tokenId: 'test', tokenSecret: 'test', webhookSecret: secret })
  mocks.unwrap.mockImplementation((body, headers) => sdk.webhooks.unwrap(body, headers))
  mocks.user.mockResolvedValue('owner')
  mocks.findUnique.mockResolvedValue({ status: 'ready', playback_id: 'playback-1', listing: { lister_id: 'owner', listing_status: 'pending_verification' } })
  mocks.sign.mockResolvedValue({ playback: 'token', thumbnail: 'thumb', storyboard: 'board' })
})

afterEach(() => vi.unstubAllEnvs())

describe('source and output validation', () => {
  it.each(['other/folder/video.webm', 'owner/../video.mp4', 'https://example.test/a.mp4', 'owner/folder/deed.pdf', 'owner/folder/%2e%2e.mp4'])('rejects unsafe source %s', path => {
    expect(ownsVideoPath('owner', path)).toBe(false)
  })
  it('accepts owner video paths and bounded supported files', () => {
    expect(ownsVideoPath('owner', 'owner/folder/123_video.mp4')).toBe(true)
    expect(validSource({ size: 100, contentType: 'video/webm;codecs=vp8' })).toBe(true)
  })
  it.each([{ size: 0, contentType: 'video/mp4' }, { size: 209715201, contentType: 'video/mp4' }, { size: 100, contentType: 'image/jpeg' }, {}])('rejects invalid object metadata %j', info => {
    expect(validSource(info)).toBe(false)
  })
  it('requires signed playback and bounded actual duration', () => {
    expect(mediaDecision(asset).status).toBe('ready')
    expect(mediaDecision({ ...asset, playback_ids: [{ id: 'public', policy: 'public' }] }).status).toBe('errored')
    expect(mediaDecision({ ...asset, duration: 126 }).status).toBe('errored')
    expect(mediaDecision({ ...asset, duration: 0 }).status).toBe('errored')
    expect(mediaDecision({ ...asset, tracks: [{ type: 'audio' }] }).status).toBe('errored')
    expect(mediaDecision({ ...asset, playback_ids: [...asset.playback_ids, { id: 'public', policy: 'public' }] }).status).toBe('errored')
  })
})

describe('durable dispatch', () => {
  it('does not query unmigrated tables when disabled', async () => {
    vi.stubEnv('MUX_ENABLED', 'false')
    await processListingMedia(listingId, 'owner')
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })
  it('scopes jobs to the verified owner and submitted listings', async () => {
    await processListingMedia(listingId, 'owner')
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ listing: expect.objectContaining({ lister_id: 'owner', lister: { kyc_verified: true } }) }) })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ passthrough: 'media-1', playback_policies: ['signed'] }))
  })
  it('only dispatches the request that wins the atomic claim', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })
    await processListingMedia(listingId, 'owner')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('claims the observed attempt so a stale request cannot consume the next retry', async () => {
    await processListingMedia(listingId, 'owner')
    expect(mocks.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'media-1', status: 'queued', attempts: 0 },
    }))
  })
  it('rechecks the scheduler cooldown instead of dispatching a recently attempted job', async () => {
    const cutoff = new Date('2026-09-24T08:55:00Z')
    mocks.findFirst.mockResolvedValue(null)
    expect(await processListingMedia(listingId, 'owner', cutoff)).toBe('skipped')
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ updatedAt: { lte: cutoff } }) }))
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('leaves preflight failures queued for a bounded retry', async () => {
    mocks.info.mockResolvedValue({ error: { message: 'missing' } })
    await processListingMedia(listingId, 'owner')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'queued', error_code: 'source_unavailable' } }))
  })
  it('never blindly resubmits an ambiguous provider timeout', async () => {
    mocks.create.mockRejectedValue(new Error('timeout'))
    await processListingMedia(listingId, 'owner')
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'uncertain', error_code: 'submission_unknown' } }))
    mocks.findFirst.mockResolvedValue({ status: 'uncertain', attempts: 1 })
    await processListingMedia(listingId, 'owner')
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })
  it('caps preflight retries', async () => {
    mocks.findFirst.mockResolvedValue({ status: 'queued', attempts: 5 })
    await processListingMedia(listingId, 'owner')
    expect(mocks.create).not.toHaveBeenCalled()
  })
})

describe('atomic webhook application', () => {
  it('binds an early callback to the persisted media job', async () => {
    await applyMediaEvent('event-1', asset)
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'media-1' }, data: expect.objectContaining({ status: 'ready', mux_asset_id: 'mux-asset' }) })
  })
  it('ignores duplicated events', async () => {
    mocks.receiptCreate.mockResolvedValue({ count: 0 })
    await applyMediaEvent('event-1', asset)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('rejects a provider asset attached to another attempt', async () => {
    mocks.query.mockResolvedValue([{ id: 'media-1', status: 'processing', mux_asset_id: 'other-asset' }])
    await applyMediaEvent('event-1', asset)
    expect(mocks.receiptCreate).not.toHaveBeenCalled()
  })
  it('does not regress a ready asset when earlier fetches arrive late', async () => {
    mocks.query.mockResolvedValue([{ id: 'media-1', status: 'ready', mux_asset_id: 'mux-asset' }])
    await applyMediaEvent('event-1', { ...asset, status: 'preparing' })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

function webhook(timestamp = Math.floor(Date.now() / 1000), body = JSON.stringify({ id: 'event-1', type: 'video.asset.ready', data: { id: 'mux-asset' } })) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return new Request('https://rentral.test/api/webhooks/mux', { method: 'POST', headers: { 'mux-signature': `t=${timestamp},v1=${signature}` }, body })
}

describe('real SDK signature verification', () => {
  it('verifies then fetches authoritative asset state', async () => {
    expect((await POST(webhook())).status).toBe(200)
    expect(mocks.retrieve).toHaveBeenCalledWith('mux-asset')
    expect(mocks.update).toHaveBeenCalled()
  })
  it('rejects tampered bodies before database access', async () => {
    const request = webhook()
    expect((await POST(new Request(request.url, { method: 'POST', headers: request.headers, body: '{}' }))).status).toBe(401)
    expect(mocks.receipt).not.toHaveBeenCalled()
  })
  it.each([-600, 600])('rejects timestamp skew %s', async skew => {
    expect((await POST(webhook(Math.floor(Date.now() / 1000) + skew))).status).toBe(401)
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })
  it('caps the actual streamed body size', async () => {
    expect((await POST(webhook(undefined, 'x'.repeat(65537)))).status).toBe(413)
    expect(mocks.unwrap).not.toHaveBeenCalled()
  })
  it('asks Mux to retry after a transient provider failure', async () => {
    mocks.retrieve.mockRejectedValue(new Error('offline'))
    expect((await POST(webhook())).status).toBe(503)
    expect(mocks.receiptCreate).not.toHaveBeenCalled()
  })
})

describe('signed playback authorization', () => {
  const get = () => GET(new Request('https://rentral.test/playback'), { params: Promise.resolve({ id: listingId }) })
  it('requires authentication', async () => {
    mocks.user.mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it('denies other users access to pending inventory', async () => {
    mocks.user.mockResolvedValue('other')
    expect((await get()).status).toBe(404)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it('allows active inventory and emits short-lived non-cacheable tokens', async () => {
    mocks.user.mockResolvedValue('viewer')
    mocks.findUnique.mockResolvedValue({ status: 'ready', playback_id: 'playback-1', listing: { lister_id: 'owner', listing_status: 'active' } })
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.sign).toHaveBeenCalledWith('playback-1', expect.objectContaining({ expiration: '15m', type: ['video', 'thumbnail', 'storyboard'] }))
  })
  it('allows owners but never signs an unready video', async () => {
    expect((await get()).status).toBe(200)
    mocks.findUnique.mockResolvedValue({ status: 'processing', playback_id: null, listing: { lister_id: 'owner', listing_status: 'pending_verification' } })
    mocks.sign.mockClear()
    expect((await get()).status).toBe(409)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
})
