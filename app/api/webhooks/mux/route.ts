import { z } from 'zod'
import prisma from '@/lib/db'
import { muxClient } from '@/lib/media/mux'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { applyMediaEvent } from '@/lib/media/webhook'

export const runtime = 'nodejs'
const eventSchema = z.object({ id: z.string().min(1).max(255), type: z.string(), data: z.object({ id: z.string().min(1).max(255) }) })

export async function POST(request: Request): Promise<Response> {
  if (!muxEnabled() || !muxConfigured()) return new Response('Unavailable', { status: 503 })
  if (!request.headers.get('mux-signature')) return new Response('Invalid signature', { status: 401 })
  const reader = request.body?.getReader()
  if (!reader) return new Response('Invalid payload', { status: 400 })
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 65536) {
        await reader.cancel()
        return new Response('Payload too large', { status: 413 })
      }
      chunks.push(value)
    }
  } catch {
    return new Response('Invalid payload', { status: 400 })
  }
  const mux = muxClient()
  let event: z.infer<typeof eventSchema>
  try {
    const verified = await mux.webhooks.unwrap(Buffer.concat(chunks).toString('utf8'), request.headers)
    const timestamp = Number(request.headers.get('mux-signature')?.split(',').filter(part => part.startsWith('t=')).at(-1)?.slice(2))
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
      return new Response('Invalid signature timestamp', { status: 401 })
    }
    const parsed = eventSchema.safeParse(verified)
    if (!parsed.success) return new Response('Invalid payload', { status: 400 })
    event = parsed.data
  } catch {
    return new Response('Invalid signature', { status: 401 })
  }
  if (!['video.asset.created', 'video.asset.ready', 'video.asset.errored'].includes(event.type)) return new Response('Ignored')
  try {
    if (await prisma.mediaWebhookReceipt.findUnique({ where: { event_id: event.id } })) return new Response('OK')
    const asset = await mux.video.assets.retrieve(event.data.id)
    await applyMediaEvent(event.id, asset)
    return new Response('OK')
  } catch {
    console.warn('[mux-webhook] Processing failed; delivery can be retried.')
    return new Response('Retry later', { status: 503 })
  }
}
