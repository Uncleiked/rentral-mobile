import { paymentsEnabled } from '@/lib/payments/config'
import { verifyPaystackSignature } from '@/lib/payments/paystack'
import { paystackEnvironment } from '@/lib/payments/providers/paystack/client'
import { normalizePaystackWebhook, PaystackWebhookError, readPaystackWebhook } from '@/lib/payments/providers/paystack/webhooks'
import { ingestProviderReceipt } from '@/lib/payments/financial-receipts'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!paymentsEnabled()) return Response.json({ success: false, error: 'Payments unavailable.' }, { status: 503, headers })
  try {
    const raw = await readPaystackWebhook(request)
    if (!verifyPaystackSignature(raw, request.headers)) return Response.json({ success: false, error: 'Unauthorized.' }, { status: 401, headers })
    const environment = paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim())
    const payload = normalizePaystackWebhook(raw, environment)
    if (payload) await ingestProviderReceipt(payload.hint)
    return Response.json({ success: true }, { headers })
  } catch (error) {
    // Provider bodies and errors can contain bank/customer details. Return only fixed public messages.
    return Response.json({ success: false, error: error instanceof PaystackWebhookError ? error.message : 'Payment event could not be processed.' },
      { status: error instanceof PaystackWebhookError ? error.status : 500, headers })
  }
}
