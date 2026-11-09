import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { commercialPrepared } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import { getPublicListingsByIds, type DiscoveryListing } from '@/lib/discovery'
import type { DiscoveryFilters } from '@/lib/discovery-policy'
import { publicListing } from '@/lib/api/projection'
import { activeAccountWhere, assertActiveAccounts } from '@/lib/accounts/availability'
import { analyticsCollectionEnabled, recordAnalyticsObservationInTransaction } from '@/lib/analytics/service'
import { listingObservationContext } from '@/lib/analytics/observations'
import { commercialEnabled, commercialEnvironment } from './config'
import { eligibleCommercialOrderIds } from './service'
import { CommercialError } from './policy'
import { sponsoredPageSchema } from './contracts'

/** Candidate rotation is time-based and the same for everyone; no personal or
 * protected traits affect placement. Paid placement never alters organic rank. */
export async function currentSponsoredCampaigns(tx: Prisma.TransactionClient, now = new Date(), campaignId?: string) {
  const environment = commercialEnvironment()
  if (!commercialEnabled() || !environment) return []
  const base = { status: 'approved', billing_environment: environment, starts_at: { lte: now }, ends_at: { gt: now } }
  const hex = createHash('sha256').update(String(Math.floor(now.getTime() / 600000))).digest('hex')
  const pivot = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  const rows = await tx.sponsoredCampaign.findMany({ where: { ...base, ...(campaignId ? { id: campaignId } : { id: { gt: pivot } }) }, orderBy: { id: 'asc' }, take: campaignId ? 1 : 24 })
  if (!campaignId && rows.length < 24) rows.push(...await tx.sponsoredCampaign.findMany({ where: { ...base, id: { lte: pivot } }, orderBy: { id: 'asc' }, take: 24 - rows.length }))
  const orderIds = rows.flatMap(campaign => campaign.order_id ? [campaign.order_id] : [])
  const orders = orderIds.length ? await tx.commercialOrder.findMany({ where: { id: { in: orderIds }, kind: 'sponsorship' } }) : []
  const paid = await eligibleCommercialOrderIds(tx, orders)
  return rows.filter(campaign => {
    const order = orders.find(order => order.id === campaign.order_id)
    return Boolean(order && paid.has(order.id) && order.user_id === campaign.user_id && order.campaign_id === campaign.id && order.billing_environment === campaign.billing_environment
      && campaign.reviewed_by && campaign.reviewed_by !== campaign.user_id && campaign.reviewed_at && campaign.ends_at.getTime() - campaign.starts_at.getTime() === order.service_days * 86400000)
  })
}
export type SponsoredPlacement = { campaignId: string; headline: string; adLabel: 'Sponsored'; billingEnvironment: 'test' | 'live'; endsAt: string; listing: DiscoveryListing }
export async function sponsoredPlacements(filters: DiscoveryFilters, userId: string | null = null, now = new Date()): Promise<SponsoredPlacement[]> {
  if (!commercialEnabled() || !await commercialPrepared()) return []
  const campaigns = await withTransaction(tx => currentSponsoredCampaigns(tx, now))
  const shortlist = campaigns.slice(0, 12)
  const listings = await getPublicListingsByIds(shortlist.map(campaign => campaign.listing_id), userId, filters)
  return shortlist.flatMap(campaign => {
    const listing = listings.find(listing => listing.id === campaign.listing_id)
    return listing ? [{ campaignId: campaign.id, headline: campaign.headline, adLabel: 'Sponsored' as const, billingEnvironment: z.enum(['test', 'live']).parse(campaign.billing_environment), endsAt: campaign.ends_at.toISOString(), listing }] : []
  }).slice(0, 3)
}
export function publicSponsoredPlacements(rows: SponsoredPlacement[]) {
  const value = sponsoredPageSchema.safeParse({ items: rows.map(row => ({ ...row, listing: publicListing(row.listing) })) })
  if (!value.success) throw new CommercialError('Sponsored options could not be verified. Refresh in a moment.', 'COMMERCIAL_DATA_UNAVAILABLE', 503)
  return value.data
}
export async function recordSponsoredObservation(userId: string, campaignId: string, event: 'impression' | 'click'): Promise<boolean> {
  z.uuid().parse(campaignId); z.enum(['impression', 'click']).parse(event)
  if (!analyticsCollectionEnabled() || !commercialEnabled() || !await commercialPrepared()) return false
  return withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    const [campaign] = await currentSponsoredCampaigns(tx, new Date(), campaignId)
    const listing = campaign ? await tx.listing.findFirst({ where: { id: campaign.listing_id, lister_id: campaign.user_id, listing_status: 'active', lister: { is: activeAccountWhere },
      OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: { category: true, text_address: true, base_rent_amount: true, asset_metadata: true } }) : null
    if (!campaign || !listing) throw new CommercialError('This sponsored option is unavailable.', 'NOT_FOUND', 404)
    return recordAnalyticsObservationInTransaction(tx, userId, { event: event === 'impression' ? 'sponsored_impression' : 'sponsored_click', campaignId, ...listingObservationContext(listing) })
  })
}
