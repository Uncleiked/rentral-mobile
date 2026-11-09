import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { Upload } from '@mux/mux-node/resources/video/uploads'
import prisma from '@/lib/db'
import { createAdminClient } from '@/lib/admin'
import { activeAccountWhere } from '@/lib/accounts/availability'
import { assertMediaUploadReady } from '@/lib/database/readiness'
import { LISTINGS_MEDIA_BUCKET } from '@/lib/storage'
import { muxConfigured, muxEnabled } from './config'
import { muxClient } from './mux'
import { mediaDecision, ownsVideoPath, validSource, unboundAssetWhere } from './policy'
import { MediaUploadError, sendMediaChunk, type UploadSource } from './resumable-upload'

export type MediaDispatchResult = 'skipped' | 'submitted' | 'retryable' | 'uncertain'
const RUNNING = ['submitting', 'uploading', 'uncertain']
const PAGE_SIZE = 100
const MAX_SCAN_PAGES = 50
type Candidates = { uploads: string[]; assets: string[] }

function candidates(value: unknown): Candidates {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { uploads: [], assets: [] }
  const item = value as Record<string, unknown>
  const ids = (input: unknown) => Array.isArray(input) ? [...new Set(input.filter((id): id is string => typeof id === 'string' && /^[\w-]{1,256}$/.test(id)))].slice(0, 3) : []
  return { uploads: ids(item.uploads), assets: ids(item.assets) }
}

function uploadMatches(upload: Upload, mediaId: string): boolean {
  return Boolean(upload.id && upload.new_asset_settings?.passthrough === mediaId &&
    upload.new_asset_settings.playback_policies?.length === 1 && upload.new_asset_settings.playback_policies[0] === 'signed')
}

async function sourceFor(userId: string, path: string): Promise<UploadSource> {
  if (!ownsVideoPath(userId, path)) throw new MediaUploadError('invalid_source')
  const bucket = createAdminClient().storage.from(LISTINGS_MEDIA_BUCKET)
  const info = await bucket.info(path)
  if (info.error || !info.data || !validSource(info.data)) throw new MediaUploadError('source_unavailable')
  return { size: info.data.size, contentType: info.data.contentType.split(';')[0], stream: async range => {
    const result = await bucket.stream(path, range)
    if (result.error || !result.data) throw new MediaUploadError('source_unavailable')
    return result.data
  } }
}

/** All HTTP runs outside transactions. The expiring lease bounds concurrent
 * uploads; every state write also refuses to overwrite an earlier webhook. */
