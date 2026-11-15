import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { searchPeople } from '@/lib/social/people'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { platform: true }); return apiSuccess(await searchPeople(identity.userId, apiSearchParams(request))) }
  catch (error) { return apiFailure(error, 'people') }
}

