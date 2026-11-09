import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { memberDashboard } from '@/lib/accounts/metrics'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const { userId } = await requireApiIdentity(request, { platform: true }); return apiSuccess(await memberDashboard(userId)) }
  catch (error) { return apiFailure(error, 'dashboard') }
}
