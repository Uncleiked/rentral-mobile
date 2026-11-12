import { revalidatePath } from 'next/cache'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess, apiSearchParams, readApiJson } from '@/lib/api/http'
import { organizationQueue, searchOrganizationQueue, reviewOrganization } from '@/lib/organizations/service'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireApiIdentity(request, { admission: false })
    const input = apiSearchParams(request)
    return apiSuccess(await (Object.keys(input).length ? searchOrganizationQueue(actor.userId, input) : organizationQueue(actor.userId)))
  }
  catch (error) { return apiFailure(error, 'admin/organizations') }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireApiIdentity(request, { admission: false, mutation: true })
    const receipt = await reviewOrganization(actor.userId, await readApiJson(request))
    try { revalidatePath('/admin'); revalidatePath('/onboarding/organization'); revalidatePath('/marketplace') } catch { console.warn('[organizations] Decision committed; refresh the affected views.') }
    return apiSuccess(receipt)
  } catch (error) { return apiFailure(error, 'admin/organizations') }
}
