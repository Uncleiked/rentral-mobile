import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(), findIntent: vi.fn(), updateIntent: vi.fn(), createEvent: vi.fn(), findEvent: vi.fn(),
  findBooking: vi.fn(), updateBooking: vi.fn(), createLedger: vi.fn(), notify: vi.fn(), findListing: vi.fn(), findUser: vi.fn(),
  transaction: vi.fn(), requireUser: vi.fn(), hold: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction, paymentIntent: { findFirst: vi.fn() } } }))
vi.mock('@/lib/action-helpers', () => ({ requireVerifiedUserId: mocks.requireUser }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/bookings/service', () => ({ expireListingReservations: vi.fn(), paidBookingExpiry: () => null, otherConfirmedHold: mocks.hold }))

import { verifyPaystackSignature, verifiedPaymentSchema, initializePaystack } from '@/lib/payments/paystack'
import { paymentBindingMatches, recordVerifiedPayment, startBookingPayment } from '@/lib/payments/service'
import { requestBookingAction } from '@/app/actions/bookingActions'
import { POST } from '@/app/api/webhooks/paystack/route'

const paymentId = '828db1e4-46ec-4774-9d8d-e78058b399d2', userId = 'f889f677-c3d3-4182-bd60-64066ee1c237'
const intentBase = { id: paymentId, user_id: userId, reference: 'rentral-test', amount_kobo: BigInt(300000), currency: 'NGN',
  customer_email: 'person@example.test', booking_id: 'booking-1', listing_id: null, status: 'pending' }
const verifiedBase = { id: '991', reference: 'rentral-test', amount: 300000, currency: 'NGN', status: 'success',
  customer: { email: 'person@example.test' }, metadata: { rentral_payment_id: paymentId, rentral_user_id: userId } }

beforeEach(() => { vi.resetAllMocks(); mocks.hold.mockResolvedValue(null); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_example'); vi.stubEnv('PAYSTACK_WEBHOOK_SECRET', '') })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Paystack origin and binding', () => {
  it('verifies raw legacy HMAC and rejects modified payload or bad signatures', () => {
    const raw = '{"event":"charge.success"}'
    const signature = createHmac('sha512', 'sk_test_example').update(raw).digest('hex')
    expect(verifyPaystackSignature(raw, new Headers({ 'x-paystack-signature': signature }))).toBe(true)
    expect(verifyPaystackSignature(`${raw} `, new Headers({ 'x-paystack-signature': signature }))).toBe(false)
    expect(verifyPaystackSignature(raw, new Headers({ 'x-paystack-signature': 'xyz' }))).toBe(false)
  })
  it('enforces modern signature freshness and prevents legacy downgrade', () => {
    vi.stubEnv('PAYSTACK_WEBHOOK_SECRET', 'whsec_example')
    const raw = '{}', timestamp = '1800000000'
    const signature = createHmac('sha512', 'whsec_example').update(`${timestamp}.${raw}`).digest('hex')
    const headers = new Headers({ 'paystack-signature': `t=${timestamp},v1=whk_example:${signature}` })
    expect(verifyPaystackSignature(raw, headers, 1800000000000)).toBe(true)
    expect(verifyPaystackSignature(raw, headers, 1800000400000)).toBe(false)
    expect(verifyPaystackSignature(raw, new Headers({ 'x-paystack-signature': createHmac('sha512', 'sk_test_example').update(raw).digest('hex') }), 1800000000000)).toBe(false)
  })
  it('binds exact amount, currency, user metadata, customer and reference', () => {
    expect(paymentBindingMatches(intentBase, verifiedBase)).toBe(true)
    expect(paymentBindingMatches(intentBase, { ...verifiedBase, amount: 1 })).toBe(false)
    expect(paymentBindingMatches(intentBase, { ...verifiedBase, currency: 'USD' })).toBe(false)
    expect(paymentBindingMatches(intentBase, { ...verifiedBase, reference: 'another' })).toBe(false)
    expect(paymentBindingMatches(intentBase, { ...verifiedBase, metadata: { ...verifiedBase.metadata, rentral_user_id: 'other' } })).toBe(false)
    expect(paymentBindingMatches(intentBase, { ...verifiedBase, customer: { email: 'other@example.test' } })).toBe(false)
    expect(verifiedPaymentSchema.safeParse({ ...verifiedBase, amount: 1.5 }).success).toBe(false)
  })
  it('accepts checkout URLs only on the actual Paystack host', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, data: { reference: 'ref', authorization_url: 'https://checkout.paystack.com.evil.test/x' } }) }))
    await expect(initializePaystack({ id: paymentId, userId, email: 'person@example.test', reference: 'ref', amountKobo: BigInt(1000), callbackUrl: 'https://rentral.example/' })).rejects.toThrow('Invalid checkout')
  })
})

