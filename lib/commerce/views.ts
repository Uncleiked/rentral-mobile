import type { CommercialOrder, PaymentIntent, SponsoredCampaign } from '@prisma/client'
import prisma from '@/lib/db'
import { assertCommercialReady, commercialPrepared } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import { accountIsActive } from '@/lib/accounts/availability'
import { roleAllows } from '@/lib/auth/roles-policy'
import { archiveBoundary, nextArchiveCursor, type ArchiveQuery } from '@/lib/api/archive'
import { commercialEnabled, commercialEnvironment, commercialTerms } from './config'
import { commercialOverviewSchema, commercialOrderSchema, sponsoredCampaignSchema } from './contracts'
import { eligibleCommercialOrderIds } from './service'
import { CommercialError } from './policy'

export function commercialOrderDto(order: CommercialOrder, payments: PaymentIntent[]) {
  const result = commercialOrderSchema.safeParse({ id: order.id, clientId: order.client_id, kind: order.kind, status: order.status, currency: order.currency,
    amountKobo: order.amount_kobo.toString(), serviceDays: order.service_days, priceVersion: order.price_version, billingEnvironment: order.billing_environment,
    campaignId: order.campaign_id, paidAt: order.paid_at?.toISOString() ?? null, createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString(),
    payments: payments.slice(0, 20).map(payment => ({ id: payment.id, reference: payment.reference, status: payment.status, billingEnvironment: payment.provider_environment, createdAt: payment.createdAt.toISOString() })) })
  if (!result.success) throw new CommercialError('Purchase details could not be verified. Refresh before paying.', 'COMMERCIAL_DATA_UNAVAILABLE', 503)
  return result.data
}
export function sponsoredCampaignDto(campaign: SponsoredCampaign) {
  const result = sponsoredCampaignSchema.safeParse({ id: campaign.id, listingId: campaign.listing_id, orderId: campaign.order_id, headline: campaign.headline,
    status: campaign.status, billingEnvironment: campaign.billing_environment, startsAt: campaign.starts_at.toISOString(), endsAt: campaign.ends_at.toISOString(),
    reviewedAt: campaign.reviewed_at?.toISOString() ?? null, decisionReason: campaign.decision_reason, createdAt: campaign.createdAt.toISOString(), updatedAt: campaign.updatedAt.toISOString() })
  if (!result.success) throw new CommercialError('Campaign details could not be verified. Refresh before continuing.', 'COMMERCIAL_DATA_UNAVAILABLE', 503)
  return result.data
}
export async function insightsAccess(userId: string): Promise<{ allowed: boolean; internal: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { closed_at: true, staff_role: true } })
  if (!accountIsActive(user)) return { allowed: false, internal: false }
  if (roleAllows(user?.staff_role, 'insights:view')) return { allowed: true, internal: true }
  const environment = commercialEnvironment()
  if (!commercialEnabled() || !environment || !await commercialPrepared()) return { allowed: false, internal: false }
  return withTransaction(async tx => {
    const now = new Date()
    const entitlements = await tx.insightEntitlement.findMany({ where: { user_id: userId, status: 'active', billing_environment: environment, starts_at: { lte: now }, ends_at: { gt: now } }, orderBy: { ends_at: 'desc' }, take: 25 })
    const orders = entitlements.length ? await tx.commercialOrder.findMany({ where: { id: { in: entitlements.map(entitlement => entitlement.order_id) }, user_id: userId, kind: 'insights' } }) : []
    return { allowed: (await eligibleCommercialOrderIds(tx, orders)).size > 0, internal: false }
  })
}
export async function ownCommercialOrder(userId: string, id: string) {
  await assertCommercialReady()
  const order = await prisma.commercialOrder.findFirst({ where: { id, user_id: userId } })
  if (!order) throw new CommercialError('This purchase is unavailable.', 'NOT_FOUND', 404)
  const payments = await prisma.paymentIntent.findMany({ where: { order_id: id, user_id: userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 })
  return commercialOrderDto(order, payments)
}
export async function ownSponsoredCampaign(userId: string, id: string) {
  await assertCommercialReady()
  const row = await prisma.sponsoredCampaign.findFirst({ where: { id, user_id: userId } })
  if (!row) throw new CommercialError('This campaign is unavailable.', 'NOT_FOUND', 404)
  return sponsoredCampaignDto(row)
}
export async function commercialOverview(userId: string, query: ArchiveQuery) {
  await assertCommercialReady()
  const [orders, campaigns, entitlements, access] = await Promise.all([
    prisma.commercialOrder.findMany({ where: { user_id: userId, ...archiveBoundary(query.cursor) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 }),
    prisma.sponsoredCampaign.findMany({ where: { user_id: userId, ...archiveBoundary(query.cursor) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 }),
    prisma.insightEntitlement.findMany({ where: { user_id: userId }, orderBy: { ends_at: 'desc' }, take: 25 }), insightsAccess(userId),
  ])
  const page = orders.slice(0, query.limit), attempts = page.length ? await prisma.paymentIntent.findMany({ where: { order_id: { in: page.map(order => order.id) }, user_id: userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: page.length * 20 }) : []
  const terms = (['insights', 'sponsorship'] as const).flatMap(kind => { try { return [commercialTerms(kind)] } catch { return [] } })
  const result = commercialOverviewSchema.safeParse({ enabled: commercialEnabled(), billingEnvironment: commercialEnvironment(), terms,
    orders: page.map(order => commercialOrderDto(order, attempts.filter(payment => payment.order_id === order.id))), campaigns: campaigns.slice(0, query.limit).map(sponsoredCampaignDto),
    entitlements: entitlements.map(row => ({ id: row.id, orderId: row.order_id, billingEnvironment: row.billing_environment, startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString(), status: row.status })),
    ordersNextCursor: nextArchiveCursor(orders, query.limit), campaignsNextCursor: nextArchiveCursor(campaigns, query.limit), insightsAccess: access.allowed, internalInsightsAccess: access.internal })
  if (!result.success) throw new CommercialError('Your commercial workspace could not be verified. Refresh in a moment.', 'COMMERCIAL_DATA_UNAVAILABLE', 503)
  return result.data
}
