import { randomUUID } from 'node:crypto'
import prisma from '@/lib/db'
import { assertCommercialReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { commercialEnabled, commercialEnvironment } from '@/lib/commerce/config'
import { COMMERCIAL_PRICE_VERSION, CommercialError, commercialMoneySchema } from '@/lib/commerce/policy'
import { initializePaystack } from './paystack'
import { paymentCallbackUrl } from './config'
import { PaystackError } from './providers/paystack/client'

/** Fixed-term purchases only. A verified failed/abandoned attempt may be
 * explicitly replaced; pending/unknown initialization never starts a second POST. */
export async function startCommercialOrderPayment(userId: string, orderId: string): Promise<string> {
  await assertCommercialReady()
  if (!commercialEnabled()) throw new CommercialError('Commercial checkout is not available. Your order remains recorded.', 'COMMERCIAL_DISABLED', 503)
  const environment = commercialEnvironment()
  const intent = await withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    await lockRecord(tx, 'commercialOrder', orderId)
    const order = await tx.commercialOrder.findUnique({ where: { id: orderId } })
    if (!order || order.user_id !== userId) throw new CommercialError('This purchase is unavailable.', 'NOT_FOUND', 404)
    if (!['created', 'awaiting_payment'].includes(order.status) || order.billing_environment !== environment || order.currency !== 'NGN'
      || order.price_version !== COMMERCIAL_PRICE_VERSION || !commercialMoneySchema.safeParse(order.amount_kobo.toString()).success
      || !Number.isInteger(order.service_days) || order.service_days < 1 || order.service_days > 366) {
      throw new CommercialError('This order needs reconciliation before checkout.', 'COMMERCIAL_ORDER_REVIEW_REQUIRED')
    }
    if (order.kind === 'sponsorship') {
      if (!order.campaign_id) throw new CommercialError('This campaign is unavailable.', 'CAMPAIGN_CHECKOUT_UNAVAILABLE')
      await lockRecord(tx, 'sponsoredCampaign', order.campaign_id)
      const campaign = await tx.sponsoredCampaign.findUnique({ where: { id: order.campaign_id } })
      const listing = campaign ? await tx.listing.findFirst({ where: { id: campaign.listing_id, lister_id: userId, listing_status: 'active', OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: { id: true } }) : null
      if (!campaign || campaign.order_id !== order.id || campaign.user_id !== userId || campaign.billing_environment !== environment || campaign.status !== 'approved'
        || !campaign.reviewed_by || campaign.reviewed_by === userId || !campaign.reviewed_at || campaign.starts_at <= new Date()
        || campaign.ends_at.getTime() - campaign.starts_at.getTime() !== order.service_days * 86400000 || !listing) throw new CommercialError('The reviewed campaign changed or its start date has passed.', 'CAMPAIGN_CHECKOUT_UNAVAILABLE')
    } else if (order.kind !== 'insights' || order.campaign_id) throw new CommercialError('This purchase type is unavailable.', 'COMMERCIAL_ORDER_REVIEW_REQUIRED')
    const previous = await tx.paymentIntent.findFirst({ where: { order_id: order.id, user_id: userId, kind: 'commercial' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    if (previous && (previous.amount_kobo !== order.amount_kobo || previous.currency !== order.currency || previous.provider_environment !== order.billing_environment || previous.provider !== 'paystack'
      || previous.booking_id || previous.listing_id)) throw new CommercialError('This payment does not match its saved order. Contact support for reconciliation.', 'COMMERCIAL_ORDER_REVIEW_REQUIRED')
    if (previous && !['failed', 'abandoned'].includes(previous.status)) return previous
    if (await tx.paymentIntent.count({ where: { order_id: order.id } }) >= 24) throw new CommercialError('This order reached its attempt limit. Contact support for reconciliation.', 'COMMERCIAL_ATTEMPT_LIMIT')
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })
    const created = await tx.paymentIntent.create({ data: { order_id: order.id, user_id: userId, booking_id: null, listing_id: null, kind: 'commercial', reference: `rentral-${randomUUID()}`,
      idempotency_key: previous ? `commercial:${order.id}:after:${previous.id}` : `commercial:${order.id}`, amount_kobo: order.amount_kobo, currency: order.currency, customer_email: user.email, provider_environment: order.billing_environment } })
    await tx.commercialOrder.update({ where: { id: order.id }, data: { status: 'awaiting_payment' } })
    return created
  })
  if (intent.status === 'pending' && intent.checkout_url) return intent.checkout_url
  if (intent.status !== 'created') throw new CommercialError('Check this purchase’s payment status before trying checkout again.', 'COMMERCIAL_RECONCILE_REQUIRED')
  const claimed = await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'created' }, data: { status: 'initializing' } })
  if (claimed.count !== 1) throw new CommercialError('Checkout is already being prepared. Refresh its status.', 'COMMERCIAL_RECONCILE_REQUIRED')
  try {
    const callback = new URL(`/marketplace/purchases?order=${encodeURIComponent(orderId)}`, paymentCallbackUrl(null)).href
    const url = await initializePaystack({ id: intent.id, userId, email: intent.customer_email, reference: intent.reference, amountKobo: intent.amount_kobo, callbackUrl: callback })
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { checkout_url: url, status: 'pending' } })
    return url
  } catch (error) {
    const rejected = error instanceof PaystackError && !error.uncertain && ['REJECTED', 'INVALID_INPUT'].includes(error.code)
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { status: rejected ? 'failed' : 'uncertain' } })
    throw new CommercialError('Checkout could not be confirmed. Refresh payment status; do not start a second charge.', 'COMMERCIAL_RECONCILE_REQUIRED')
  }
}
