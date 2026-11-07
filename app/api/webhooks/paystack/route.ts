import { createHash } from 'node:crypto'
import { z } from 'zod'
import { paymentsEnabled } from '@/lib/payments/config'
import { verifiedPaymentSchema, verifyPaystackSignature } from '@/lib/payments/paystack'
import { recordVerifiedPayment } from '@/lib/payments/service'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!paymentsEnabled()) return Response.json({ success: false, error: 'Payments unavailable.' }, { status: 503, headers })
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 262144) return Response.json({ success: false, error: 'Payload too large.' }, { status: 413, headers })
    if (!verifyPaystackSignature(raw, request.headers)) return Response.json({ success: false, error: 'Unauthorized.' }, { status: 401, headers })
    const payload = z.object({ event: z.string(), data: z.unknown() }).parse(JSON.parse(raw))
    if (payload.event === 'charge.success') {
      await recordVerifiedPayment(verifiedPaymentSchema.parse(payload.data), createHash('sha256').update(raw).digest('hex'))
    }
    return Response.json({ success: true }, { headers })
  } catch (error) {
    console.error('[api/webhooks/paystack] Processing failed', error instanceof Error ? error.name : 'UnknownError')
    return Response.json({ success: false, error: 'Payment event could not be processed.' }, { status: error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500, headers })
  }
}
