import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPaystackClient, PaystackError, paystackEnvironment, type PaystackTransport } from '@/lib/payments/providers/paystack/client'
import { refundBindingMatches, refundOperationStatus, transferBindingMatches, transferOperationStatus } from '@/lib/payments/providers/contracts'
import { parseProviderJson } from '@/lib/payments/providers/paystack/schemas'

const paymentId = '828db1e4-46ec-4774-9d8d-e78058b399d2', userId = 'f889f677-c3d3-4182-bd60-64066ee1c237'
const reference = 'rentral-transfer-00000001'
const collection = { id: 123, domain: 'test', reference: 'rentral-charge-1', amount: 450000, currency: 'NGN', status: 'success',
  customer: { email: 'fixture@example.test', phone: 'PRIVATE' }, metadata: { rentral_payment_id: paymentId, rentral_user_id: userId }, authorization: { card: 'PRIVATE' } }
const recipient = { id: 4, domain: 'test', recipient_code: 'RCP_fixture', active: true, is_deleted: false, currency: 'NGN', type: 'nuban',
  details: { account_number: '0123456789', account_name: 'Resolved Fixture', bank_code: '058' } }
const transfer = { id: 25, domain: 'test', reference, transfer_code: 'TRF_fixture', amount: 450000, currency: 'NGN', status: 'pending', recipient: { recipient_code: 'RCP_fixture' } }
const refund = { id: 77, domain: 'test', reference: 'rentral-refund-1', transaction: { id: 123, reference: 'rentral-charge-1' }, amount: 10000, currency: 'NGN', status: 'pending' }

function fixture(...responses: (Response | (() => Response | Promise<Response>))[]) {
  const fetcher = vi.fn<PaystackTransport>()
  for (const item of responses) fetcher.mockImplementationOnce(async () => typeof item === 'function' ? item() : item)
  return { fetcher, client: createPaystackClient({ secretKey: 'sk_test_fixture_private', environment: 'test', fetch: fetcher }) }
}
function ok(data: unknown): Response { return Response.json({ status: true, data }) }
function sent(fetcher: ReturnType<typeof fixture>['fetcher'], index = 0): Record<string, unknown> {
  return JSON.parse(fetcher.mock.calls[index][1]?.body as string)
}
afterEach(() => vi.unstubAllGlobals())

