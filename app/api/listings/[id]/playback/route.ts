import { z } from 'zod'
import prisma from '@/lib/db'
import { requireUserId } from '@/lib/action-helpers'
import { muxClient } from '@/lib/media/mux'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { canViewMedia } from '@/lib/media/policy'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!muxEnabled() || !muxConfigured()) return Response.json({ error: 'Playback unavailable.' }, { status: 503, headers })
  try {
    const userId = await requireUserId()
    if (!userId) return Response.json({ error: 'Sign in to watch.' }, { status: 401, headers })
    const id = z.string().uuid().safeParse((await params).id)
    if (!id.success) return Response.json({ error: 'Not found.' }, { status: 404, headers })
    const media = await prisma.mediaAsset.findUnique({
      where: { listing_id: id.data },
      select: { status: true, playback_id: true, listing: { select: { lister_id: true, listing_status: true } } },
    })
    if (!media || !canViewMedia(userId, media.listing)) return Response.json({ error: 'Not found.' }, { status: 404, headers })
    if (media.status !== 'ready' || !media.playback_id) return Response.json({ error: 'Video is not ready yet.' }, { status: 409, headers })
    const tokens = await muxClient().jwt.signPlaybackId(media.playback_id, {
      keyId: process.env.MUX_SIGNING_KEY_ID!,
      keySecret: process.env.MUX_SIGNING_PRIVATE_KEY!,
      type: ['video', 'thumbnail', 'storyboard'],
      expiration: '15m',
    })
    return Response.json({ playbackId: media.playback_id, tokens }, { headers })
  } catch {
    return Response.json({ error: 'Playback unavailable. Please try again.' }, { status: 503, headers })
  }
}
