import { privateImageVariant } from '@/lib/media/private-image'
import { PRIVATE_IMAGE_WIDTHS } from '@/lib/media/image-loader'
import { z } from 'zod'
import prisma from '@/lib/db'
import { requireUserId } from '@/lib/action-helpers'
import { createAdminClient } from '@/lib/admin'
import { muxEnabled } from '@/lib/media/config'
import { ownsListingMediaPath } from '@/lib/media/policy'
import { LISTINGS_MEDIA_BUCKET } from '@/lib/storage'
import { galleryIsPublic, galleryPhotoPaths, galleryListingSelect, galleryUserSelect } from '@/lib/listings/gallery'
import { activeAccountWhere } from '@/lib/accounts/availability'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const inputSchema = z.object({ id: z.string().uuid(), kind: z.enum(['video', 'poster', 'photo']) })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const userId = await requireUserId()
    if (!userId) return Response.json({ error: 'Sign in to view media.' }, { status: 401, headers })
    const input = inputSchema.safeParse({ id: (await params).id, kind: new URL(request.url).searchParams.get('kind') })
    if (!input.success) return Response.json({ error: 'Not found.' }, { status: 404, headers })
    const { id, kind } = input.data
    const requestedWidth = new URL(request.url).searchParams.get('w')
    const width = requestedWidth === null ? null : Number(requestedWidth)
    if (width !== null && (kind === 'video' || !PRIVATE_IMAGE_WIDTHS.some(size => size === width) || String(width) !== requestedWidth)) return Response.json({ error: 'Invalid image size.' }, { status: 400, headers })
    const listing = await prisma.listing.findFirst({
      where: { id, lister: { is: activeAccountWhere }, OR: [{ lister_id: userId }, { listing_status: 'active' }] },
      select: { lister_id: true, video_path: true, poster_path: true, ...galleryListingSelect, lister: { select: galleryUserSelect } },
    })
    // Once Mux is enabled, non-owners must use signed playback, never raw fallback.
    const index = kind === 'photo' ? z.coerce.number().int().min(0).max(9).safeParse(new URL(request.url).searchParams.get('index') ?? undefined) : null
    const path = kind === 'video' ? listing?.video_path : kind === 'photo' ? index?.success && listing ? galleryPhotoPaths(listing)[index.data] : null : listing?.poster_path
    const pathKind = kind === 'poster' && listing?.media_source === 'approved_gallery' ? 'photo' : kind
    if (!listing || listing.lister_id !== userId && !galleryIsPublic(listing) || !path || !ownsListingMediaPath(listing.lister_id, path, pathKind) ||
        (kind === 'video' && muxEnabled() && listing.lister_id !== userId)) {
      return Response.json({ error: 'Not found.' }, { status: 404, headers })
    }
    const storage = createAdminClient().storage.from(LISTINGS_MEDIA_BUCKET)
    if (width !== null) {
      const image = await privateImageVariant(storage, path, width)
      return new Response(new Uint8Array(image), { headers: { ...headers, 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, Authorization' } })
    }
    const { data, error } = await storage.createSignedUrl(path, 300)
    if (error || !data?.signedUrl) return Response.json({ error: 'Media unavailable. Please try again.' }, { status: 503, headers })
    // Storage handles byte ranges; do not buffer large videos in the Next server.
    return new Response(null, { status: 307, headers: { ...headers, Location: data.signedUrl } })
  } catch {
    return Response.json({ error: 'Media unavailable. Please try again.' }, { status: 503, headers })
  }
}
