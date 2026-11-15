import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { getListingLike, setListingLike } from '@/lib/social/service'
export const runtime = 'nodejs'
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { platform: true }); return apiSuccess(await getListingLike(identity.userId, (await context.params).id)) }
  catch (error) { return apiFailure(error, 'listings/like') }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { platform: true, mutation: true }); return apiSuccess(await setListingLike(identity.userId, (await context.params).id, await readApiJson(request, 2048))) }
  catch (error) { return apiFailure(error, 'listings/like') }
}

