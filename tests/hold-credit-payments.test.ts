import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: vi.fn(async () => undefined) }))

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), initialize: vi.fn(), findIntent: vi.fn(), createIntent: vi.fn(), updateIntent: vi.fn(), claim: vi.fn(), findAllocation: vi.fn(), findBooking: vi.fn(), findListing: vi.fn(), updateBooking: vi.fn(), updateBookings: vi.fn(), ledger: vi.fn(), event: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction, paymentIntent: { updateMany: mocks.claim } } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work), lockRecord: async () => true }))
vi.mock('@/lib/bookings/service', () => ({ expireListingReservations: vi.fn(), otherConfirmedHold: vi.fn(async () => null), paidBookingExpiry: () => null }))
vi.mock('@/lib/payments/paystack', () => ({ initializePaystack: mocks.initialize, verifyPaystack: vi.fn() }))
vi.mock('@/lib/payments/allocations', () => ({ paymentFundsReserved: vi.fn(async () => false) }))
import { startBookingPayment, startListingFeePayment, recordVerifiedPayment } from '@/lib/payments/service'

const userId = 'f889f677-c3d3-4182-bd60-64066ee1c237', paymentId = '828db1e4-46ec-4774-9d8d-e78058b399d2'
const booking = { id: 'rental', listing_id: 'listing', seeker_id: userId, lister_id: 'host', kind: 'rental', status: 'awaiting_payment',
  currency: 'NGN', amount_kobo: BigInt(10000000), hold_credit_kobo: BigInt(2000000), settlement_status: 'unsettled', expires_at: new Date(Date.now() + 600000),
  starts_at: new Date(Date.now() + 86400000), ends_at: new Date(Date.now() + 2 * 86400000),
  pricing_snapshot: { period: 'day', days: 1, baseKobo: '10000000', totalKobo: '10000000', fees: [], holdBookingId: 'a727d7b3-2148-43e4-86df-a0717569fec4', holdCreditKobo: '2000000', payableKobo: '8000000' } }
const source = { ...booking, id: booking.pricing_snapshot.holdBookingId, kind: 'hold', status: 'converted', amount_kobo: BigInt(2000000), payments: [{ user_id: userId, kind: 'booking', amount_kobo: BigInt(2000000), currency: 'NGN', status: 'succeeded', paid_at: new Date(), ledger: [{ kind: 'provider_collection' }] }] }
const intent = { id: paymentId, booking_id: booking.id, listing_id: null, user_id: userId, kind: 'booking', provider: 'paystack', reference: 'synthetic-credit-balance',
  amount_kobo: BigInt(8000000), currency: 'NGN', customer_email: 'renter@example.test', status: 'pending', provider_environment: 'test' }
const verified = { id: 'synthetic-1', reference: intent.reference, amount: 8000000, currency: 'NGN', status: 'success', environment: 'test' as const, customer: { email: intent.customer_email },
  metadata: { rentral_payment_id: paymentId, rentral_user_id: userId } }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_synthetic')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://owned-fixture.invalid')
  mocks.claim.mockResolvedValue({ count: 1 }); mocks.initialize.mockResolvedValue('https://checkout.paystack.com/synthetic')
  mocks.findBooking.mockResolvedValue({ ...booking })
  mocks.findIntent.mockResolvedValue(null)
  mocks.findListing.mockResolvedValue({ id: 'listing' })
  mocks.createIntent.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...intent, ...data, id: paymentId, status: 'created' }))
  mocks.findAllocation.mockResolvedValue({ hold_booking_id: 'hold', rental_booking_id: 'rental', amount_kobo: BigInt(2000000), currency: 'NGN', hold_booking: { ...source } })
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    booking: { findFirst: (query: { where: { id?: unknown } }) => typeof query.where.id === 'object' ? Promise.resolve(null) : mocks.findBooking(query), findUnique: mocks.findBooking, findUniqueOrThrow: mocks.findBooking, update: mocks.updateBooking, updateMany: mocks.updateBookings },
    paymentIntent: { findFirst: mocks.findIntent, findUnique: mocks.findIntent, findUniqueOrThrow: mocks.findIntent, create: mocks.createIntent, update: mocks.updateIntent, updateMany: mocks.claim },
    holdCreditAllocation: { findUnique: mocks.findAllocation }, user: { findUniqueOrThrow: vi.fn(async () => ({ email: intent.customer_email, kyc_verified: true })), findFirstOrThrow: vi.fn(async () => ({ email: intent.customer_email })), findFirst: vi.fn(async () => ({ id: userId })) },
    listing: { findFirst: mocks.findListing }, paymentEvent: { findUnique: vi.fn(async () => null), create: mocks.event }, ledgerTransaction: { create: mocks.ledger }, notification: { create: mocks.notify },
  }))
})
afterEach(() => vi.unstubAllEnvs())

