import type { PaymentIntent, Prisma } from '@prisma/client'
import { lockRecord } from '@/lib/database/transactions'

/** Existing collections/refunds may belong to a closed member: retain truth,
 * but serialize any entitlement change against account closure and checkout. */
export async function lockCommercialPayment(tx: Prisma.TransactionClient, payment: Pick<PaymentIntent, 'order_id' | 'user_id'>): Promise<void> {
  if (!payment.order_id) return
  if (!await lockRecord(tx, 'user', payment.user_id) || !await lockRecord(tx, 'commercialOrder', payment.order_id)) throw new Error('COMMERCIAL_SOURCE_UNAVAILABLE')
  const order = await tx.commercialOrder.findUniqueOrThrow({ where: { id: payment.order_id }, select: { user_id: true, campaign_id: true } })
  if (order.user_id !== payment.user_id) throw new Error('COMMERCIAL_SOURCE_MISMATCH')
  if (order.campaign_id && !await lockRecord(tx, 'sponsoredCampaign', order.campaign_id)) throw new Error('COMMERCIAL_SOURCE_UNAVAILABLE')
}
