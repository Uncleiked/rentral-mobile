import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePaystackWebhook, PaystackWebhookError, readPaystackWebhook, verifyPaystackWebhook } from '@/lib/payments/providers/paystack/webhooks'

const mocks = vi.hoisted(() => ({ settle: vi.fn() }))
vi.mock('@/lib/payments/financial-receipts', () => ({ ingestProviderReceipt: mocks.settle }))
import { POST } from '@/app/api/webhooks/paystack/route'

const now = 1800000000000, timestamp = String(now / 1000)
const secret = 'whsec_fixture', oldSecret = 'whsec_old_fixture'
const collection = { id: 123, domain: 'test', reference: 'rentral-charge-1', status: 'success', amount: 450000, currency: 'NGN',
  customer: { email: 'fixture@example.test' }, metadata: { rentral_payment_id: '828db1e4-46ec-4774-9d8d-e78058b399d2', rentral_user_id: 'f889f677-c3d3-4182-bd60-64066ee1c237' } }
const transfer = { id: 25, domain: 'test', reference: 'rentral-transfer-00000001', status: 'success', amount: 450000, currency: 'NGN' }
const refund = { domain: 'test', transaction_reference: 'rentral-charge-1', refund_reference: null, status: 'pending', amount: '10000', currency: 'NGN', customer: { email: 'PRIVATE' } }
function bytes(value: unknown): Uint8Array { return new TextEncoder().encode(JSON.stringify(value)) }
function sign(raw: Uint8Array, key = secret, time = timestamp): string { return createHmac('sha512', key).update(`${time}.`).update(raw).digest('hex') }
function modern(raw: Uint8Array, key = secret, time = timestamp): Headers { return new Headers({ 'paystack-signature': `t=${time},v1=whk_fixture:${sign(raw, key, time)}` }) }
function signedRequest(raw: Uint8Array): Request {
  return new Request('http://localhost/api/webhooks/paystack', { method: 'POST', headers: modern(raw, secret, String(Math.floor(Date.now() / 1000))), body: Buffer.from(raw) })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'true')
  vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', '')
  vi.stubEnv('PAYSTACK_WEBHOOK_SECRET', secret); vi.stubEnv('PAYSTACK_WEBHOOK_PREVIOUS_SECRET', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('Paystack original-byte authentication', () => {
  it('authenticates bytes before JSON parsing and rejects modified whitespace/UTF8', () => {
    const raw = bytes({ event: 'test', note: '£naira' })
    const headers = modern(raw)
    expect(verifyPaystackWebhook(raw, headers, { signingSecrets: [secret], now })).toBe(true)
    expect(verifyPaystackWebhook(new Uint8Array([...raw, 32]), headers, { signingSecrets: [secret], now })).toBe(false)
    expect(verifyPaystackWebhook(bytes({ note: '£naira', event: 'test' }), headers, { signingSecrets: [secret], now })).toBe(false)
  })
  it('supports overlapping signing-secret rotation and multiple v1 signatures', () => {
    const raw = bytes({ event: 'fixture' })
    const headers = new Headers({ 'paystack-signature': `t=${timestamp},v1=whk_old:${sign(raw, oldSecret)},v1=whk_new:${sign(raw)}` })
    expect(verifyPaystackWebhook(raw, headers, { signingSecrets: [secret], now })).toBe(true)
    expect(verifyPaystackWebhook(raw, modern(raw, oldSecret), { signingSecrets: [secret, oldSecret], now })).toBe(true)
    expect(verifyPaystackWebhook(raw, modern(raw, oldSecret), { signingSecrets: [secret], now })).toBe(false)
  })
  it.each([301, -301, 9000])('rejects past/future signature timestamp skew%ssec', seconds => {
    const raw = bytes({ event: 'fixture' })
    const time = String(now / 1000 + seconds)
    expect(verifyPaystackWebhook(raw, modern(raw, secret, time), { signingSecrets: [secret], now })).toBe(false)
  })
  it.each(['t=1800000000,t=1800000000,v1=whk_test:bad', 't=not-a-number,v1=whk_test:bad', `t=${timestamp},v1=missingkeyid`, `t=${timestamp},v1=:${'0'.repeat(128)}`])('rejects malformed modern header%s', header => {
    expect(verifyPaystackWebhook(bytes({}), new Headers({ 'paystack-signature': header }), { signingSecrets: [secret], now })).toBe(false)
  })
  it('never accepts legacy downgrade when modern or previous signing secret is configured', () => {
    const raw = bytes({ event: 'fixture' })
    const headers = new Headers({ 'x-paystack-signature': createHmac('sha512', 'sk_test_fixture').update(raw).digest('hex') })
    expect(verifyPaystackWebhook(raw, headers, { legacySecret: 'sk_test_fixture', now })).toBe(true)
    expect(verifyPaystackWebhook(raw, headers, { signingSecrets: [secret], legacySecret: 'sk_test_fixture', now })).toBe(false)
  })
  it('does not treat restricted API keys as legacy webhook signing secrets', () => {
    const raw = bytes({ event: 'fixture' }), key = 'rk_test_fixture'
    expect(verifyPaystackWebhook(raw, new Headers({ 'x-paystack-signature': createHmac('sha512', key).update(raw).digest('hex') }), { legacySecret: key, now })).toBe(false)
  })
  it('cancels a streamed chunk overflow even with no content-length header', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)) }, cancel })
    const request = new Request('http://localhost/webhook', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    await expect(readPaystackWebhook(request)).rejects.toMatchObject({ status: 413 })
    expect(cancel).toHaveBeenCalled()
  })
  it('rejects advertised oversize before reading and preserves safe raw-byte reads', async () => {
    await expect(readPaystackWebhook(new Request('http://localhost/webhook', { method: 'POST', body: '{}', headers: { 'content-length': '262145' } }))).rejects.toMatchObject({ status: 413 })
    expect(await readPaystackWebhook(new Request('http://localhost/webhook', { method: 'POST', body: '{ "number":1.50 }' }))).toEqual(new TextEncoder().encode('{ "number":1.50 }'))
  })
})

