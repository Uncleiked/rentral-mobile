import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { adminFailure, adminIdSchema } from '@/lib/api/admin'
import { getAdminListing } from '@/lib/operations/admin-console'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { admission: false, platform: true }); return apiSuccess(await getAdminListing(identity.userId, adminIdSchema.parse((await params).id))) }
  catch (error) { return adminFailure(error, 'admin-listing') }
}
