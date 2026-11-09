import { z } from 'zod'
import { PaystackError, paystackClientFromEnvironment } from './providers/paystack/client'
import { paystackWebhookSecrets, verifyPaystackWebhook } from './providers/paystack/webhooks'

/** Legacy collection boundary retained while settlement callers migrate to normalized provider DTOs. */
export const verifiedPaymentSchema = z.object({
  id: z.union([z.number().int().nonnegative().safe(), z.string().regex(/^\d+$/)]).transform(String),
  reference: z.string().min(1).max(150),
  environment: z.enum(['test', 'live']).optional(),
  status: z.string(), amount: z.number().int().positive().safe(), currency: z.string(),
  customer: z.object({ email: z.string().email() }),
  metadata: z.union([z.object({ rentral_payment_id: z.string().uuid(), rentral_user_id: z.string().uuid() }), z.string()]),
})
export type VerifiedPayment = z.infer<typeof verifiedPaymentSchema>

export async function initializePaystack(input: { id: string; userId: string; email: string; reference: string; amountKobo: bigint; callbackUrl: string }): Promise<string> {
  try {
    return (await paystackClientFromEnvironment().initializeCollection({ ...input, paymentId: input.id })).checkoutUrl
  } catch (error) {
    if (error instanceof PaystackError && error.code === 'BINDING_MISMATCH') throw new Error('Invalid checkout response.')
    throw error
  }
}

export async function verifyPaystack(reference: string): Promise<VerifiedPayment> {
  const payment = await paystackClientFromEnvironment().verifyCollection(reference)
  return verifiedPaymentSchema.parse({ id: payment.providerId, environment: payment.environment, reference: payment.reference, status: payment.status,
    amount: Number(payment.amountKobo), currency: payment.currency, customer: { email: payment.customerEmail },
    metadata: { rentral_payment_id: payment.metadata.paymentId, rentral_user_id: payment.metadata.userId } })
}

export function verifyPaystackSignature(raw: string | Uint8Array, headers: Headers, now: number = Date.now()): boolean {
  return verifyPaystackWebhook(typeof raw === 'string' ? new TextEncoder().encode(raw) : raw, headers, { ...paystackWebhookSecrets(), now })
}
