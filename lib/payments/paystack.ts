import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const initializeResponseSchema = z.object({ status: z.literal(true), data: z.object({ authorization_url: z.string().url(), reference: z.string() }) })
export const verifiedPaymentSchema = z.object({
  id: z.union([z.number().int().nonnegative().safe(), z.string().regex(/^\d+$/)]).transform(String),
  reference: z.string().min(1).max(150),
  status: z.string(), amount: z.number().int().positive().safe(), currency: z.string(),
  customer: z.object({ email: z.string().email() }),
  metadata: z.union([z.object({ rentral_payment_id: z.string().uuid(), rentral_user_id: z.string().uuid() }), z.string()]),
})
export type VerifiedPayment = z.infer<typeof verifiedPaymentSchema>

async function paystackFetch(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init, headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000), cache: 'no-store',
  })
  if (!response.ok) throw new Error('Payment provider unavailable.')
  return response.json()
}

export async function initializePaystack(input: { id: string; userId: string; email: string; reference: string; amountKobo: bigint; callbackUrl: string }): Promise<string> {
  const parsed = initializeResponseSchema.parse(await paystackFetch('/transaction/initialize', {
    method: 'POST', body: JSON.stringify({ email: input.email, amount: input.amountKobo.toString(), currency: 'NGN', reference: input.reference,
      callback_url: input.callbackUrl, metadata: JSON.stringify({ rentral_payment_id: input.id, rentral_user_id: input.userId }) }),
  }))
  const checkout = new URL(parsed.data.authorization_url)
  if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.paystack.com' || parsed.data.reference !== input.reference) throw new Error('Invalid checkout response.')
  return checkout.href
}

export async function verifyPaystack(reference: string): Promise<VerifiedPayment> {
  const response = z.object({ status: z.literal(true), data: verifiedPaymentSchema }).parse(await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`))
  return response.data
}

function equalSignature(actual: string, expected: Buffer): boolean {
  return /^[a-f0-9]{128}$/i.test(actual) && timingSafeEqual(Buffer.from(actual, 'hex'), expected)
}

export function verifyPaystackSignature(raw: string, headers: Headers, now: number = Date.now()): boolean {
  const signingSecret = process.env.PAYSTACK_WEBHOOK_SECRET?.trim()
  // Once modern signing is configured, never downgrade to legacy verification.
  if (signingSecret) {
    const header = headers.get('paystack-signature') ?? ''
    const parts = header.split(',').map(part => part.trim())
    const timestamps = parts.filter(part => part.startsWith('t='))
    if (timestamps.length !== 1 || !/^t=\d+$/.test(timestamps[0])) return false
    const timestamp = timestamps[0].slice(2)
    if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false
    const expected = createHmac('sha512', signingSecret).update(`${timestamp}.`).update(raw).digest()
    return parts.some(part => part.startsWith('v1=') && equalSignature(part.slice(part.indexOf(':') + 1), expected))
  }
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim()
  const signature = headers.get('x-paystack-signature')
  return Boolean(secret && signature && equalSignature(signature, createHmac('sha512', secret).update(raw).digest()))
}
