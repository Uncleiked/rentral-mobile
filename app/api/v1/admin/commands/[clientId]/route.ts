import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { adminFailure, adminIdSchema } from '@/lib/api/admin'
import { getAdminCommandReceipt } from '@/lib/operations/admin-console'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }): Promise<Response> {
  try { const identity = await requireApiIdentity(request, { admission: false, platform: true }); return apiSuccess(await getAdminCommandReceipt(identity.userId, adminIdSchema.parse((await params).clientId))) }
  catch (error) { return adminFailure(error, 'admin-command-readback') }
}
