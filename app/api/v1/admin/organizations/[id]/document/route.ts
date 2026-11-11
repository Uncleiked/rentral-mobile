import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { organizationDocument } from '@/lib/organizations/service'
export const runtime = 'nodejs'
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await requireApiIdentity(request, { admission: false })
    const id = z.uuid().parse((await context.params).id)
    const support = new URL(request.url).searchParams.get('supporting') === '1'
    return apiSuccess(await organizationDocument(actor.userId, id, support))
  } catch (error) { return apiFailure(error, 'admin/organization-document') }
}
