import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { commercialFailure } from '@/lib/api/commerce'
import { campaignQueueSchema, campaignReviewQueue } from '@/lib/commerce/operations'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await campaignReviewQueue(actor.userId, campaignQueueSchema.parse(apiSearchParams(request)))) }
  catch (error) { return commercialFailure(error, 'staff-campaigns') }
}
