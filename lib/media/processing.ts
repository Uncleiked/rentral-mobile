import prisma from '@/lib/db'
import { createAdminClient } from '@/lib/admin'
import { LISTINGS_MEDIA_BUCKET } from '@/lib/storage'
import { muxConfigured, muxEnabled } from './config'
import { muxClient } from './mux'
import { ownsVideoPath, validSource } from './policy'

export type MediaDispatchResult = 'skipped' | 'submitted' | 'retryable' | 'uncertain'

export async function processListingMedia(listingId: string, userId: string, queuedBefore?: Date): Promise<MediaDispatchResult> {
  if (!muxEnabled() || !muxConfigured()) return 'skipped'
  const media = await prisma.mediaAsset.findFirst({
    where: {
      listing_id: listingId,
      ...(queuedBefore ? { updatedAt: { lte: queuedBefore } } : {}),
      listing: { lister_id: userId, lister: { kyc_verified: true }, listing_status: { in: ['pending_verification', 'active'] } },
    },
  })
  if (!media || media.status !== 'queued' || media.attempts >= 5) return 'skipped'
  const claim = await prisma.mediaAsset.updateMany({
    where: { id: media.id, status: 'queued', attempts: media.attempts },
    data: { status: 'submitting', attempts: { increment: 1 }, error_code: null },
  })
  if (claim.count !== 1) return 'skipped'

  let submitted = false
  try {
    if (!ownsVideoPath(userId, media.source_path)) throw new Error('invalid-source')
    const bucket = createAdminClient().storage.from(LISTINGS_MEDIA_BUCKET)
    const info = await bucket.info(media.source_path)
    if (info.error || !info.data || !validSource({ size: info.data.size, contentType: info.data.contentType })) throw new Error('invalid-source')
    const source = await bucket.createSignedUrl(media.source_path, 3600)
    if (source.error || !source.data?.signedUrl) throw new Error('source-unavailable')
    const mux = muxClient()
    submitted = true
    const asset = await mux.video.assets.create({
      inputs: [{ url: source.data.signedUrl }],
      playback_policies: ['signed'],
      video_quality: 'basic',
      passthrough: media.id,
    })
    // An early webhook may already have advanced the row; never overwrite it.
    await prisma.mediaAsset.updateMany({
      where: { id: media.id, status: { in: ['submitting', 'uncertain'] }, mux_asset_id: null },
      data: { mux_asset_id: asset.id, status: 'processing' },
    })
    return 'submitted'
  } catch {
    await prisma.mediaAsset.updateMany({
      where: { id: media.id, status: 'submitting', mux_asset_id: null },
      data: submitted
        ? { status: 'uncertain', error_code: 'submission_unknown' }
        : { status: 'queued', error_code: 'source_unavailable' },
    })
    return submitted ? 'uncertain' : 'retryable'
  }
}
