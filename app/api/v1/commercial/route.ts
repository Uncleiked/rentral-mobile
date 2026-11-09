import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { commercialFailure, commercialQuerySchema } from '@/lib/api/commerce'
import { commercialOverview } from '@/lib/commerce/views'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await commercialOverview(actor.userId, commercialQuerySchema.parse(apiSearchParams(request)))) }
  catch (error) { return commercialFailure(error, 'commercial') }
}
