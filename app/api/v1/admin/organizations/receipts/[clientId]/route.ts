import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { organizationReceipt } from '@/lib/organizations/service'
export const runtime = 'nodejs'
export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { admission: false }); const id = z.uuid().parse((await context.params).clientId); return apiSuccess(await organizationReceipt(actor.userId, 'organization_review', id)) }
  catch (error) { return apiFailure(error, 'admin/organization-receipt') }
}
