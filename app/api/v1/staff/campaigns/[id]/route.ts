import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { commercialFailure, type CommercialRouteContext } from '@/lib/api/commerce'
import { campaignDecisionSchema } from '@/lib/commerce/policy'
import { requireCampaignReviewer } from '@/lib/commerce/operations'
import { reviewSponsoredCampaign } from '@/lib/commerce/campaigns'
export const runtime = 'nodejs'
export async function PATCH(request: Request, { params }: CommercialRouteContext): Promise<Response> {
  let started = false
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = campaignDecisionSchema.parse(await readApiJson(request, 8192)); await requireCampaignReviewer(actor.userId); started = true
    await reviewSponsoredCampaign(actor.userId, id, input); return apiSuccess({ reviewed: true }) }
  catch (error) { return commercialFailure(error, 'staff-campaign-review', started) }
}
