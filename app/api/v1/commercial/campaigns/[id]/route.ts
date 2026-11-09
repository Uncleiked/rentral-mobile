import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { commercialFailure, type CommercialRouteContext } from '@/lib/api/commerce'
import { changeSponsoredCampaign } from '@/lib/commerce/campaigns'
import { ownSponsoredCampaign } from '@/lib/commerce/views'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: CommercialRouteContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess({ campaign: await ownSponsoredCampaign(actor.userId, z.uuid().parse((await params).id)) }) }
  catch (error) { return commercialFailure(error, 'commercial-campaign') }
}
export async function PATCH(request: Request, { params }: CommercialRouteContext): Promise<Response> {
  let started = false
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = z.object({ operation: z.enum(['submit', 'pause', 'cancel']) }).strict().parse(await readApiJson(request, 1024)); started = true
    await changeSponsoredCampaign(actor.userId, id, input.operation); return apiSuccess({ campaign: await ownSponsoredCampaign(actor.userId, id) }) }
  catch (error) { return commercialFailure(error, 'commercial-campaign-update', started) }
}
