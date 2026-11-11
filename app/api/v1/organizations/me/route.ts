import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, apiFailure, readApiJson } from '@/lib/api/http'
import { myOrganization, submitOrganization } from '@/lib/organizations/service'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { admission: false }); return apiSuccess(await myOrganization(actor.userId)) }
  catch (error) { return apiFailure(error, 'organizations/me') }
}
export async function POST(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { admission: false, mutation: true }); return apiSuccess(await submitOrganization(actor.userId, await readApiJson(request))) }
  catch (error) { return apiFailure(error, 'organizations/me') }
}
