import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { adminFailure } from '@/lib/api/admin'
import { getAdminDashboard } from '@/lib/operations/admin-console'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { admission: false, platform: true }); return apiSuccess(await getAdminDashboard(identity.userId)) }
  catch (error) { return adminFailure(error, 'admin') }
}
