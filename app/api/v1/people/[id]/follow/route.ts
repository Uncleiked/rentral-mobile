import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { setFollowing } from '@/lib/social/service'
export const runtime = 'nodejs'
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { platform: true, mutation: true }); return apiSuccess(await setFollowing(identity.userId, (await context.params).id, await readApiJson(request, 2048))) }
  catch (error) { return apiFailure(error, 'people/follow') }
}

