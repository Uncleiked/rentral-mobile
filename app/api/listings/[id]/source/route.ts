import { z } from 'zod'
import prisma from '@/lib/db'
import { requireUserId } from '@/lib/action-helpers'
import { createAdminClient } from '@/lib/admin'
import { muxEnabled } from '@/lib/media/config'
import { ownsListingMediaPath } from '@/lib/media/policy'
import { LISTINGS_MEDIA_BUCKET } from '@/lib/storage'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const inputSchema = z.object({ id: z.string().uuid(), kind: z.enum(['video', 'poster']) })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const userId = await requireUserId()
    if (!userId) return Response.json({ error: 'Sign in to view media.' }, { status: 401, headers })
    const input = inputSchema.safeParse({ id: (await params).id, kind: new URL(request.url).searchParams.get('kind') })
    if (!input.success) return Response.json({ error: 'Not found.' }, { status: 404, headers })
    const { id, kind } = input.data
    const listing = await prisma.listing.findFirst({
      where: { id, OR: [{ lister_id: userId }, { listing_status: 'active' }] },
      select: { lister_id: true, video_path: true, poster_path: true },
    })
    // Once Mux is enabled, non-owners must use signed playback, never raw fallback.
    const path = kind === 'video' ? listing?.video_path : listing?.poster_path
    if (!listing || !path || !ownsListingMediaPath(listing.lister_id, path, kind) ||
        (kind === 'video' && muxEnabled() && listing.lister_id !== userId)) {
      return Response.json({ error: 'Not found.' }, { status: 404, headers })
    }
    const { data, error } = await createAdminClient().storage.from(LISTINGS_MEDIA_BUCKET).createSignedUrl(path, 300)
    if (error || !data?.signedUrl) return Response.json({ error: 'Media unavailable. Please try again.' }, { status: 503, headers })
    // Storage handles byte ranges; do not buffer large videos in the Next server.
    return new Response(null, { status: 307, headers: { ...headers, Location: data.signedUrl } })
  } catch {
    return Response.json({ error: 'Media unavailable. Please try again.' }, { status: 503, headers })
  }
}
