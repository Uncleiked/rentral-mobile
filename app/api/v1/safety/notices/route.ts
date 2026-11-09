import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { ownSafetyForApi } from '@/lib/api/safety'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    return apiSuccess(await ownSafetyForApi(identity.userId))
  } catch (error) { return apiFailure(error, 'safety-notices') }
}
