import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { getOwnBlockState, setBlocked } from '@/lib/social/service'
export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { platform: true }); return apiSuccess(await getOwnBlockState(identity.userId, (await context.params).id)) }
  catch (error) { return apiFailure(error, 'people/block') }
}
export async function POST(request: Request, context: Context): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { platform: true, mutation: true }); return apiSuccess(await setBlocked(identity.userId, (await context.params).id, await readApiJson(request, 2048))) }
  catch (error) { return apiFailure(error, 'people/block') }
}
