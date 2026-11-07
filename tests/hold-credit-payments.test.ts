import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), initialize: vi.fn(), findIntent: vi.fn(), createIntent: vi.fn(), updateIntent: vi.fn(), claim: vi.fn(), findAllocation: vi.fn(), findBooking: vi.fn(), updateBooking: vi.fn(), updateBookings: vi.fn(), ledger: vi.fn(), event: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction, paymentIntent: { updateMany: mocks.claim } } }))
vi.mock('@/lib/bookings/service', () => ({ expireListingReservations: vi.fn(), otherConfirmedHold: vi.fn(async () => null), paidBookingExpiry: () => null }))
vi.mock('@/lib/payments/paystack', () => ({ initializePaystack: mocks.initialize, verifyPaystack: vi.fn() }))
import { startBookingPayment, recordVerifiedPayment } from '@/lib/payments/service'

const userId = 'f889f677-c3d3-4182-bd60-64066ee1c237', paymentId = '828db1e4-46ec-4774-9d8d-e78058b399d2'
const booking = { id: 'rental', listing_id: 'listing', seeker_id: userId, lister_id: 'host', kind: 'rental', status: 'awaiting_payment',
  currency: 'NGN', amount_kobo: BigInt(10000000), hold_credit_kobo: BigInt(2000000), settlement_status: 'unsettled', expires_at: new Date(Date.now() + 600000) }
const source = { ...booking, id: 'hold', kind: 'hold', status: 'converted', amount_kobo: BigInt(2000000), payments: [{ user_id: userId, amount_kobo: BigInt(2000000), currency: 'NGN', status: 'succeeded', paid_at: new Date() }] }
const intent = { id: paymentId, booking_id: booking.id, listing_id: null, user_id: userId, kind: 'booking', provider: 'paystack', reference: 'synthetic-credit-balance',
  amount_kobo: BigInt(8000000), currency: 'NGN', customer_email: 'renter@example.test', status: 'pending' }
const verified = { id: 'synthetic-1', reference: intent.reference, amount: 8000000, currency: 'NGN', status: 'success', customer: { email: intent.customer_email },
  metadata: { rentral_payment_id: paymentId, rentral_user_id: userId } }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_synthetic')
  mocks.claim.mockResolvedValue({ count: 1 }); mocks.initialize.mockResolvedValue('https://checkout.paystack.com/synthetic')
  mocks.findBooking.mockResolvedValue({ ...booking })
  mocks.findIntent.mockResolvedValue(null)
  mocks.createIntent.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...intent, ...data, id: paymentId, status: 'created' }))
  mocks.findAllocation.mockResolvedValue({ hold_booking_id: 'hold', rental_booking_id: 'rental', amount_kobo: BigInt(2000000), hold_booking: { ...source } })
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    $queryRaw: mocks.query, booking: { findFirst: mocks.findBooking, findUnique: mocks.findBooking, findUniqueOrThrow: mocks.findBooking, update: mocks.updateBooking, updateMany: mocks.updateBookings },
    paymentIntent: { findUnique: mocks.findIntent, findUniqueOrThrow: mocks.findIntent, create: mocks.createIntent, update: mocks.updateIntent },
    holdCreditAllocation: { findUnique: mocks.findAllocation }, user: { findUniqueOrThrow: vi.fn(async () => ({ email: intent.customer_email, kyc_verified: true })), findFirst: vi.fn(async () => ({ id: userId })) },
    listing: { findFirst: vi.fn(async () => ({ id: 'listing' })) }, paymentEvent: { findUnique: vi.fn(async () => null), create: mocks.event }, ledgerTransaction: { create: mocks.ledger }, notification: { create: mocks.notify },
  }))
})
afterEach(() => vi.unstubAllEnvs())

describe('holding credit collection boundary', () => {
  it('creates and sends a provider intent for the exact remaining balance', async () => {
    await startBookingPayment(userId, booking.id)
    expect(mocks.createIntent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount_kobo: BigInt(8000000) }) }))
    expect(mocks.initialize).toHaveBeenCalledWith(expect.objectContaining({ amountKobo: BigInt(8000000) }))
  })
  it('blocks another collection when source credit is under review', async () => {
    mocks.findAllocation.mockResolvedValue({ amount_kobo: BigInt(2000000), hold_booking: { ...source, settlement_status: 'requires_review' } })
    await expect(startBookingPayment(userId, booking.id)).rejects.toThrow('reconciliation')
    expect(mocks.initialize).not.toHaveBeenCalled(); expect(mocks.createIntent).not.toHaveBeenCalled()
  })
  it('reconciles the remaining provider collection and confirms the rental once', async () => {
    mocks.findIntent.mockResolvedValue({ ...intent })
    await recordVerifiedPayment(verified, 'synthetic-hash')
    expect(mocks.updateBooking).toHaveBeenCalledWith({ where: { id: booking.id }, data: { status: 'confirmed', expires_at: null } })
    expect(mocks.ledger).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entries: { create: [expect.objectContaining({ direction: 'debit', amount_kobo: BigInt(8000000) }), expect.objectContaining({ direction: 'credit', amount_kobo: BigInt(8000000) })] } }) }))
  })
  it('keeps late balance money and the allocated source under review without reviving availability', async () => {
    mocks.findIntent.mockResolvedValue({ ...intent })
    mocks.findBooking.mockResolvedValue({ ...booking, status: 'expired' })
    await recordVerifiedPayment(verified, 'synthetic-hash')
    expect(mocks.updateIntent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'requires_review' }) }))
    expect(mocks.updateBookings).toHaveBeenCalledWith({ where: { id: { in: ['hold', booking.id] } }, data: { settlement_status: 'requires_review' } })
    expect(mocks.updateBooking).not.toHaveBeenCalled()
  })
  it('rejects the gross amount as a mismatched provider receipt', async () => {
    mocks.findIntent.mockResolvedValue({ ...intent })
    await expect(recordVerifiedPayment({ ...verified, amount: 10000000 }, 'synthetic-hash')).rejects.toThrow('mismatch')
    expect(mocks.ledger).not.toHaveBeenCalled()
  })
})
