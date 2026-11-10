import { z } from 'zod'
import { nativeMediaUrl } from './media-url'
export const nativeListingMediaSchema = z.object({ videoUrl: z.string().url().nullable(), posterUrl: z.string().url().nullable(), expiresAt: z.string().datetime({ offset: true }),
  mediaSource: z.enum(['recorded', 'approved_gallery']).optional(), galleryPhotoUrls: z.array(z.string().url()).max(10).optional() })
export function nativeGalleryPhotoUrl(value: string, apiOrigin: string): string | null {
  const resolved = nativeMediaUrl(value, apiOrigin)
  if (!resolved) return null
  try {
    const url = new URL(resolved)
    if (url.origin !== new URL(apiOrigin).origin || url.hash || !/^\/api\/v1\/files\/listings-media\/[a-f0-9-]{36}\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png)$/i.test(url.pathname)
      || !url.searchParams.get('token') || url.searchParams.getAll('token').length !== 1 || [...url.searchParams.keys()].some(key => key !== 'token')) return null
    return url.toString()
  } catch { return null }
}
