import { z } from 'zod'
import type { ProviderBank, ProviderEnvironment, ProviderRefund, ResolvedBankAccount } from '../contracts'
import { accountNumberSchema, amountSchema, bankCodeSchema, collectionMetadataSchema, collectionReferenceSchema, environmentSchema,
  normalizeCollection, normalizeRecipient, normalizeRefund, normalizeTransfer, parseProviderJson, providerIdSchema,
  recipientCodeSchema, refundReferenceSchema, transferCodeSchema, transferReferenceSchema } from './schemas'

export type PaystackErrorCode = 'INVALID_INPUT' | 'UNAVAILABLE' | 'TIMEOUT' | 'REJECTED' | 'CONFLICT' | 'NOT_FOUND' | 'INVALID_RESPONSE' | 'BINDING_MISMATCH'
export type PaystackTransport = (url: string, init: RequestInit) => Promise<Response>
export class PaystackError extends Error {
  constructor(public readonly code: PaystackErrorCode, public readonly uncertain = false) {
    // Never copy provider messages, URLs, bank details, credentials or response bodies into errors.
    super(code === 'INVALID_INPUT' ? 'Invalid payment provider request.' : code === 'BINDING_MISMATCH' ? 'Payment provider binding mismatch.' : 'Payment provider unavailable.')
    this.name = 'PaystackError'
  }
}

const MAX_RESPONSE_BYTES = 1024 * 1024
const initializeSchema = z.object({ authorization_url: z.string().url(), reference: collectionReferenceSchema })
const resolveSchema = z.object({ account_number: accountNumberSchema, account_name: z.string().trim().min(1).max(200) })
const bankSchema = z.object({ id: providerIdSchema, code: bankCodeSchema, name: z.string().trim().min(1).max(200), active: z.boolean(), is_deleted: z.boolean().optional(), currency: z.literal('NGN') })

function input<T>(validate: () => T): T {
  try { return validate() } catch { throw new PaystackError('INVALID_INPUT') }
}

function response<T>(validate: () => T, mutating: boolean): T {
  try { return validate() } catch (error) {
    if (error instanceof PaystackError) throw error
    throw new PaystackError('INVALID_RESPONSE', mutating)
  }
}

function amount(value: bigint): number {
  return input(() => Number(amountSchema.parse(value.toString())))
}

function binding(condition: boolean, mutating: boolean): void {
  if (!condition) throw new PaystackError('BINDING_MISMATCH', mutating)
}

async function boundedJson(res: Response): Promise<unknown> {
  const size = res.headers.get('content-length')
  if (size && (!/^\d+$/.test(size) || Number(size) > MAX_RESPONSE_BYTES)) {
    await res.body?.cancel().catch(() => undefined)
    throw new Error('Oversized provider response.')
  }
  if (!res.body) throw new Error('Missing provider response.')
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('Oversized provider response.')
      chunks.push(value)
    }
    const buffer = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }
    return parseProviderJson(new TextDecoder('utf-8', { fatal: true }).decode(buffer))
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally { reader.releaseLock() }
}

export function paystackEnvironment(secretKey: string, explicit?: string): ProviderEnvironment {
  const inferred = /^(sk|rk)_test_/.test(secretKey) ? 'test' : /^(sk|rk)_live_/.test(secretKey) ? 'live' : undefined
  const environment = explicit ? input(() => environmentSchema.parse(explicit)) : inferred
  if (!environment || !secretKey.trim() || secretKey.startsWith('pk_') || /[\r\n]/.test(secretKey)
      || (inferred && inferred !== environment)) throw new PaystackError('INVALID_INPUT')
  return environment
}

