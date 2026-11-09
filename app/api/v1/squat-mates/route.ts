import { requireApiIdentity } from '@/lib/api/auth'
import { archiveQuerySchema } from '@/lib/api/archive'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { matchingFailure } from '@/lib/api/matching'
import { matchingCandidates } from '@/lib/matching/profiles'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await matchingCandidates(actor.userId, archiveQuerySchema.parse(apiSearchParams(request)))) }
  catch (error) { return matchingFailure(error, 'squat-mates') }
}
