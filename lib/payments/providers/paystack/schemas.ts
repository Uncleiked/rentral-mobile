import { z } from 'zod'
import type { ProviderCollection, ProviderEnvironment, ProviderRecipient, ProviderRefund, ProviderTransfer } from '../contracts'

const UINT64_MAX = BigInt('18446744073709551615')
export const providerIdSchema = z.union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative().safe()])
  .transform(String).refine(value => BigInt(value) <= UINT64_MAX).transform(value => BigInt(value).toString())
export const amountSchema = z.union([z.string().regex(/^[1-9]\d{0,15}$/), z.number().int().positive().safe()])
  .transform(String).refine(value => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER))
export const environmentSchema = z.enum(['test', 'live'])
export const collectionStatusSchema = z.enum(['abandoned', 'failed', 'ongoing', 'pending', 'processing', 'queued', 'reversed', 'success'])
export const transferStatusSchema = z.enum(['pending', 'otp', 'received', 'success', 'failed', 'reversed', 'blocked', 'rejected', 'abandoned'])
export const refundStatusSchema = z.enum(['pending', 'processing', 'needs-attention', 'processed', 'failed'])
export const collectionReferenceSchema = z.string().min(1).max(150).regex(/^[a-zA-Z0-9._=-]+$/)
export const transferReferenceSchema = z.string().min(16).max(50).regex(/^[a-z0-9_-]+$/)
export const refundReferenceSchema = z.string().min(8).max(64).regex(/^[a-zA-Z0-9_-]+$/).transform(value => value.toLowerCase())
export const recipientCodeSchema = z.string().regex(/^RCP_[a-zA-Z0-9]+$/).max(100)
export const transferCodeSchema = z.string().regex(/^TRF_[a-zA-Z0-9]+$/).max(100)
export const accountNumberSchema = z.string().regex(/^\d{10}$/)
export const bankCodeSchema = z.string().regex(/^\d{2,12}$/)
export const collectionMetadataSchema = z.object({ rentral_payment_id: z.string().uuid(), rentral_user_id: z.string().uuid() })

const collectionSchema = z.object({
  id: providerIdSchema, domain: environmentSchema, reference: collectionReferenceSchema, status: collectionStatusSchema,
  amount: amountSchema, currency: z.literal('NGN'), customer: z.object({ email: z.string().email().max(320) }),
  metadata: z.unknown(),
})
const transferSchema = z.object({
  id: providerIdSchema, domain: environmentSchema, reference: transferReferenceSchema, transfer_code: transferCodeSchema,
  amount: amountSchema, currency: z.literal('NGN'), status: transferStatusSchema,
  recipient: z.union([providerIdSchema, z.object({ recipient_code: recipientCodeSchema })]),
})
const refundSchema = z.object({
  id: providerIdSchema, domain: environmentSchema, reference: refundReferenceSchema.nullish(),
  transaction: z.union([providerIdSchema, z.object({ id: providerIdSchema, reference: collectionReferenceSchema })]),
  amount: amountSchema, currency: z.literal('NGN'), status: refundStatusSchema,
})
const recipientSchema = z.object({
  id: providerIdSchema, domain: environmentSchema, recipient_code: recipientCodeSchema,
  active: z.boolean(), is_deleted: z.boolean().optional(), currency: z.literal('NGN'), type: z.literal('nuban'),
  details: z.object({ account_number: accountNumberSchema, account_name: z.string().trim().min(1).max(200).nullable(), bank_code: bankCodeSchema }),
})

/** Node 24 exposes the original token; preserve unsigned 64-bit IDs without rounding. */
export function parseProviderJson(raw: string): unknown {
  return JSON.parse(raw, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value === 'number' && !Number.isSafeInteger(value) && Number.isInteger(value)) {
      if (!context?.source || !/^\d+$/.test(context.source)) throw new SyntaxError('Unsafe provider integer.')
      return context.source
    }
    return value
  })
}

export function normalizeCollection(data: unknown, environment: ProviderEnvironment): ProviderCollection {
  const parsed = collectionSchema.parse(data)
  if (parsed.domain !== environment) throw new Error('Provider environment mismatch.')
  const metadata = collectionMetadataSchema.parse(typeof parsed.metadata === 'string' ? parseProviderJson(parsed.metadata) : parsed.metadata)
  return { provider: 'paystack', environment, providerId: parsed.id, reference: parsed.reference, status: parsed.status,
    amountKobo: parsed.amount, currency: 'NGN', customerEmail: parsed.customer.email,
    metadata: { paymentId: metadata.rentral_payment_id, userId: metadata.rentral_user_id } }
}

export function normalizeTransfer(data: unknown, environment: ProviderEnvironment): ProviderTransfer {
  const parsed = transferSchema.parse(data)
  if (parsed.domain !== environment) throw new Error('Provider environment mismatch.')
  return { provider: 'paystack', environment, providerId: parsed.id, reference: parsed.reference, transferCode: parsed.transfer_code,
    status: parsed.status, amountKobo: parsed.amount, currency: 'NGN', recipientCode: typeof parsed.recipient === 'object' ? parsed.recipient.recipient_code : null }
}

export function normalizeRefund(data: unknown, environment: ProviderEnvironment): ProviderRefund {
  const parsed = refundSchema.parse(data)
  if (parsed.domain !== environment) throw new Error('Provider environment mismatch.')
  return { provider: 'paystack', environment, providerId: parsed.id, reference: parsed.reference ?? null,
    transactionId: typeof parsed.transaction === 'object' ? parsed.transaction.id : parsed.transaction,
    transactionReference: typeof parsed.transaction === 'object' ? parsed.transaction.reference : null,
    status: parsed.status, amountKobo: parsed.amount, currency: 'NGN' }
}

export function normalizeRecipient(data: unknown, environment: ProviderEnvironment): ProviderRecipient {
  const parsed = recipientSchema.parse(data)
  if (parsed.domain !== environment) throw new Error('Provider environment mismatch.')
  return { provider: 'paystack', environment, providerId: parsed.id, recipientCode: parsed.recipient_code,
    active: parsed.active && !parsed.is_deleted, currency: 'NGN', accountNumber: parsed.details.account_number,
    accountName: parsed.details.account_name, bankCode: parsed.details.bank_code }
}
