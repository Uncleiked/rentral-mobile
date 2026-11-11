import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { adminFailure } from '@/lib/api/admin'
import { adminUserSearchSchema } from '@/lib/contracts/admin'
import { searchAdminUsers } from '@/lib/operations/admin-console'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { admission: false, platform: true }); const input = adminUserSearchSchema.parse(apiSearchParams(request)); return apiSuccess(await searchAdminUsers(identity.userId, input.query)) }
  catch (error) { return adminFailure(error, 'admin-users') }
}
