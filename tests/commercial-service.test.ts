import type { CommercialOrder, PaymentIntent, Prisma } from '@prisma/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyVerifiedCommercialOrder, closeCommercialAccountInTransaction, eligibleCommercialOrderIds, revokeCommercialOrder } from '@/lib/commerce/service'

const orderId = '11111111-1111-4111-8111-111111111111', paymentId = '22222222-2222-4222-8222-222222222222', userId = '33333333-3333-4333-8333-333333333333'
const now = new Date('2030-01-01T10:00:00Z')
let order: CommercialOrder, payment: PaymentIntent
const mocks = { order: vi.fn(), orders: vi.fn(), updateOrder: vi.fn(), review: vi.fn(), payment: vi.fn(), payments: vi.fn(), journal: vi.fn(), refunds: vi.fn(),
  user: vi.fn(), entitlement: vi.fn(), entitlements: vi.fn(), createEntitlement: vi.fn(), updateEntitlement: vi.fn(), revokeEntitlements: vi.fn(), pause: vi.fn(), campaign: vi.fn(), listing: vi.fn() }
const tx = { commercialOrder: { findUnique: mocks.order, findMany: mocks.orders, update: mocks.updateOrder, updateMany: mocks.review },
  paymentIntent: { findUnique: mocks.payment, findMany: mocks.payments }, ledgerTransaction: { findMany: mocks.journal }, financialAllocation: { findMany: mocks.refunds },
  user: { findUnique: mocks.user }, insightEntitlement: { findUnique: mocks.entitlement, findMany: mocks.entitlements, create: mocks.createEntitlement, update: mocks.updateEntitlement, updateMany: mocks.revokeEntitlements },
  sponsoredCampaign: { findUnique: mocks.campaign, updateMany: mocks.pause }, listing: { findFirst: mocks.listing },
} as unknown as Prisma.TransactionClient
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('COMMERCIAL_ENABLED', 'true')
  vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned-commercial-fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'test')
  order = { id: orderId, revision: 0, user_id: userId, client_id: orderId, kind: 'insights', status: 'created', currency: 'NGN', amount_kobo: BigInt(100025), price_version: 'commercial-v1',
    service_days: 30, billing_environment: 'test', campaign_id: null, paid_at: null, createdAt: now, updatedAt: now }
  payment = { id: paymentId, revision: 0, order_id: orderId, booking_id: null, listing_id: null, user_id: userId, provider: 'paystack', provider_environment: 'test', kind: 'commercial',
    reference: `rentral-${paymentId}`, idempotency_key: `commercial:${orderId}`, amount_kobo: BigInt(100025), currency: 'NGN', customer_email: 'owned@fixture.invalid', status: 'succeeded',
    checkout_url: null, provider_transaction_id: 'owned-collection', paid_at: now, createdAt: now, updatedAt: now }
  mocks.order.mockImplementation(async () => order); mocks.payment.mockImplementation(async () => payment); mocks.payments.mockImplementation(async () => [payment])
  mocks.journal.mockResolvedValue([{ payment_id: paymentId }]); mocks.refunds.mockResolvedValue([]); mocks.user.mockResolvedValue({ closed_at: null })
  mocks.entitlement.mockResolvedValue(null); mocks.entitlements.mockResolvedValue([]); mocks.orders.mockResolvedValue([])
  mocks.createEntitlement.mockImplementation(async ({ data }) => data)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
