import { requireApiIdentity } from '@/lib/api/auth'
import { archiveQuerySchema } from '@/lib/api/archive'
import { apiFailure, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { profileHandleSchema, profileReviewsForApi } from '@/lib/api/profiles'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }): Promise<Response> {
  try {
    await requireApiIdentity(request, { platform: true })
    const username = profileHandleSchema.parse((await params).username)
    return apiSuccess(await profileReviewsForApi(username, archiveQuerySchema.parse(apiSearchParams(request))))
  } catch (error) { return apiFailure(error, 'profile-reviews') }
}
