import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { getConnections } from '@/lib/social/people'
export const runtime = 'nodejs'
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { platform: true }); return apiSuccess(await getConnections(identity.userId, (await context.params).id, apiSearchParams(request))) }
  catch (error) { return apiFailure(error, 'people/connections') }
}

