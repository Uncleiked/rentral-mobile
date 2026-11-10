export type MediaStatus = 'queued' | 'submitting' | 'uploading' | 'uncertain' | 'processing' | 'ready' | 'errored'

// Mongo distinguishes an omitted optional field from an explicit null. Both
// represent a submission that has not acquired a provider asset identifier.
export const unboundAssetWhere = { OR: [{ mux_asset_id: null }, { mux_asset_id: { isSet: false } }] }

export function ownsVideoPath(userId: string, path: string): boolean {
  return ownsListingMediaPath(userId, path, 'video')
}

export function ownsListingMediaPath(userId: string, path: string, kind: 'video' | 'poster' | 'photo'): boolean {
  const parts = path.split('/')
  return parts.length === 3 && parts[0] === userId && parts.every(part => /^[\w.-]+$/.test(part) && !part.includes('..')) &&
    (kind === 'video' ? /\.(webm|mp4|mov)$/ : kind === 'photo' ? /\.(jpe?g|png)$/i : /\.jpg$/).test(parts[2])
}

export function validSource(info: { size?: number; contentType?: string }): boolean {
  return typeof info.size === 'number' && info.size > 0 && info.size <= 209715200 &&
    ['video/mp4', 'video/webm', 'video/quicktime'].includes(info.contentType?.split(';')[0] ?? '')
}

export function mediaDecision(asset: {
  status?: string; duration?: number; playback_ids?: { id: string; policy: string }[]; tracks?: { type?: string }[]
}): { status: MediaStatus; playback_id: string | null; duration: number | null; error_code: string | null } {
  if (asset.status === 'errored') return { status: 'errored', playback_id: null, duration: null, error_code: 'mux_error' }
  if (asset.status !== 'ready') return { status: 'processing', playback_id: null, duration: null, error_code: null }
  const playback = asset.playback_ids?.find(item => item.policy === 'signed')
  const duration = asset.duration
  if (!playback || asset.playback_ids?.some(item => item.policy !== 'signed') ||
      !asset.tracks?.some(track => track.type === 'video') ||
      !duration || !Number.isFinite(duration) || duration > 120 || duration <= 0) {
    return { status: 'errored', playback_id: null, duration: null, error_code: 'invalid_output' }
  }
  return { status: 'ready', playback_id: playback.id, duration, error_code: null }
}

export function canViewMedia(userId: string, listing: { lister_id: string; listing_status: string }): boolean {
  return listing.lister_id === userId || listing.listing_status === 'active'
}
