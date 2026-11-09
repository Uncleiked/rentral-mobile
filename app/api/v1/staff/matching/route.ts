import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { matchingFailure } from '@/lib/api/matching'
import { matchingStaffQueue, matchingStaffQuerySchema } from '@/lib/matching/operations'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await matchingStaffQueue(actor.userId, matchingStaffQuerySchema.parse(apiSearchParams(request)))) }
  catch (error) { return matchingFailure(error, 'staff-matching') }
}
