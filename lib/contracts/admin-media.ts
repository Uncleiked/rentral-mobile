import { z } from 'zod'

// Capabilities are returned as relative URLs so they cannot navigate away from
// this app or accidentally expose compliance documents through this contract.
const localMediaUrl = z.string().max(5000).refine(value => {
  try {
    const url = new URL(value, 'https://rentral.invalid')
    return value.startsWith('/api/v1/files/listings-media/') && url.pathname.startsWith('/api/v1/files/listings-media/') && url.origin === 'https://rentral.invalid'
      && !url.hash && url.searchParams.size === 1 && Boolean(url.searchParams.get('token'))
  } catch { return false }
}, 'Use a scoped same-origin media preview.')
export const adminListingMediaSchema = z.object({
  items: z.array(z.object({ kind: z.enum(['image', 'video']), url: localMediaUrl, expiresAt: z.string().datetime() }).strict()).min(1).max(11),
  source: z.enum(['recorded', 'approved_gallery']),
}).strict().refine(value => value.items.filter(item => item.kind === 'image').length <= 10 && value.items.filter(item => item.kind === 'video').length <= 1, 'Media previews must be bounded.')
export type AdminListingMedia = z.infer<typeof adminListingMediaSchema>
