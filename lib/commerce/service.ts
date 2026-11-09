import type { CommercialOrder, PaymentIntent, Prisma } from '@prisma/client'
import { accountIsActive } from '@/lib/accounts/availability'
import { FINANCIAL_RESERVING_STATUSES } from '@/lib/payments/allocations'
import { commercialEnabled, commercialEnvironment } from './config'
import { commercialMoneySchema } from './policy'

const blockedPaymentStates = new Set(['initializing', 'pending', 'uncertain', 'requires_review', 'reversed'])
export function commercialPaymentMatches(order: CommercialOrder, payment: PaymentIntent): boolean {
  return payment.order_id === order.id && payment.user_id === order.user_id && payment.kind === 'commercial' && payment.provider === 'paystack'
    && payment.amount_kobo === order.amount_kobo && payment.currency === order.currency && order.currency === 'NGN'
    && payment.provider_environment === order.billing_environment && Boolean(payment.provider_transaction_id && payment.paid_at)
    && !payment.booking_id && !payment.listing_id
}

/** Batch proof: one exact provider collection, its journal, and no refunded,
 * reversed or unresolved attempt. An entitlement alone is never access proof. */
export async function eligibleCommercialOrderIds(tx: Prisma.TransactionClient, orders: CommercialOrder[]): Promise<Set<string>> {
  const valid = new Set<string>(), environment = commercialEnvironment()
  if (!commercialEnabled() || !environment) return valid
  const current = orders.filter(order => order.status === 'paid' && order.paid_at && order.billing_environment === environment && ['insights', 'sponsorship'].includes(order.kind))
  if (!current.length) return valid
  const payments = await tx.paymentIntent.findMany({ where: { order_id: { in: current.map(order => order.id) } }, take: current.length * 25 })
  // A truncated attempt set cannot prove absence of another live/late charge.
  if (payments.length >= current.length * 25) return valid
  const paymentIds = payments.map(payment => payment.id)
  const journals = paymentIds.length ? await tx.ledgerTransaction.findMany({ where: { payment_id: { in: paymentIds }, kind: 'provider_collection' }, select: { payment_id: true } }) : []
  const refunds = paymentIds.length ? await tx.financialAllocation.findMany({ where: { payment_id: { in: paymentIds }, operation: { kind: 'refund', status: { in: [...FINANCIAL_RESERVING_STATUSES] } } }, select: { payment_id: true } }) : []
  const journaled = new Set(journals.map(journal => journal.payment_id)), refunding = new Set(refunds.map(refund => refund.payment_id))
  for (const order of current) {
    const attempts = payments.filter(payment => payment.order_id === order.id)
    if (attempts.length >= 25 || attempts.some(payment => blockedPaymentStates.has(payment.status) || refunding.has(payment.id))) continue
    const collected = attempts.filter(payment => payment.status === 'succeeded')
    if (collected.length === 1 && commercialPaymentMatches(order, collected[0]) && journaled.has(collected[0].id)) valid.add(order.id)
  }
  return valid
}

/** Caller holds User -> CommercialOrder -> campaign -> PaymentIntent locks.
 * Collected-funds truth/journal is already persisted in this same transaction. */