describe('canonical normalized event hints', () => {
  it('deduplicates semantic events across JSON formatting/order, retry signatures and private extra fields', () => {
    const first = normalizePaystackWebhook(bytes({ event: 'transfer.success', data: transfer }), 'test')!
    const second = normalizePaystackWebhook(new TextEncoder().encode(JSON.stringify({ data: { customer: { email: 'PRIVATE' }, currency: 'NGN', amount: '450000', status: 'success', reference: transfer.reference, domain: 'test', id: '25' }, event: 'transfer.success' }, null, 2)), 'test')!
    expect(second.hint.eventKey).toBe(first.hint.eventKey)
    expect(second.hint.payloadHash).toBe(first.hint.payloadHash)
    expect(JSON.stringify(second.hint)).not.toContain('PRIVATE')
    expect(second.hint.requiresReconciliation).toBe(true)
  })
  it('keeps reversal distinct from success even when it arrives first and IDs overlap between entities', () => {
    const success = normalizePaystackWebhook(bytes({ event: 'transfer.success', data: transfer }), 'test')!
    const reversal = normalizePaystackWebhook(bytes({ event: 'transfer.reversed', data: { ...transfer, status: 'reversed' } }), 'test')!
    expect(reversal.hint.eventKey).not.toBe(success.hint.eventKey)
    expect(reversal.hint.status).toBe('reversed')
  })
  it('keeps identity stable but fingerprints materially changed amounts for collision review', () => {
    const first = normalizePaystackWebhook(bytes({ event: 'transfer.success', data: transfer }), 'test')!
    const changed = normalizePaystackWebhook(bytes({ event: 'transfer.success', data: { ...transfer, amount: 1 } }), 'test')!
    expect(changed.hint.eventKey).toBe(first.hint.eventKey)
    expect(changed.hint.payloadHash).not.toBe(first.hint.payloadHash)
  })
  it('does not guess which partial refund an authenticated unbound webhook represents', () => {
    const event = normalizePaystackWebhook(bytes({ event: 'refund.pending', data: refund }), 'test')!
    expect(event.hint).toMatchObject({ entity: 'refund', reference: null, providerId: null, transactionReference: 'rentral-charge-1', amountKobo: '10000', hasStrongIdentity: false, requiresReconciliation: true })
    expect(JSON.stringify(event.hint)).not.toContain('PRIVATE')
  })
  it('separates two partial refunds of identical amounts when the provider supplies their references', () => {
    const first = normalizePaystackWebhook(bytes({ event: 'refund.pending', data: { ...refund, refund_reference: 'refund-operation-one' } }), 'test')!
    const second = normalizePaystackWebhook(bytes({ event: 'refund.pending', data: { ...refund, refund_reference: 'refund-operation-two' } }), 'test')!
    expect(first.hint.hasStrongIdentity).toBe(true)
    expect(second.hint.eventKey).not.toBe(first.hint.eventKey)
  })
  it.each(['pending', 'processing', 'needs-attention', 'failed', 'processed'])('normalizes refund.%s without inventing an operation ID', status => {
    expect(normalizePaystackWebhook(bytes({ event: `refund.${status}`, data: { ...refund, status } }), 'test')?.hint.status).toBe(status)
  })
  it.each(['collection', 'transfer', 'refund'])('denies wrong environment for %s event', entity => {
    const value = entity === 'collection' ? { event: 'charge.success', data: collection } : entity === 'transfer' ? { event: 'transfer.success', data: transfer } : { event: 'refund.pending', data: refund }
    expect(() => normalizePaystackWebhook(bytes(value), 'live')).toThrow(PaystackWebhookError)
  })
  it('rejects event/data status disagreement and ambiguous refund references', () => {
    expect(() => normalizePaystackWebhook(bytes({ event: 'transfer.success', data: { ...transfer, status: 'failed' } }), 'test')).toThrow(PaystackWebhookError)
    expect(() => normalizePaystackWebhook(bytes({ event: 'refund.pending', data: { ...refund, reference: 'refund-one', refund_reference: 'refund-two' } }), 'test')).toThrow(PaystackWebhookError)
  })
  it('ignores authenticated unsupported event names', () => {
    expect(normalizePaystackWebhook(bytes({ event: 'subscription.create', data: null }), 'test')).toBeNull()
  })
})

