import { z } from 'zod'
import { assertCommercialReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { assertStaffPermission } from '@/lib/auth/roles'
import { commercialTerms } from './config'
import { campaignInputSchema, campaignPeriod, campaignDecisionSchema, CommercialError } from './policy'

export async function createSponsoredCampaign(userId: string, input: unknown): Promise<string> {
  await assertCommercialReady()
  const data = campaignInputSchema.parse(input)
  return withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    const existing = await tx.sponsoredCampaign.findUnique({ where: { id: data.clientId } })
    if (existing) {
      if (existing.user_id !== userId || existing.listing_id !== data.listingId || existing.headline !== data.headline || existing.starts_at.getTime() !== new Date(data.startsAt).getTime()) throw new CommercialError('This identifier belongs to different campaign instructions. Check the original campaign.', 'INVALID_RETRY')
      return existing.id
    }
    const terms = commercialTerms('sponsorship'), period = campaignPeriod(new Date(data.startsAt), terms.serviceDays)
    await lockRecord(tx, 'listing', data.listingId)
    const listing = await tx.listing.findFirst({ where: { id: data.listingId, lister_id: userId, listing_status: 'active', OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: { id: true } })
    if (!listing) throw new CommercialError('Only your current public listing can receive sponsorship.', 'CAMPAIGN_LISTING_UNAVAILABLE')
    if (await tx.sponsoredCampaign.count({ where: { user_id: userId, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 10) throw new CommercialError('You have reached the daily campaign-request limit.', 'COMMERCIAL_RATE_LIMITED', 429)
    const overlap = await tx.sponsoredCampaign.findFirst({ where: { listing_id: data.listingId, status: { in: ['draft', 'pending_review', 'approved', 'paused'] },
      starts_at: { lt: period.endsAt }, ends_at: { gt: period.startsAt } }, select: { id: true } })
    if (overlap) throw new CommercialError('Review the existing campaign for this listing and period first.', 'CAMPAIGN_PERIOD_EXISTS')
    const campaign = await tx.sponsoredCampaign.create({ data: { id: data.clientId, user_id: userId, listing_id: data.listingId, headline: data.headline,
      billing_environment: terms.billingEnvironment, starts_at: period.startsAt, ends_at: period.endsAt, order_id: null } })
    return campaign.id
  })
}
export async function changeSponsoredCampaign(userId: string, id: string, operation: 'submit' | 'pause' | 'cancel'): Promise<void> {
  await assertCommercialReady(); z.uuid().parse(id)
  z.enum(['submit', 'pause', 'cancel']).parse(operation)
  await withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId]); await lockRecord(tx, 'sponsoredCampaign', id)
    const campaign = await tx.sponsoredCampaign.findUnique({ where: { id } })
    if (!campaign || campaign.user_id !== userId) throw new CommercialError('This campaign is unavailable.', 'NOT_FOUND', 404)
    if (campaign.status === 'cancelled') {
      if (operation === 'cancel') return
      throw new CommercialError('A cancelled campaign cannot be reopened. Create a new reviewed campaign.', 'CAMPAIGN_CLOSED')
    }
    if (operation === 'pause' && !['approved', 'pending_review'].includes(campaign.status)) throw new CommercialError('Only an approved campaign or pending review can be paused.', 'CAMPAIGN_PAUSE_UNAVAILABLE')
    if (operation === 'submit') {
      if (!['draft', 'paused'].includes(campaign.status) || campaign.ends_at <= new Date()) throw new CommercialError('Choose a current draft or paused campaign for independent review.', 'CAMPAIGN_SUBMIT_UNAVAILABLE')
      const listing = await tx.listing.findFirst({ where: { id: campaign.listing_id, lister_id: userId, listing_status: 'active', OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: { id: true } })
      if (!listing) throw new CommercialError('The listing must currently be public before campaign review.', 'CAMPAIGN_LISTING_UNAVAILABLE')
    }
    await tx.sponsoredCampaign.update({ where: { id }, data: { status: operation === 'submit' ? 'pending_review' : operation === 'pause' ? 'paused' : 'cancelled' } })
    // A pause/cancellation does not move money or imply a refund.
  })
}
export async function reviewSponsoredCampaign(actorId: string, id: string, input: unknown): Promise<void> {
  await assertCommercialReady(); z.uuid().parse(id)
  const data = campaignDecisionSchema.parse(input)
  await withTransaction(async tx => {
    const initial = await tx.sponsoredCampaign.findUnique({ where: { id }, select: { user_id: true } })
    if (!initial) throw new CommercialError('This campaign is unavailable.', 'NOT_FOUND', 404)
    await assertActiveAccounts(tx, [initial.user_id]); await lockRecord(tx, 'sponsoredCampaign', id)
    await assertStaffPermission(tx, actorId, 'ad:review')
    if (actorId === initial.user_id) throw new CommercialError('A different staff reviewer must decide your campaign.', 'INDEPENDENT_REVIEW_REQUIRED')
    const campaign = await tx.sponsoredCampaign.findUnique({ where: { id } })
    if (!campaign || (data.decision === 'pause' ? campaign.status !== 'approved' : campaign.status !== 'pending_review')) throw new CommercialError('Refresh the current campaign review state.', 'CAMPAIGN_REVIEW_CHANGED')
    const listing = await tx.listing.findFirst({ where: { id: campaign.listing_id, lister_id: initial.user_id, listing_status: 'active', OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: { id: true } })
    if (data.decision === 'approve' && (!listing || campaign.ends_at <= new Date())) throw new CommercialError('The campaign needs a current public listing and an unexpired period.', 'CAMPAIGN_LISTING_UNAVAILABLE')
    await tx.sponsoredCampaign.update({ where: { id }, data: { status: data.decision === 'approve' ? 'approved' : data.decision === 'reject' ? 'rejected' : 'paused', reviewed_by: actorId, reviewed_at: new Date(), decision_reason: data.reason } })
    await tx.adminAudit.create({ data: { actor_id: actorId, action: `campaign_${data.decision}`, target_type: 'sponsored_campaign', target_id: id, reason: data.reason, metadata: { moneyMoved: false } } })
    await tx.notification.create({ data: { user_id: initial.user_id, kind: 'campaign_review', title: 'Your sponsored campaign has a review update',
      body: 'Open your campaign history to read the decision. Review does not confirm a payment or refund.', href: '/marketplace/campaigns' } })
  })
}
