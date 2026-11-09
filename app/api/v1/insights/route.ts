import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { commercialFailure } from '@/lib/api/commerce'
import { commercialInsights } from '@/lib/commerce/insights'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); z.object({}).strict().parse(apiSearchParams(request)); return apiSuccess(await commercialInsights(actor.userId)) }
  catch (error) { return commercialFailure(error, 'insights') }
}