describe('webhook route ordering and compatibility', () => {
  it('checks HMAC before attempting malformed JSON and never reaches collection settlement', async () => {
    const res = await POST(new Request('http://localhost/webhook', { method: 'POST', body: 'not-json' }))
    expect(res.status).toBe(401)
    expect(mocks.settle).not.toHaveBeenCalled()
  })
  it('returns400 for authenticated malformed JSON without exposing content', async () => {
    const res = await POST(signedRequest(new TextEncoder().encode('PRIVATE-not-json')))
    expect(res.status).toBe(400)
    expect(await res.text()).not.toContain('PRIVATE')
    expect(mocks.settle).not.toHaveBeenCalled()
  })
  it('persists only canonical authenticated hints for provider reconciliation', async () => {
    const res = await POST(signedRequest(bytes({ event: 'charge.success', data: collection })))
    expect(res.status).toBe(200)
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ providerId: '123', environment: 'test', amountKobo: '450000', requiresReconciliation: true, payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/) }))
  })
  it('rejects signed cross-mode data before domain mutation', async () => {
    const res = await POST(signedRequest(bytes({ event: 'charge.success', data: { ...collection, domain: 'live' } })))
    expect(res.status).toBe(400)
    expect(mocks.settle).not.toHaveBeenCalled()
  })
  it('acknowledges unsupported authenticated events without invoking collection settlement', async () => {
    expect((await POST(signedRequest(bytes({ event: 'subscription.create', data: null })))).status).toBe(200)
    expect(mocks.settle).not.toHaveBeenCalled()
  })
  it('returns retryable500 without exposing raw failures if collection handling fails', async () => {
    mocks.settle.mockRejectedValue(new Error('PRIVATE'))
    const res = await POST(signedRequest(bytes({ event: 'charge.success', data: collection })))
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('PRIVATE')
  })
})
