import prisma from '@/lib/db'
import { createAdminClient } from '@/lib/admin'
import { canViewMedia, ownsListingMediaPath } from '@/lib/media/policy'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { muxClient } from '@/lib/media/mux'
import { LISTINGS_MEDIA_BUCKET } from '@/lib/storage'
import { ApiError } from './http'

const STORAGE_URL_SECONDS = 300
const PLAYBACK_URL_SECONDS = 900
export type ApiListingMedia = { posterUrl: string | null; videoUrl: string | null; expiresAt: string }

/** Authorize before signing; native players receive temporary URLs without access tokens. */
export async function listingMediaForApi(userId: string, listingId: string): Promise<ApiListingMedia> {
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, OR: [{ lister_id: userId }, { listing_status: 'active' }] },
    select: { lister_id: true, listing_status: true, poster_path: true, video_path: true },
  })
  if (!listing || !canViewMedia(userId, listing)) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable.')
  if (muxEnabled() && listing.listing_status !== 'draft') {
    if (!muxConfigured()) throw new ApiError(503, 'MEDIA_UNAVAILABLE', 'Video is temporarily unavailable.')
    const media = await prisma.mediaAsset.findUnique({ where: { listing_id: listingId }, select: { status: true, playback_id: true } })
    if (!media || media.status !== 'ready' || !media.playback_id) throw new ApiError(409, 'MEDIA_PROCESSING', 'Video is still being prepared.')
    const tokens = await muxClient().jwt.signPlaybackId(media.playback_id, {
      keyId: process.env.MUX_SIGNING_KEY_ID!, keySecret: process.env.MUX_SIGNING_PRIVATE_KEY!,
      type: ['video', 'thumbnail'], expiration: '15m',
    })
    const videoToken = tokens['playback-token']
    const thumbnailToken = tokens['thumbnail-token']
    if (!videoToken || !thumbnailToken) throw new ApiError(503, 'MEDIA_UNAVAILABLE', 'Video is temporarily unavailable.')
    const playbackId = encodeURIComponent(media.playback_id)
    return {
      videoUrl: `https://stream.mux.com/${playbackId}.m3u8?${new URLSearchParams({ token: videoToken })}`,
      posterUrl: `https://image.mux.com/${playbackId}/thumbnail.jpg?${new URLSearchParams({ token: thumbnailToken })}`,
      expiresAt: new Date(Date.now() + PLAYBACK_URL_SECONDS * 1000).toISOString(),
    }
  }
  async function sign(path: string | null, kind: 'poster' | 'video'): Promise<string | null> {
    if (!path) return null
    if (!listing || !ownsListingMediaPath(listing.lister_id, path, kind)) throw new ApiError(404, 'NOT_FOUND', 'This media is unavailable.')
    const result = await createAdminClient().storage.from(LISTINGS_MEDIA_BUCKET).createSignedUrl(path, STORAGE_URL_SECONDS)
    if (result.error || !result.data?.signedUrl) throw new ApiError(503, 'MEDIA_UNAVAILABLE', 'Media is temporarily unavailable.')
    return result.data.signedUrl
  }
  const [posterUrl, videoUrl] = await Promise.all([sign(listing.poster_path, 'poster'), sign(listing.video_path, 'video')])
  return { posterUrl, videoUrl, expiresAt: new Date(Date.now() + STORAGE_URL_SECONDS * 1000).toISOString() }
}
