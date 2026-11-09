import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { ProviderCollection, ProviderEnvironment } from '../contracts'
import { amountSchema, collectionReferenceSchema, environmentSchema, normalizeCollection, parseProviderJson, providerIdSchema,
  refundReferenceSchema, refundStatusSchema, transferReferenceSchema, transferStatusSchema } from './schemas'

const MAX_WEBHOOK_BYTES = 256 * 1024
export class PaystackWebhookError extends Error {
  constructor(public readonly status: 400 | 401 | 413) {
    super(status === 413 ? 'Payload too large.' : status === 401 ? 'Unauthorized.' : 'Invalid payment event.')
    this.name = 'PaystackWebhookError'
  }
}

export interface PaystackWebhookHint {
  provider: 'paystack'
  environment: ProviderEnvironment
  event: string
  entity: 'collection' | 'transfer' | 'refund'
  providerId: string | null
  reference: string | null
  transactionReference: string | null
  status: string
  amountKobo: string
  currency: 'NGN'
  /** Stable across delivery timestamps, JSON formatting/order and irrelevant private provider fields. */
  eventKey: string
  payloadHash: string
  /** Every event is a hint: fetch provider truth and recheck all operation bindings before posting money. */
  requiresReconciliation: true
  /** No refund ID/reference means that the hint cannot identify one of several partial refunds. */
  hasStrongIdentity: boolean
}

function equalSignature(actual: string, expected: Buffer): boolean {
  return /^[a-f0-9]{128}$/i.test(actual) && timingSafeEqual(Buffer.from(actual, 'hex'), expected)
}

/** Authenticate original bytes before decoding JSON. Configuring modern signing disables legacy downgrade. */
export function verifyPaystackWebhook(raw: Uint8Array, headers: Headers, options: {
  signingSecrets?: readonly string[]; legacySecret?: string; now?: number
}): boolean {
  if (raw.byteLength > MAX_WEBHOOK_BYTES) return false
  const secrets = options.signingSecrets?.filter(secret => secret.trim()) ?? []
  if (secrets.length) {
    const header = headers.get('paystack-signature') ?? ''
    if (header.length > 16384) return false
    const parts = header.split(',').map(part => part.trim())
    if (parts.length > 32) return false
    const timestamps = parts.filter(part => part.startsWith('t='))
    if (timestamps.length !== 1 || !/^t=\d{1,13}$/.test(timestamps[0])) return false
    const timestamp = timestamps[0].slice(2)
    const now = options.now ?? Date.now()
    if (!Number.isFinite(now) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false
    const signatures = parts.flatMap(part => /^v1=whk_[a-zA-Z0-9_-]+:[a-f0-9]{128}$/i.test(part) ? [part.slice(part.indexOf(':') + 1)] : [])
    return secrets.some(secret => {
      const expected = createHmac('sha512', secret).update(`${timestamp}.`).update(raw).digest()
      return signatures.some(signature => equalSignature(signature, expected))
    })
  }
  const secret = options.legacySecret?.trim()
  const signature = headers.get('x-paystack-signature')
  return Boolean(secret?.startsWith('sk_') && signature && equalSignature(signature, createHmac('sha512', secret).update(raw).digest()))
}

export function paystackWebhookSecrets(): { signingSecrets: string[]; legacySecret?: string } {
  return { signingSecrets: [process.env.PAYSTACK_WEBHOOK_SECRET?.trim(), process.env.PAYSTACK_WEBHOOK_PREVIOUS_SECRET?.trim()].filter((value): value is string => Boolean(value)),
    legacySecret: process.env.PAYSTACK_SECRET_KEY?.trim() }
}

export async function readPaystackWebhook(request: Request): Promise<Uint8Array> {
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_WEBHOOK_BYTES)) {
    await request.body?.cancel().catch(() => undefined)
    throw new PaystackWebhookError(413)
  }
  if (!request.body) throw new PaystackWebhookError(400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_WEBHOOK_BYTES) throw new PaystackWebhookError(413)
      chunks.push(value)
    }
    const raw = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.byteLength }
    return raw
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error instanceof PaystackWebhookError ? error : new PaystackWebhookError(400)
  } finally { reader.releaseLock() }
}

function fingerprint(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))).digest('hex')
}

const eventSchema = z.object({ event: z.string().min(1).max(100), data: z.unknown() })
const transferHintSchema = z.object({ id: providerIdSchema.nullish(), domain: environmentSchema, reference: transferReferenceSchema,
  amount: amountSchema, currency: z.literal('NGN'), status: transferStatusSchema })
const refundHintSchema = z.object({ id: providerIdSchema.nullish(), domain: environmentSchema, reference: refundReferenceSchema.nullish(),
  refund_reference: refundReferenceSchema.nullish(), transaction_reference: collectionReferenceSchema.nullish(),
  amount: amountSchema, currency: z.literal('NGN'), status: refundStatusSchema })

/** Call only after verifyPaystackWebhook returns true; the route enforces this ordering. */
export function normalizePaystackWebhook(raw: Uint8Array, environment: ProviderEnvironment): { hint: PaystackWebhookHint; collection?: ProviderCollection } | null {
  try {
    const payload = eventSchema.parse(parseProviderJson(new TextDecoder('utf-8', { fatal: true }).decode(raw)))
    let base: Omit<PaystackWebhookHint, 'eventKey' | 'payloadHash' | 'requiresReconciliation' | 'hasStrongIdentity'>
    let collection: ProviderCollection | undefined
    if (payload.event === 'charge.success') {
      collection = normalizeCollection(payload.data, environment)
      if (collection.status !== 'success') throw new Error()
      base = { provider: 'paystack', environment, event: payload.event, entity: 'collection', providerId: collection.providerId,
        reference: collection.reference, transactionReference: collection.reference, status: collection.status, amountKobo: collection.amountKobo, currency: 'NGN' }
    } else if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(payload.event)) {
      const value = transferHintSchema.parse(payload.data)
      if (value.domain !== environment || payload.event !== `transfer.${value.status}`) throw new Error()
      base = { provider: 'paystack', environment, event: payload.event, entity: 'transfer', providerId: value.id ?? null,
        reference: value.reference, transactionReference: null, status: value.status, amountKobo: value.amount, currency: 'NGN' }
    } else if (['refund.pending', 'refund.processing', 'refund.needs-attention', 'refund.failed', 'refund.processed'].includes(payload.event)) {
      const value = refundHintSchema.parse(payload.data)
      if (value.domain !== environment || payload.event !== `refund.${value.status}`
        || (value.reference && value.refund_reference && value.reference !== value.refund_reference)) throw new Error()
      base = { provider: 'paystack', environment, event: payload.event, entity: 'refund', providerId: value.id ?? null,
        reference: value.reference ?? value.refund_reference ?? null, transactionReference: value.transaction_reference ?? null,
        status: value.status, amountKobo: value.amount, currency: 'NGN' }
    } else return null
    const hasStrongIdentity = Boolean(base.providerId || base.reference)
    const identity = { provider: base.provider, environment, event: base.event, entity: base.entity,
      ...(base.reference ? { reference: base.reference } : base.providerId ? { providerId: base.providerId } : { transactionReference: base.transactionReference, amountKobo: base.amountKobo }) }
    return { hint: { ...base, eventKey: fingerprint(identity), payloadHash: fingerprint({ ...base }), requiresReconciliation: true, hasStrongIdentity }, ...(collection ? { collection } : {}) }
  } catch { throw new PaystackWebhookError(400) }
}
