import { assertCommercialReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { commercialTerms } from './config'
import { commercialOrderInputSchema, CommercialError } from './policy'

export async function createCommercialOrder(userId: string, input: unknown): Promise<string> {
  await assertCommercialReady()
  const data = commercialOrderInputSchema.parse(input)
  return withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    const retry = await tx.commercialOrder.findUnique({ where: { user_id_client_id: { user_id: userId, client_id: data.clientId } } })
    if (retry) {
      if (retry.kind !== data.kind || retry.campaign_id !== (data.campaignId ?? null)) throw new CommercialError('This request identifier belongs to different purchase instructions. Refresh the original order.', 'INVALID_RETRY')
      return retry.id
    }
    const terms = commercialTerms(data.kind)
    if (await tx.commercialOrder.count({ where: { user_id: userId, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 10) throw new CommercialError('You have reached the daily purchase-request limit. Reconcile existing orders before trying another day.', 'COMMERCIAL_RATE_LIMITED', 429)
    if (data.kind === 'insights' && await tx.commercialOrder.findFirst({ where: { user_id: userId, kind: 'insights', status: { in: ['created', 'awaiting_payment', 'requires_review'] } }, select: { id: true } })) {
      throw new CommercialError('Review the existing unpaid or uncertain Insights order before creating another.', 'COMMERCIAL_ORDER_EXISTS')
    }
    if (data.kind === 'insights' && await tx.paymentIntent.findFirst({ where: { user_id: userId, kind: 'commercial', status: { in: ['initializing', 'pending', 'uncertain'] },
      order: { is: { kind: 'insights' } } }, select: { id: true } })) throw new CommercialError('A previous Insights payment is still pending or uncertain. Reconcile its original reference before creating another order.', 'COMMERCIAL_PAYMENT_UNCONFIRMED')
    if (data.campaignId) {
      await lockRecord(tx, 'sponsoredCampaign', data.campaignId)
      const campaign = await tx.sponsoredCampaign.findUnique({ where: { id: data.campaignId } })
      const listing = campaign ? await tx.listing.findFirst({ where: { id: campaign.listing_id, lister_id: userId, listing_status: 'active',
        OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: { id: true } }) : null
      if (!campaign || campaign.user_id !== userId || campaign.status !== 'approved' || !campaign.reviewed_by || campaign.reviewed_by === userId || !campaign.reviewed_at
        || campaign.order_id || campaign.billing_environment !== terms.billingEnvironment || campaign.starts_at <= new Date()
        || campaign.ends_at.getTime() - campaign.starts_at.getTime() !== terms.serviceDays * 86400000 || !listing) {
        throw new CommercialError('Choose your independently approved campaign with a future start, current duration and no existing order.', 'CAMPAIGN_CHECKOUT_UNAVAILABLE')
      }
    }
    const order = await tx.commercialOrder.create({ data: { user_id: userId, client_id: data.clientId, kind: data.kind, currency: 'NGN',
      amount_kobo: BigInt(terms.amountKobo), service_days: terms.serviceDays, price_version: terms.priceVersion,
      billing_environment: terms.billingEnvironment, campaign_id: data.campaignId ?? null, paid_at: null } })
    if (data.campaignId) await tx.sponsoredCampaign.update({ where: { id: data.campaignId }, data: { order_id: order.id } })
    return order.id
  })
}

/** Cancels service instructions; existing provider attempts still need reconciliation. */
export async function cancelCommercialOrder(userId: string, id: string): Promise<void> {
  await assertCommercialReady()
  await withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId]); await lockRecord(tx, 'commercialOrder', id)
    const order = await tx.commercialOrder.findUnique({ where: { id } })
    if (!order || order.user_id !== userId) throw new CommercialError('This purchase is unavailable.', 'NOT_FOUND', 404)
    if (order.status === 'paid') throw new CommercialError('A paid purchase needs the financial review process. Cancelling an order does not create a refund.', 'COMMERCIAL_PAID_REVIEW_REQUIRED')
    await tx.commercialOrder.update({ where: { id }, data: { status: 'cancelled' } })
    if (order.campaign_id) await tx.sponsoredCampaign.updateMany({ where: { id: order.campaign_id, user_id: userId }, data: { status: 'cancelled' } })
  })
}
