import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { getPerson } from '@/lib/social/people'
export const runtime = 'nodejs'
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { platform: true }); return apiSuccess(await getPerson(identity.userId, (await context.params).id)) }
  catch (error) { return apiFailure(error, 'people/member') }
}

