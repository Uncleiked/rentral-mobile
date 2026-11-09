import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ order: vi.fn(), updateOrder: vi.fn(), previous: vi.fn(), count: vi.fn(), create: vi.fn(), claim: vi.fn(), initialize: vi.fn(), lock: vi.fn(), active: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { paymentIntent: { updateMany: mocks.claim } } }))
vi.mock('@/lib/database/readiness', () => ({ assertCommercialReady: async () => undefined }))
vi.mock('@/lib/accounts/availability', () => ({ assertActiveAccounts: mocks.active }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: async (work: (tx: unknown) => unknown) => work({ commercialOrder: { findUnique: mocks.order, update: mocks.updateOrder }, user: { findUniqueOrThrow: async () => ({ email: 'payer@fixture.invalid' }) }, paymentIntent: { findFirst: mocks.previous, count: mocks.count, create: mocks.create } }) }))
vi.mock('@/lib/payments/paystack', () => ({ initializePaystack: mocks.initialize }))
import { startCommercialOrderPayment } from '@/lib/payments/commercial'
import { PaystackError } from '@/lib/payments/providers/paystack/client'

const userId = randomUUID(), orderId = randomUUID(), paymentId = randomUUID()
const order = { id: orderId, user_id: userId, kind: 'insights', status: 'created', billing_environment: 'test', amount_kobo: 125000n, currency: 'NGN', service_days: 30, price_version: 'commercial-v1', campaign_id: null }
const payment = { id: paymentId, order_id: orderId, user_id: userId, provider: 'paystack', provider_environment: 'test', kind: 'commercial', amount_kobo: order.amount_kobo, currency: 'NGN', customer_email: 'payer@fixture.invalid', reference: `rentral-${paymentId}`, status: 'created', booking_id: null, listing_id: null, checkout_url: null }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('COMMERCIAL_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned_fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'test')
  mocks.order.mockResolvedValue(order); mocks.count.mockResolvedValue(0); mocks.previous.mockResolvedValue(null); mocks.create.mockImplementation(async ({ data }) => ({ ...payment, ...data, id: paymentId })); mocks.claim.mockResolvedValue({ count: 1 }); mocks.initialize.mockResolvedValue('https://checkout.paystack.com/owned-fixture')
})
afterEach(() => vi.unstubAllEnvs())
describe('fixed-term commercial collection', () => {
  it('uses the persisted price/mode and verified payer, never caller amounts or a recurring mandate', async () => {
    expect(await startCommercialOrderPayment(userId, orderId)).toBe('https://checkout.paystack.com/owned-fixture')
    expect(mocks.active).toHaveBeenCalledWith(expect.anything(), [userId])
    expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), 'commercialOrder', orderId)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ order_id: orderId, amount_kobo: 125000n, kind: 'commercial', booking_id: null, listing_id: null, provider_environment: 'test' }) }))
    expect(mocks.initialize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ userId, amountKobo: 125000n, email: 'payer@fixture.invalid' }))
  })
  it.each([{ user_id: randomUUID() }, { billing_environment: 'live' }, { status: 'cancelled' }, { status: 'paid' }, { price_version: 'unknown' }, { amount_kobo: 0n }])('rejects mismatched or unavailable saved instructions before provider POST: %s', async patch => {
    mocks.order.mockResolvedValue({ ...order, ...patch })
    await expect(startCommercialOrderPayment(userId, orderId)).rejects.toThrow()
    expect(mocks.initialize).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('reuses an exact pending checkout and refuses corrupted amount bindings', async () => {
    mocks.previous.mockResolvedValue({ ...payment, status: 'pending', checkout_url: 'https://checkout.paystack.com/existing' })
    expect(await startCommercialOrderPayment(userId, orderId)).toBe('https://checkout.paystack.com/existing')
    expect(mocks.initialize).not.toHaveBeenCalled()
    mocks.previous.mockResolvedValue({ ...payment, status: 'pending', amount_kobo: 1n, checkout_url: 'https://checkout.paystack.com/wrong' })
    await expect(startCommercialOrderPayment(userId, orderId)).rejects.toMatchObject({ code: 'COMMERCIAL_ORDER_REVIEW_REQUIRED' })
  })
  it.each(['uncertain', 'initializing', 'succeeded', 'requires_review', 'reversed'])('never starts another POST for %s', async status => {
    mocks.previous.mockResolvedValue({ ...payment, status })
    await expect(startCommercialOrderPayment(userId, orderId)).rejects.toMatchObject({ code: 'COMMERCIAL_RECONCILE_REQUIRED' })
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.initialize).not.toHaveBeenCalled()
  })
  it.each(['failed', 'abandoned'])('permits a new explicit attempt only after verified terminal %s', async status => {
    mocks.previous.mockResolvedValue({ ...payment, status })
    await startCommercialOrderPayment(userId, orderId)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotency_key: `commercial:${orderId}:after:${paymentId}` }) }))
    expect(mocks.initialize).toHaveBeenCalledTimes(1)
  })
  it('keeps lost acknowledgement uncertain and enforces a bounded attempt count', async () => {
    mocks.initialize.mockRejectedValueOnce(new PaystackError('TIMEOUT', true))
    await expect(startCommercialOrderPayment(userId, orderId)).rejects.toMatchObject({ code: 'COMMERCIAL_RECONCILE_REQUIRED' })
    expect(mocks.claim).toHaveBeenLastCalledWith({ where: { id: paymentId, status: 'initializing' }, data: { status: 'uncertain' } })
    mocks.count.mockResolvedValue(24)
    await expect(startCommercialOrderPayment(userId, orderId)).rejects.toMatchObject({ code: 'COMMERCIAL_ATTEMPT_LIMIT' })
    expect(mocks.initialize).toHaveBeenCalledTimes(1)
  })
})