describe('holding credit collection boundary', () => {
  it('rechecks a waiver committed after intent preparation before authorizing provider initialization', async () => {
    mocks.findListing.mockResolvedValueOnce({ id: 'listing' }).mockResolvedValue({ id: 'listing', fee_waived_at: new Date(), fee_waived_by: userId, fee_waiver_reason: 'Reviewed and waived this publication fee.' })
    await expect(startListingFeePayment(userId, 'listing')).rejects.toThrow('waived')
    expect(mocks.createIntent).toHaveBeenCalledTimes(1)
    expect(mocks.initialize).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled()
  })
  it('creates and sends a provider intent for the exact remaining balance', async () => {
    await startBookingPayment(userId, booking.id)
    expect(mocks.createIntent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount_kobo: BigInt(8000000) }) }))
    expect(mocks.initialize).toHaveBeenCalledWith(expect.objectContaining({ amountKobo: BigInt(8000000) }))
  })
  it.each(['failed', 'abandoned'])('permits an explicit new checkout after verified terminal%s', async status => {
    mocks.findIntent.mockResolvedValue({ ...intent, status })
    await startBookingPayment(userId, booking.id)
    expect(mocks.createIntent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotency_key: `booking:${booking.id}:after:${paymentId}`, provider_environment: 'test' }) }))
    expect(mocks.initialize).toHaveBeenCalledTimes(1)
  })
  it.each(['uncertain', 'initializing', 'succeeded', 'requires_review', 'reversed'])('never creates another charge for%s', async status => {
    mocks.findIntent.mockResolvedValue({ ...intent, status })
    await expect(startBookingPayment(userId, booking.id)).rejects.toThrow('reconcil')
    expect(mocks.createIntent).not.toHaveBeenCalled(); expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it('reuses an initialized pending checkout without another provider call', async () => {
    mocks.findIntent.mockResolvedValue({ ...intent, checkout_url: 'https://checkout.paystack.com/existing' })
    expect(await startBookingPayment(userId, booking.id)).toBe('https://checkout.paystack.com/existing')
    expect(mocks.createIntent).not.toHaveBeenCalled(); expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it.each(['created', 'pending', 'initializing', 'uncertain'])('refuses a wrong-mode%s attempt without returning its saved URL or sending a provider request', async status => {
    mocks.findIntent.mockResolvedValue({ ...intent, status, checkout_url: 'https://checkout.paystack.com/test-mode' })
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_synthetic'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'live')
    await expect(startBookingPayment(userId, booking.id)).rejects.toMatchObject({ code: 'PAYMENT_ENVIRONMENT_MISMATCH' })
    expect(mocks.createIntent).not.toHaveBeenCalled(); expect(mocks.initialize).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled()
  })
  it('allows an explicit current-mode retry of a known failed test attempt while preserving its original row', async () => {
    const previous = { ...intent, status: 'failed', provider_environment: 'test' }
    mocks.findIntent.mockResolvedValue(previous)
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_synthetic'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'live')
    await startBookingPayment(userId, booking.id)
    expect(mocks.createIntent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ provider_environment: 'live', idempotency_key: `booking:${booking.id}:after:${paymentId}` }) }))
    expect(mocks.initialize).toHaveBeenCalledOnce(); expect(previous).toMatchObject({ status: 'failed', provider_environment: 'test' })
  })
  it('keeps legacy unknown-mode attempts readable without silently replacing them', async () => {
    mocks.findIntent.mockResolvedValue({ ...intent, status: 'failed', provider_environment: null })
    await expect(startBookingPayment(userId, booking.id)).rejects.toMatchObject({ code: 'PAYMENT_ENVIRONMENT_MISMATCH' })
    expect(mocks.createIntent).not.toHaveBeenCalled(); expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it.each(['booking', 'listing'])('rejects a misconfigured production callback before any%s intent/claim/provider write', async kind => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    const work = kind === 'booking' ? startBookingPayment(userId, booking.id) : startListingFeePayment(userId, 'listing')
    await expect(work).rejects.toMatchObject({ code: 'PAYMENT_CALLBACK_UNAVAILABLE' })
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it('keeps listing checkout in its saved mode and preserves explicit known-terminal current-mode retries', async () => {
    const fee = { ...intent, listing_id: 'listing', booking_id: null, kind: 'listing_fee', amount_kobo: BigInt(100000), checkout_url: 'https://checkout.paystack.com/original-fee' }
    mocks.findIntent.mockResolvedValue(fee)
    expect(await startListingFeePayment(userId, 'listing')).toBe(fee.checkout_url)
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_synthetic'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'live')
    await expect(startListingFeePayment(userId, 'listing')).rejects.toMatchObject({ code: 'PAYMENT_ENVIRONMENT_MISMATCH' })
    expect(mocks.createIntent).not.toHaveBeenCalled(); expect(mocks.initialize).not.toHaveBeenCalled()
    mocks.findIntent.mockResolvedValue({ ...fee, status: 'failed' })
    await startListingFeePayment(userId, 'listing')
    expect(mocks.createIntent).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount_kobo: BigInt(100000), provider_environment: 'live', idempotency_key: `listing:listing:after:${paymentId}` }) }))
    expect(mocks.initialize).toHaveBeenCalledOnce()
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