export function createPaystackClient(options: { secretKey: string; environment: ProviderEnvironment; fetch?: PaystackTransport; timeoutMs?: number }) {
  const secretKey = options.secretKey.trim()
  const environment = paystackEnvironment(secretKey, options.environment)
  const fetcher: PaystackTransport = options.fetch ?? ((url, init) => globalThis.fetch(url, init))
  const timeoutMs = options.timeoutMs ?? 15000
  input(() => z.number().int().min(1).max(15000).parse(timeoutMs))

  async function request(path: string, body?: Record<string, unknown>, envelope = false): Promise<unknown> {
    const mutating = body !== undefined
    const signal = AbortSignal.timeout(timeoutMs)
    try {
      // The origin is fixed and redirects are forbidden: Authorization must never reach another host.
      const res = await fetcher(`https://api.paystack.co${path}`, {
        method: mutating ? 'POST' : 'GET', redirect: 'error', cache: 'no-store', signal,
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(mutating ? { body: JSON.stringify(body) } : {}),
      })
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined)
        const code = res.status === 409 ? 'CONFLICT' : res.status === 404 ? 'NOT_FOUND' : res.status >= 500 || res.status === 429 ? 'UNAVAILABLE' : 'REJECTED'
        throw new PaystackError(code, mutating && (res.status >= 500 || res.status === 409 || res.status === 429))
      }
      let raw: unknown
      try { raw = await boundedJson(res) } catch { throw new PaystackError(signal.aborted ? 'TIMEOUT' : 'INVALID_RESPONSE', mutating) }
      const parsed = response(() => z.object({ status: z.literal(true), data: z.unknown(), meta: z.unknown().optional() }).parse(raw), mutating)
      return envelope ? parsed : parsed.data
    } catch (error) {
      if (error instanceof PaystackError) throw error
      throw new PaystackError(signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE', mutating)
    }
  }

  return {
    environment,
    async initializeCollection(value: { paymentId: string; userId: string; email: string; reference: string; amountKobo: bigint; callbackUrl: string }): Promise<{ checkoutUrl: string; reference: string }> {
      const parsed = input(() => z.object({ paymentId: z.string().uuid(), userId: z.string().uuid(), email: z.string().email().max(320),
        reference: collectionReferenceSchema, callbackUrl: z.string().url() }).parse(value))
      const callback = input(() => new URL(parsed.callbackUrl))
      input(() => { if (!['https:', 'http:'].includes(callback.protocol) || callback.username || callback.password || (environment === 'live' && callback.protocol !== 'https:')) throw new Error() })
      const data = await request('/transaction/initialize', { email: parsed.email, amount: amount(value.amountKobo), currency: 'NGN', reference: parsed.reference,
        callback_url: callback.href, metadata: JSON.stringify({ rentral_payment_id: parsed.paymentId, rentral_user_id: parsed.userId }) })
      const result = response(() => initializeSchema.parse(data), true)
      const checkout = response(() => new URL(result.authorization_url), true)
      binding(checkout.protocol === 'https:' && checkout.hostname === 'checkout.paystack.com' && !checkout.port && !checkout.username && !checkout.password
        && !checkout.hash && result.reference === parsed.reference, true)
      return { checkoutUrl: checkout.href, reference: result.reference }
    },
    async verifyCollection(reference: string) {
      const ref = input(() => collectionReferenceSchema.parse(reference))
      const data = await request(`/transaction/verify/${encodeURIComponent(ref)}`)
      const result = response(() => normalizeCollection(data, environment), false)
      binding(result.reference === ref, false)
      return result
    },
    async resolveBankAccount(value: { accountNumber: string; bankCode: string }): Promise<ResolvedBankAccount> {
      const parsed = input(() => z.object({ accountNumber: accountNumberSchema, bankCode: bankCodeSchema }).parse(value))
      const query = new URLSearchParams({ account_number: parsed.accountNumber, bank_code: parsed.bankCode })
      const data = await request(`/bank/resolve?${query}`)
      const result = response(() => resolveSchema.parse(data), false)
      binding(result.account_number === parsed.accountNumber, false)
      return { accountNumber: result.account_number, accountName: result.account_name, bankCode: parsed.bankCode }
    },
    async createRecipient(value: { accountNumber: string; bankCode: string }) {
      // Always resolve the account on the provider first; a supplied display name is not verification.
      const resolved = await this.resolveBankAccount(value)
      const data = await request('/transferrecipient', { type: 'nuban', currency: 'NGN', name: resolved.accountName,
        account_number: resolved.accountNumber, bank_code: resolved.bankCode })
      const result = response(() => normalizeRecipient(data, environment), true)
      binding(result.active && result.accountNumber === resolved.accountNumber && result.bankCode === resolved.bankCode, true)
      return { ...result, accountName: result.accountName ?? resolved.accountName }
    },
    async fetchRecipient(code: string) {
      const ref = input(() => recipientCodeSchema.parse(code))
      const data = await request(`/transferrecipient/${encodeURIComponent(ref)}`)
      const result = response(() => normalizeRecipient(data, environment), false)
      binding(result.recipientCode === ref, false)
      return result
    },
    async initiateTransfer(value: { reference: string; amountKobo: bigint; recipientCode: string; reason?: string }) {
      const parsed = input(() => z.object({ reference: transferReferenceSchema, recipientCode: recipientCodeSchema, reason: z.string().trim().min(1).max(200).optional() }).parse(value))
      const data = await request('/transfer', { source: 'balance', amount: amount(value.amountKobo), currency: 'NGN', recipient: parsed.recipientCode,
        reference: parsed.reference, ...(parsed.reason ? { reason: parsed.reason } : {}) })
      const result = response(() => normalizeTransfer(data, environment), true)
      binding(result.reference === parsed.reference && result.amountKobo === value.amountKobo.toString()
        && (result.recipientCode === null || result.recipientCode === parsed.recipientCode), true)
      return result
    },
    async finalizeTransfer(value: { transferCode: string; otp: string }) {
      const parsed = input(() => z.object({ transferCode: transferCodeSchema, otp: z.string().regex(/^\d{4,10}$/) }).parse(value))
      const data = await request('/transfer/finalize_transfer', { transfer_code: parsed.transferCode, otp: parsed.otp })
      const result = response(() => normalizeTransfer(data, environment), true)
      binding(result.transferCode === parsed.transferCode, true)
      return result
    },
    async verifyTransfer(reference: string) {
      const ref = input(() => transferReferenceSchema.parse(reference))
      const data = await request(`/transfer/verify/${encodeURIComponent(ref)}`)
      const result = response(() => normalizeTransfer(data, environment), false)
      binding(result.reference === ref && result.recipientCode !== null, false)
      return result
    },
    async createRefund(value: { reference: string; transactionId: string; amountKobo: bigint; customerNote?: string; merchantNote?: string }) {
      const parsed = input(() => z.object({ reference: refundReferenceSchema, transactionId: providerIdSchema,
        customerNote: z.string().trim().min(1).max(200).optional(), merchantNote: z.string().trim().min(1).max(200).optional() }).parse(value))
      const data = await request('/refund', { reference: parsed.reference, transaction: parsed.transactionId, amount: amount(value.amountKobo), currency: 'NGN',
        ...(parsed.customerNote ? { customer_note: parsed.customerNote } : {}), ...(parsed.merchantNote ? { merchant_note: parsed.merchantNote } : {}) })
      const result = response(() => normalizeRefund(data, environment), true)
      binding(result.reference === parsed.reference && result.transactionId === parsed.transactionId && result.amountKobo === value.amountKobo.toString(), true)
      return result
    },
    async fetchRefund(id: string) {
      const parsed = input(() => providerIdSchema.parse(id))
      const data = await request(`/refund/${encodeURIComponent(parsed)}`)
      const result = response(() => normalizeRefund(data, environment), false)
      binding(result.providerId === parsed, false)
      return result
    },
    async findRefundByReference(reference: string): Promise<ProviderRefund | null> {
      const ref = input(() => refundReferenceSchema.parse(reference))
      const data = await request(`/refund?${new URLSearchParams({ reference: ref, perPage: '100', page: '1' })}`)
      const rows = response(() => z.array(z.unknown()).max(100).parse(data).map(row => normalizeRefund(row, environment)), false)
      // An exact, unique match is required; never guess from source transaction or amount.
      binding(rows.every(row => row.reference === ref) && rows.length <= 1, false)
      return rows[0] ?? null
    },
    async retryRefund(value: { refundId: string; accountNumber: string; bankId: string }) {
      const parsed = input(() => z.object({ refundId: providerIdSchema, accountNumber: accountNumberSchema, bankId: providerIdSchema }).parse(value))
      const data = await request(`/refund/retry_with_customer_details/${encodeURIComponent(parsed.refundId)}`, {
        refund_account_details: { currency: 'NGN', account_number: parsed.accountNumber, bank_id: parsed.bankId },
      })
      const result = response(() => normalizeRefund(data, environment), true)
      binding(result.providerId === parsed.refundId, true)
      return result
    },
    async listBanks(cursor?: string): Promise<{ items: ProviderBank[]; next: string | null }> {
      const next = input(() => z.string().min(1).max(512).optional().parse(cursor))
      const query = new URLSearchParams({ country: 'nigeria', currency: 'NGN', type: 'nuban', perPage: '100', use_cursor: 'true', ...(next ? { next } : {}) })
      const raw = await request(`/bank?${query}`, undefined, true)
      const result = response(() => z.object({ data: z.array(bankSchema).max(100), meta: z.object({ next: z.string().min(1).max(512).nullish() }).optional() }).parse(raw), false)
      return { items: result.data.map(bank => ({ id: bank.id, code: bank.code, name: bank.name, active: bank.active && !bank.is_deleted })), next: result.meta?.next ?? null }
    },
  }
}

export function paystackClientFromEnvironment() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() ?? ''
  return createPaystackClient({ secretKey, environment: paystackEnvironment(secretKey, process.env.PAYSTACK_ENVIRONMENT?.trim()) })
}

export type PaystackClient = ReturnType<typeof createPaystackClient>
export { collectionMetadataSchema }