function prepareSettlement(status = 'awaiting_payment', expires = new Date(Date.now() + 600000)): void {
  const intent = { ...intentBase }
  const booking = { id: 'booking-1', listing_id: 'listing-1', seeker_id: userId, lister_id: 'host-1', kind: 'inspection', status, expires_at: expires, amount_kobo: intent.amount_kobo, hold_credit_kobo: BigInt(0) }
  mocks.findIntent.mockImplementation(async () => ({ ...intent }))
  mocks.updateIntent.mockImplementation(async ({ data }: { data: { status: string } }) => { intent.status = data.status; return intent })
  mocks.findBooking.mockResolvedValue(booking)
  mocks.findListing.mockResolvedValue({ id: 'listing-1' })
  mocks.findUser.mockResolvedValue({ id: userId })
  mocks.findEvent.mockResolvedValue(null)
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    $queryRaw: mocks.query, paymentIntent: { findUnique: mocks.findIntent, findUniqueOrThrow: mocks.findIntent, update: mocks.updateIntent },
    paymentEvent: { findUnique: mocks.findEvent, create: mocks.createEvent }, booking: { findUnique: mocks.findBooking, findUniqueOrThrow: mocks.findBooking, update: mocks.updateBooking },
    listing: { findFirst: mocks.findListing }, user: { findFirst: mocks.findUser }, ledgerTransaction: { create: mocks.createLedger }, notification: { create: mocks.notify },
  }))
}

describe('transactional collection settlement', () => {
  it('serializes duplicate provider receipts and inserts one balanced ledger transaction', async () => {
    prepareSettlement()
    await recordVerifiedPayment(verifiedBase, 'hash')
    await recordVerifiedPayment(verifiedBase, 'hash')
    expect(mocks.createEvent).toHaveBeenCalledTimes(1)
    expect(mocks.createLedger).toHaveBeenCalledTimes(1)
    expect(mocks.createLedger).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entries: { create: [
      expect.objectContaining({ direction: 'debit', amount_kobo: BigInt(300000) }), expect.objectContaining({ direction: 'credit', amount_kobo: BigInt(300000) }),
    ] } }) }))
    expect(mocks.updateBooking).toHaveBeenCalledTimes(1)
    expect(mocks.updateBooking).toHaveBeenCalledWith({ where: { id: 'booking-1' }, data: { status: 'confirmed', expires_at: null } })
    const firstLock = mocks.query.mock.calls[0][0].join('')
    expect(firstLock).toContain('Listing')
  })
  it('records late money for reconciliation without reviving an expired reservation', async () => {
    prepareSettlement('expired', new Date(Date.now() - 10000))
    await recordVerifiedPayment(verifiedBase, 'hash')
    expect(mocks.updateIntent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'requires_review' }) }))
    expect(mocks.createLedger).toHaveBeenCalledTimes(1)
    expect(mocks.updateBooking).not.toHaveBeenCalled()
  })
  it('does not grant confirmation to a revoked identity', async () => {
    prepareSettlement(); mocks.findUser.mockResolvedValue(null)
    await recordVerifiedPayment(verifiedBase, 'hash')
    expect(mocks.updateBooking).not.toHaveBeenCalled()
    expect(mocks.updateIntent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'requires_review' }) }))
  })
  it('records conflicting late money for review instead of breaching another renter’s global hold', async () => {
    prepareSettlement(); mocks.hold.mockResolvedValue({ id: 'other-hold', expires_at: new Date(Date.now() + 86400000) })
    await recordVerifiedPayment(verifiedBase, 'hash')
    expect(mocks.updateBooking).not.toHaveBeenCalled()
    expect(mocks.updateIntent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'requires_review' }) }))
  })
  it('rejects mismatched amounts before bookkeeping', async () => {
    prepareSettlement()
    await expect(recordVerifiedPayment({ ...verifiedBase, amount: 1 }, 'hash')).rejects.toThrow('mismatch')
    expect(mocks.createEvent).not.toHaveBeenCalled(); expect(mocks.createLedger).not.toHaveBeenCalled()
  })
  it('disables new payment and webhook work before database or identity access', async () => {
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
    await expect(startBookingPayment(userId, 'booking-1')).rejects.toThrow('not available')
    expect(mocks.transaction).not.toHaveBeenCalled()
    const response = await POST(new Request('https://rentral.example/api/webhooks/paystack', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(503)
    expect(await requestBookingAction({})).toMatchObject({ success: false })
    expect(mocks.requireUser).not.toHaveBeenCalled()
  })
})
