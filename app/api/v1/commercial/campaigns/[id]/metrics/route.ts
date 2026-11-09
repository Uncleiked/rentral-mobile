import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { commercialFailure, type CommercialRouteContext } from '@/lib/api/commerce'
import { campaignMetrics } from '@/lib/commerce/metrics'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: CommercialRouteContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await campaignMetrics(actor.userId, z.uuid().parse((await params).id))) }
  catch (error) { return commercialFailure(error, 'campaign-metrics') }
}
