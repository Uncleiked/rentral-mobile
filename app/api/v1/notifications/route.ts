import { requireApiIdentity } from '@/lib/api/auth'
import { archiveQuerySchema } from '@/lib/api/archive'
import { apiFailure, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { notificationsForApi } from '@/lib/api/notifications'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    return apiSuccess(await notificationsForApi(identity.userId, archiveQuerySchema.parse(apiSearchParams(request))))
  } catch (error) { return apiFailure(error, 'notifications') }
}