export async function applyVerifiedCommercialOrder(tx: Prisma.TransactionClient, input: Pick<PaymentIntent, 'id' | 'order_id'>): Promise<void> {
  if (!input.order_id) return
  const payment = await tx.paymentIntent.findUnique({ where: { id: input.id } })
  const order = await tx.commercialOrder.findUnique({ where: { id: input.order_id } })
  if (!payment || !order) return
  const user = await tx.user.findUnique({ where: { id: order.user_id }, select: { closed_at: true } })
  if (order.status === 'cancelled' || !accountIsActive(user) || payment.status !== 'succeeded' || !commercialPaymentMatches(order, payment)
    || !commercialEnabled() || order.billing_environment !== commercialEnvironment() || !commercialMoneySchema.safeParse(order.amount_kobo.toString()).success
    || !Number.isInteger(order.service_days) || order.service_days < 1 || order.service_days > 366) {
    await revokeCommercialOrder(tx, order.id); return
  }
  const paidAt = order.paid_at ?? payment.paid_at ?? new Date()
  const proposed = { ...order, status: 'paid', paid_at: paidAt }
  if (!(await eligibleCommercialOrderIds(tx, [proposed])).has(order.id)) { await revokeCommercialOrder(tx, order.id); return }
  if (order.kind === 'sponsorship') {
    const campaign = order.campaign_id ? await tx.sponsoredCampaign.findUnique({ where: { id: order.campaign_id } }) : null
    const listing = campaign ? await tx.listing.findFirst({ where: { id: campaign.listing_id, lister_id: order.user_id, listing_status: 'active',
      OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: { id: true } }) : null
    if (!campaign || campaign.user_id !== order.user_id || campaign.order_id !== order.id || campaign.billing_environment !== order.billing_environment
      || campaign.status !== 'approved' || !campaign.reviewed_by || campaign.reviewed_by === order.user_id || !campaign.reviewed_at || campaign.ends_at <= new Date()
      || campaign.ends_at.getTime() - campaign.starts_at.getTime() !== order.service_days * 86400000 || !listing) {
      await revokeCommercialOrder(tx, order.id); return
    }
  } else if (order.kind === 'insights') {
    const existing = await tx.insightEntitlement.findUnique({ where: { order_id: order.id } })
    if (existing) {
      if (existing.user_id !== order.user_id || existing.billing_environment !== order.billing_environment) { await revokeCommercialOrder(tx, order.id); return }
      // Explicit reconciliation can restore a declined/failed refund reservation,
      // but never extends the original purchased term on duplicate receipts.
      if (existing.status !== 'active') await tx.insightEntitlement.update({ where: { id: existing.id }, data: { status: 'active' } })
    } else {
      const now = new Date()
      const prior = await tx.insightEntitlement.findMany({ where: { user_id: order.user_id, billing_environment: order.billing_environment, status: 'active', ends_at: { gt: now } }, orderBy: { ends_at: 'desc' }, take: 25 })
      const previousOrders = prior.length ? await tx.commercialOrder.findMany({ where: { id: { in: prior.map(entitlement => entitlement.order_id) } } }) : []
      const eligible = await eligibleCommercialOrderIds(tx, previousOrders)
      const last = prior.find(entitlement => eligible.has(entitlement.order_id)), startsAt = last && last.ends_at > now ? last.ends_at : now
      await tx.insightEntitlement.create({ data: { user_id: order.user_id, order_id: order.id, billing_environment: order.billing_environment,
        starts_at: startsAt, ends_at: new Date(startsAt.getTime() + order.service_days * 86400000) } })
    }
  } else { await revokeCommercialOrder(tx, order.id); return }
  await tx.commercialOrder.update({ where: { id: order.id }, data: { status: 'paid', paid_at: paidAt } })
}

/** Reservation/reversal never erases the collected receipt or moves money here. */
export async function revokeCommercialOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.commercialOrder.updateMany({ where: { id: orderId, status: { not: 'cancelled' } }, data: { status: 'requires_review' } })
  await tx.insightEntitlement.updateMany({ where: { order_id: orderId }, data: { status: 'revoked' } })
  await tx.sponsoredCampaign.updateMany({ where: { order_id: orderId, status: { in: ['approved', 'pending_review'] } }, data: { status: 'paused' } })
}
/** Caller already holds the user lock and checks commercial preparation. */
export async function closeCommercialAccountInTransaction(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.insightEntitlement.updateMany({ where: { user_id: userId, status: 'active' }, data: { status: 'revoked' } })
  await tx.sponsoredCampaign.updateMany({ where: { user_id: userId, status: { in: ['draft', 'pending_review', 'approved'] } }, data: { status: 'paused' } })
  // Paid orders, prior review notes, receipts and immutable journals are retained.
}