it('grants only after an exact receipt+journal and snapshots the purchased manual term', async () => {
  await applyVerifiedCommercialOrder(tx, payment)
  expect(mocks.createEntitlement).toHaveBeenCalledExactlyOnceWith({ data: { user_id: userId, order_id: orderId, billing_environment: 'test', starts_at: now, ends_at: new Date('2030-01-31T10:00:00Z') } })
  expect(mocks.updateOrder).toHaveBeenCalledWith({ where: { id: orderId }, data: { status: 'paid', paid_at: now } })
})
it('replays verified receipts without extending existing dates, and can restore a clean original entitlement', async () => {
  mocks.entitlement.mockResolvedValue({ id: 'entitlement', user_id: userId, billing_environment: 'test', status: 'revoked', starts_at: now, ends_at: new Date('2030-01-31T10:00:00Z') })
  await applyVerifiedCommercialOrder(tx, payment)
  expect(mocks.createEntitlement).not.toHaveBeenCalled()
  expect(mocks.updateEntitlement).toHaveBeenCalledExactlyOnceWith({ where: { id: 'entitlement' }, data: { status: 'active' } })
})
it('extends a second manual purchase after the latest valid paid term', async () => {
  const previousId = '44444444-4444-4444-8444-444444444444', previousPayment = { ...payment, id: 'older-payment', order_id: previousId }
  mocks.entitlements.mockResolvedValue([{ order_id: previousId, ends_at: new Date('2030-02-01T10:00:00Z') }])
  mocks.orders.mockResolvedValue([{ ...order, id: previousId, status: 'paid', paid_at: now }])
  mocks.payments.mockImplementation(async ({ where }) => where.order_id.in.includes(previousId) ? [previousPayment] : [payment])
  mocks.journal.mockResolvedValue([{ payment_id: paymentId }, { payment_id: 'older-payment' }])
  await applyVerifiedCommercialOrder(tx, payment)
  expect(mocks.createEntitlement).toHaveBeenCalledWith({ data: expect.objectContaining({ starts_at: new Date('2030-02-01T10:00:00Z'), ends_at: new Date('2030-03-03T10:00:00Z') }) })
})
it.each(['closed-account', 'wrong-environment', 'wrong-owner', 'wrong-amount', 'wrong-kind', 'missing-journal', 'refund-reserved', 'extra-pending', 'duplicate-paid'])('preserves collected truth and requires review without granting service for %s', async failure => {
  if (failure === 'closed-account') mocks.user.mockResolvedValue({ closed_at: now })
  if (failure === 'wrong-environment') { vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_owned-fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'live') }
  if (failure === 'wrong-owner') payment.user_id = 'foreign-user'
  if (failure === 'wrong-amount') payment.amount_kobo = BigInt(1)
  if (failure === 'wrong-kind') payment.kind = 'booking'
  if (failure === 'missing-journal') mocks.journal.mockResolvedValue([])
  if (failure === 'refund-reserved') mocks.refunds.mockResolvedValue([{ payment_id: paymentId }])
  if (failure === 'extra-pending') mocks.payments.mockResolvedValue([payment, { ...payment, id: 'other-attempt', status: 'uncertain' }])
  if (failure === 'duplicate-paid') mocks.payments.mockResolvedValue([payment, { ...payment, id: 'other-collection', provider_transaction_id: 'late-second-collection' }])
  await applyVerifiedCommercialOrder(tx, payment)
  expect(mocks.createEntitlement).not.toHaveBeenCalled(); expect(mocks.updateOrder).not.toHaveBeenCalled()
  expect(mocks.review).toHaveBeenCalledWith({ where: { id: orderId, status: { not: 'cancelled' } }, data: { status: 'requires_review' } })
  expect(payment.status).toBe('succeeded'); expect(payment.provider_transaction_id).toBeTruthy()
})
it('does not prove access from a truncated or reversed attempt set', async () => {
  const paid = { ...order, status: 'paid', paid_at: now }
  mocks.payments.mockResolvedValue(Array.from({ length: 25 }, () => payment))
  expect((await eligibleCommercialOrderIds(tx, [paid])).size).toBe(0)
  mocks.payments.mockResolvedValue([{ ...payment, status: 'reversed' }])
  expect((await eligibleCommercialOrderIds(tx, [paid])).size).toBe(0)
})
it('revokes service atomically for refund reservation/reversal and account closure without touching orders/journals unnecessarily', async () => {
  await revokeCommercialOrder(tx, orderId)
  expect(mocks.revokeEntitlements).toHaveBeenCalledWith({ where: { order_id: orderId }, data: { status: 'revoked' } })
  vi.clearAllMocks()
  await closeCommercialAccountInTransaction(tx, userId)
  expect(mocks.revokeEntitlements).toHaveBeenCalledWith({ where: { user_id: userId, status: 'active' }, data: { status: 'revoked' } })
  expect(mocks.pause).toHaveBeenCalledWith({ where: { user_id: userId, status: { in: ['draft', 'pending_review', 'approved'] } }, data: { status: 'paused' } })
  expect(mocks.review).not.toHaveBeenCalled(); expect(mocks.updateOrder).not.toHaveBeenCalled()
})
