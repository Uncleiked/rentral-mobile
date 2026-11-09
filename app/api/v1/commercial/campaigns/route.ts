import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { commercialFailure, commercialQuerySchema } from '@/lib/api/commerce'
import { createSponsoredCampaign } from '@/lib/commerce/campaigns'
import { commercialOverview, ownSponsoredCampaign } from '@/lib/commerce/views'
import { campaignInputSchema } from '@/lib/commerce/policy'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); const data = await commercialOverview(actor.userId, commercialQuerySchema.parse(apiSearchParams(request))); return apiSuccess({ items: data.campaigns, nextCursor: data.campaignsNextCursor }) }
  catch (error) { return commercialFailure(error, 'commercial-campaigns') }
}
export async function POST(request: Request): Promise<Response> {
  let started = false
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }); const input = campaignInputSchema.parse(await readApiJson(request, 4096)); started = true
    const id = await createSponsoredCampaign(actor.userId, input); return apiSuccess({ campaign: await ownSponsoredCampaign(actor.userId, id) }, 201) }
  catch (error) { return commercialFailure(error, 'commercial-campaign-create', started) }
}