export async function processListingMedia(listingId: string, userId: string, queuedBefore?: Date): Promise<MediaDispatchResult> {
  if (!muxEnabled() || !muxConfigured()) return 'skipped'
  await assertMediaUploadReady()
  const media = await prisma.mediaAsset.findFirst({ where: {
    listing_id: listingId, ...(queuedBefore ? { updatedAt: { lte: queuedBefore } } : {}),
    listing: { lister_id: userId, lister: activeAccountWhere, listing_status: { in: ['pending_verification', 'active'] } },
  } })
  if (!media || !['queued', 'uploading', 'uncertain'].includes(media.status) || media.mux_asset_id ||
    (media.status === 'queued' && media.attempts >= 5)) return 'skipped'
  const token = randomUUID()
  const claim = await prisma.mediaAsset.updateMany({ where: {
    id: media.id, status: media.status, attempts: media.attempts, updatedAt: media.updatedAt,
    AND: [unboundAssetWhere, { OR: [{ upload_lease_expires_at: null }, { upload_lease_expires_at: { isSet: false } }, { upload_lease_expires_at: { lte: new Date() } }] }],
  }, data: { status: media.status === 'queued' ? 'submitting' : media.status,
    ...(media.status === 'queued' ? { attempts: { increment: 1 } } : {}),
    upload_lease_token: token, upload_lease_expires_at: new Date(Date.now() + 180000), error_code: null,
  } })
  if (claim.count !== 1) return 'skipped'
  const where: Prisma.MediaAssetWhereInput = { id: media.id, status: { in: RUNNING }, upload_lease_token: token, ...unboundAssetWhere }
  const write = (data: Prisma.MediaAssetUpdateManyMutationInput) => prisma.mediaAsset.updateMany({ where, data })
  const mux = muxClient()
  let uploadId = media.mux_upload_id
  let creationAttempted = false
  let source: UploadSource | undefined
  try {
    if (!uploadId && media.status !== 'queued') {
      // A lost creation acknowledgement cannot cause another billable create.
      // Scan one page per run and persist only opaque provider identifiers.
      const page = media.upload_reconcile_page ?? 1
      if (page > MAX_SCAN_PAGES) { await write({ status: 'uncertain', error_code: 'submission_review_required' }); return 'uncertain' }
      const [uploads, assets] = await Promise.all([
        mux.video.uploads.list({ page, limit: PAGE_SIZE }), mux.video.assets.list({ page, limit: PAGE_SIZE }),
      ])
      const found = candidates(media.upload_reconcile_candidates)
      found.uploads = [...new Set([...found.uploads, ...uploads.data.filter(item => item.new_asset_settings?.passthrough === media.id).map(item => item.id)])].slice(0, 3)
      found.assets = [...new Set([...found.assets, ...assets.data.filter(item => item.passthrough === media.id).map(item => item.id)])].slice(0, 3)
      if (found.uploads.length > 1 || found.assets.length > 1) {
        await write({ status: 'uncertain', error_code: 'submission_binding_conflict', upload_reconcile_candidates: found }); return 'uncertain'
      }
      if (uploads.data.length === PAGE_SIZE || assets.data.length === PAGE_SIZE) {
        await write({ status: 'uncertain', error_code: 'submission_reconciling', upload_reconcile_page: page + 1, upload_reconcile_candidates: found }); return 'uncertain'
      }
      uploadId = found.uploads[0] ?? null
      if (!uploadId && found.assets[0]) {
        const asset = await mux.video.assets.retrieve(found.assets[0])
        if (asset.id !== found.assets[0] || asset.passthrough !== media.id) throw new MediaUploadError('submission_binding_conflict')
        await write({ ...mediaDecision(asset), mux_asset_id: asset.id }); return 'submitted'
      }
      if (!uploadId) { await write({ status: 'uncertain', error_code: 'submission_review_required', upload_reconcile_page: MAX_SCAN_PAGES + 1 }); return 'uncertain' }
      if (found.assets[0]) {
        const upload = await mux.video.uploads.retrieve(uploadId)
        if (upload.asset_id !== found.assets[0]) throw new MediaUploadError('submission_binding_conflict')
      }
      if ((await write({ mux_upload_id: uploadId, status: 'uploading' })).count !== 1) return 'skipped'
    }
    if (!uploadId) {
      source = await sourceFor(userId, media.source_path)
      const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').origin
      creationAttempted = true
      const created = await mux.video.uploads.create({ cors_origin: origin, timeout: 3600,
        new_asset_settings: { playback_policies: ['signed'], video_quality: 'basic', passthrough: media.id },
      })
      if (!created.id || !/^[\w-]{1,256}$/.test(created.id)) throw new MediaUploadError('submission_unknown')
      uploadId = created.id
      // The provider URL is deliberately never persisted, logged or sent to clients.
      if ((await write({ mux_upload_id: uploadId, status: 'uploading' })).count !== 1) return 'skipped'
    }
    const upload = await mux.video.uploads.retrieve(uploadId)
    if (upload.id !== uploadId || !uploadMatches(upload, media.id)) throw new MediaUploadError('submission_binding_conflict')
    if (['errored', 'cancelled', 'timed_out'].includes(upload.status)) {
      await write({ status: 'errored', error_code: 'upload_' + upload.status }); return 'submitted'
    }
    const applyAsset = async (snapshot: Upload): Promise<boolean> => {
      if (snapshot.status !== 'asset_created' || !snapshot.asset_id) return false
      const asset = await mux.video.assets.retrieve(snapshot.asset_id)
      if (asset.id !== snapshot.asset_id || asset.passthrough !== media.id) throw new MediaUploadError('submission_binding_conflict')
      await write({ ...mediaDecision(asset), mux_asset_id: asset.id, upload_completed_at: new Date() })
      return true
    }
    if (await applyAsset(upload)) return 'submitted'
    if (upload.status !== 'waiting' || !upload.url) throw new MediaUploadError('upload_session_unavailable')
    source ??= await sourceFor(userId, media.source_path)
    for (let chunk = 0; chunk < 2; chunk += 1) {
      const progress = await sendMediaChunk(upload.url, source)
      if ((await write({ status: 'uploading', upload_bytes: progress.bytes,
        ...(progress.complete ? { upload_completed_at: new Date() } : {}), error_code: null })).count !== 1) return 'skipped'
      if (progress.complete || progress.bytes === source.size) break
    }
    // A completed byte stream is not proof that Mux accepted a playable video.
    const latest = await mux.video.uploads.retrieve(uploadId)
    if (latest.id !== uploadId || !uploadMatches(latest, media.id)) throw new MediaUploadError('submission_binding_conflict')
    await applyAsset(latest)
    return 'submitted'
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
    const rejectedCreation = creationAttempted && !uploadId && typeof status === 'number' && [400, 401, 403, 404, 422].includes(status)
    const retryable = (!creationAttempted && !uploadId && media.status === 'queued') || rejectedCreation
    const code = error instanceof MediaUploadError ? error.code : retryable ? 'source_unavailable' : 'submission_unknown'
    await write({ status: retryable ? 'queued' : 'uncertain', error_code: code })
    return retryable ? 'retryable' : 'uncertain'
  } finally {
    await prisma.mediaAsset.updateMany({ where: { id: media.id, upload_lease_token: token }, data: { upload_lease_token: null, upload_lease_expires_at: null } })
  }
}