describe('Paystack exact collection and transport contracts', () => {
  it('initializes only a bound Paystack HTTPS checkout using server-only authorization and no redirect forwarding', async () => {
    const { client, fetcher } = fixture(ok({ reference: collection.reference, authorization_url: 'https://checkout.paystack.com/fixture' }))
    expect(await client.initializeCollection({ paymentId, userId, email: 'fixture@example.test', reference: collection.reference, amountKobo: BigInt(450000), callbackUrl: 'http://localhost:3000/return' }))
      .toEqual({ reference: collection.reference, checkoutUrl: 'https://checkout.paystack.com/fixture' })
    expect(fetcher).toHaveBeenCalledWith('https://api.paystack.co/transaction/initialize', expect.objectContaining({ method: 'POST', redirect: 'error', cache: 'no-store' }))
    expect(sent(fetcher)).toMatchObject({ amount: 450000, currency: 'NGN', reference: collection.reference })
    expect(JSON.parse(sent(fetcher).metadata as string)).toEqual({ rentral_payment_id: paymentId, rentral_user_id: userId })
  })
  it('reads unsigned64 IDs losslessly, strips private provider fields and preserves terminal states', async () => {
    const raw = JSON.stringify({ status: true, data: collection }).replace('"id":123', '"id":18446744073709551615')
    const { client } = fixture(new Response(raw))
    const value = await client.verifyCollection(collection.reference)
    expect(value).toMatchObject({ providerId: '18446744073709551615', amountKobo: '450000', status: 'success', environment: 'test', metadata: { paymentId, userId } })
    expect(JSON.stringify(value)).not.toContain('PRIVATE')
  })
  it.each(['abandoned', 'failed', 'ongoing', 'pending', 'processing', 'queued', 'reversed', 'success'])('preserves collection status %s without declaring pending money collected', async status => {
    const { client } = fixture(ok({ ...collection, status }))
    expect((await client.verifyCollection(collection.reference)).status).toBe(status)
  })
  it.each([{ domain: 'live' }, { currency: 'USD' }, { status: 'invented-success' }, { amount: 450000.5 }, { reference: 'other-reference' }])('denies wrong collection bindings %j', async change => {
    const { client } = fixture(ok({ ...collection, ...change }))
    await expect(client.verifyCollection(collection.reference)).rejects.toBeInstanceOf(PaystackError)
  })
  it.each(['https://checkout.paystack.com.evil.test/path', 'http://checkout.paystack.com/path', 'https://user:password@checkout.paystack.com/path',
    'https://checkout.paystack.com:8443/path', 'https://checkout.paystack.com/path#secret'])('rejects untrusted checkout URL%s', async url => {
    const { client } = fixture(ok({ reference: collection.reference, authorization_url: url }))
    await expect(client.initializeCollection({ paymentId, userId, email: 'fixture@example.test', reference: collection.reference, amountKobo: BigInt(1), callbackUrl: 'https://app.example.test/return' }))
      .rejects.toMatchObject({ code: 'BINDING_MISMATCH', uncertain: true })
  })
  it.each([BigInt(0), BigInt(-1), BigInt('9007199254740992')])('rejects unsupported exact amounts before network %s', async amountKobo => {
    const { client, fetcher } = fixture()
    await expect(client.initiateTransfer({ reference, amountKobo, recipientCode: 'RCP_fixture' })).rejects.toMatchObject({ code: 'INVALID_INPUT', uncertain: false })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects unsafe/exponent JSON provider integers rather than silently rounding them', () => {
    expect(() => parseProviderJson('{"id":1e20}')).toThrow()
  })
  it('does not infer restricted-key environments and denies public keys or conflicting test/live configuration', () => {
    expect(paystackEnvironment('sk_test_fixture')).toBe('test')
    expect(paystackEnvironment('sk_live_fixture', 'live')).toBe('live')
    expect(paystackEnvironment('rk_fixture', 'test')).toBe('test')
    expect(() => paystackEnvironment('rk_fixture')).toThrow(PaystackError)
    expect(() => paystackEnvironment('pk_test_fixture', 'test')).toThrow(PaystackError)
    expect(() => paystackEnvironment('sk_live_fixture', 'test')).toThrow(PaystackError)
  })
  it.each([409, 429, 500, 503])('never replays uncertain POST status%s or exposes provider secrets', async status => {
    const { client, fetcher } = fixture(new Response('PRIVATE sk_test_fixture_private 0123456789', { status }))
    const error = await client.initiateTransfer({ reference, amountKobo: BigInt(450000), recipientCode: 'RCP_fixture' }).catch(error => error)
    expect(error).toMatchObject({ uncertain: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(error)).not.toMatch(/PRIVATE|sk_test_fixture_private|0123456789/)
  })
  it('classifies rejection without accepting a provider message or replaying', async () => {
    const { client, fetcher } = fixture(new Response('PRIVATE', { status: 400 }))
    await expect(client.initiateTransfer({ reference, amountKobo: BigInt(450000), recipientCode: 'RCP_fixture' })).rejects.toMatchObject({ code: 'REJECTED', uncertain: false })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('marks a network timeout as uncertain and sends exactly one request', async () => {
    const fetcher = vi.fn<PaystackTransport>().mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('PRIVATE')), { once: true })
    }))
    const client = createPaystackClient({ secretKey: 'sk_test_fixture', environment: 'test', fetch: fetcher, timeoutMs: 5 })
    await expect(client.initiateTransfer({ reference, amountKobo: BigInt(450000), recipientCode: 'RCP_fixture' })).rejects.toMatchObject({ code: 'TIMEOUT', uncertain: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed acknowledged POST and bounds streamed response bytes', async () => {
    const { client, fetcher } = fixture(new Response('{"status":true,"data":'), new Response('x'.repeat(1024 * 1024 + 1)))
    await expect(client.initiateTransfer({ reference, amountKobo: BigInt(450000), recipientCode: 'RCP_fixture' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', uncertain: true })
    await expect(client.verifyCollection(collection.reference)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', uncertain: false })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('recipient and transfer contracts', () => {
  it('uses provider-resolved name, account and bank before recipient creation; nullable name is never invented', async () => {
    const { client, fetcher } = fixture(ok({ account_number: '0123456789', account_name: 'Resolved Fixture' }), ok({ ...recipient, details: { ...recipient.details, account_name: null } }))
    expect(await client.createRecipient({ accountNumber: '0123456789', bankCode: '058' })).toMatchObject({ accountName: 'Resolved Fixture', recipientCode: 'RCP_fixture', active: true })
    expect(fetcher.mock.calls[0][0]).toBe('https://api.paystack.co/bank/resolve?account_number=0123456789&bank_code=058')
    expect(sent(fetcher, 1)).toEqual({ type: 'nuban', currency: 'NGN', name: 'Resolved Fixture', account_number: '0123456789', bank_code: '058' })
  })
  it('denies a resolver returning another account before any recipient mutation', async () => {
    const { client, fetcher } = fixture(ok({ account_number: '9999999999', account_name: 'Other Fixture' }))
    await expect(client.createRecipient({ accountNumber: '0123456789', bankCode: '058' })).rejects.toMatchObject({ code: 'BINDING_MISMATCH' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('fetches a recipient with no account name without claiming identity verification', async () => {
    const { client } = fixture(ok({ ...recipient, details: { ...recipient.details, account_name: null } }))
    expect(await client.fetchRecipient('RCP_fixture')).toMatchObject({ accountName: null, accountNumber: '0123456789' })
  })
  it('uses documented bank cursor pagination and marks deleted banks unavailable', async () => {
    const { client, fetcher } = fixture(Response.json({ status: true, data: [{ id: 9, code: '058', name: 'Owned Fixture Bank', active: true, is_deleted: true, currency: 'NGN' }], meta: { next: 'next-cursor' } }))
    expect(await client.listBanks('first-cursor')).toEqual({ items: [{ id: '9', code: '058', name: 'Owned Fixture Bank', active: false }], next: 'next-cursor' })
    expect(String(fetcher.mock.calls[0][0])).toContain('use_cursor=true&next=first-cursor')
  })
  it.each([{ domain: 'live' }, { recipient_code: 'RCP_other' }, { currency: 'USD' }])('denies wrong recipient bindings %j', async change => {
    const { client } = fixture(ok({ ...recipient, ...change }))
    await expect(client.fetchRecipient('RCP_fixture')).rejects.toBeInstanceOf(PaystackError)
  })
  it('keeps numeric recipient initiation unverified and OTP action-required until reference-based verification', async () => {
    const { client, fetcher } = fixture(ok({ ...transfer, recipient: 4, status: 'otp' }), ok({ ...transfer, status: 'success' }))
    const pending = await client.initiateTransfer({ reference, amountKobo: BigInt(450000), recipientCode: 'RCP_fixture' })
    expect(pending.recipientCode).toBeNull()
    expect(transferOperationStatus(pending.status)).toBe('requires_action')
    expect(transferBindingMatches(pending, { environment: 'test', reference, amountKobo: BigInt(450000), recipientCode: 'RCP_fixture' })).toBe(false)
    const verified = await client.verifyTransfer(reference)
    expect(transferBindingMatches(verified, { environment: 'test', reference, amountKobo: BigInt(450000), recipientCode: 'RCP_fixture' })).toBe(true)
    expect(fetcher.mock.calls[1][0]).toBe(`https://api.paystack.co/transfer/verify/${reference}`)
  })
  it.each(['pending', 'otp', 'received', 'success', 'failed', 'reversed', 'blocked', 'rejected', 'abandoned'])('preserves transfer status%s', async status => {
    const { client } = fixture(ok({ ...transfer, status }))
    const result = await client.verifyTransfer(reference)
    expect(result.status).toBe(status)
    expect(transferOperationStatus(result.status) === 'succeeded').toBe(status === 'success')
  })
  it.each([{ domain: 'live' }, { reference: 'different-reference-000001' }, { recipient: 4 }, { currency: 'USD' }])('denies wrong transfer verification %j', async change => {
    const { client } = fixture(ok({ ...transfer, ...change }))
    await expect(client.verifyTransfer(reference)).rejects.toBeInstanceOf(PaystackError)
  })
  it('finalizes OTP without retaining it or declaring the result settled', async () => {
    const { client, fetcher } = fixture(ok(transfer))
    expect((await client.finalizeTransfer({ transferCode: 'TRF_fixture', otp: '123456' })).status).toBe('pending')
    expect(sent(fetcher)).toEqual({ transfer_code: 'TRF_fixture', otp: '123456' })
  })
})

describe('refund contracts and deterministic recovery', () => {
  it('creates an explicit partial refund with deterministic lowercase reference and transaction ID', async () => {
    const { client, fetcher } = fixture(ok(refund))
    const value = await client.createRefund({ reference: 'RENTRAL-REFUND-1', transactionId: '123', amountKobo: BigInt(10000) })
    expect(sent(fetcher)).toEqual({ reference: 'rentral-refund-1', transaction: '123', amount: 10000, currency: 'NGN' })
    expect(refundBindingMatches(value, { environment: 'test', reference: 'RENTRAL-REFUND-1', transactionId: '123', amountKobo: BigInt(10000) })).toBe(true)
  })
  it('requires unique exact refund-reference recovery; an empty result is not permission to resubmit', async () => {
    const { client } = fixture(ok([refund]), ok([]), ok([refund, refund]))
    expect((await client.findRefundByReference(refund.reference))?.providerId).toBe('77')
    expect(await client.findRefundByReference(refund.reference)).toBeNull()
    await expect(client.findRefundByReference(refund.reference)).rejects.toMatchObject({ code: 'BINDING_MISMATCH' })
  })
  it('supports documented bank-ID retry endpoint and missing legacy retry reference without falsely binding it', async () => {
    const { client, fetcher } = fixture(ok({ ...refund, reference: undefined, transaction: 123, status: 'processing' }))
    const value = await client.retryRefund({ refundId: '77', bankId: '9', accountNumber: '0123456789' })
    expect(fetcher.mock.calls[0][0]).toBe('https://api.paystack.co/refund/retry_with_customer_details/77')
    expect(sent(fetcher)).toEqual({ refund_account_details: { currency: 'NGN', account_number: '0123456789', bank_id: '9' } })
    expect(value).toMatchObject({ reference: null, transactionId: '123', status: 'processing' })
    expect(refundBindingMatches(value, { environment: 'test', reference: refund.reference, transactionId: '123', amountKobo: BigInt(10000) })).toBe(false)
  })
  it.each(['pending', 'processing', 'needs-attention', 'failed', 'processed'])('preserves refund status%s and settles only processed', async status => {
    const { client } = fixture(ok({ ...refund, status }))
    const result = await client.fetchRefund('77')
    expect(result.status).toBe(status)
    expect(refundOperationStatus(result.status) === 'succeeded').toBe(status === 'processed')
  })
  it.each([{ domain: 'live' }, { transaction: 124 }, { reference: 'other-refund' }, { amount: 10001 }])('denies refund initiation response mismatch %j', async change => {
    const { client } = fixture(ok({ ...refund, ...change }))
    await expect(client.createRefund({ reference: refund.reference, transactionId: '123', amountKobo: BigInt(10000) })).rejects.toMatchObject({ uncertain: true })
  })
})
