import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { profileForApi, profileHandleSchema } from '@/lib/api/profiles'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }): Promise<Response> {
  try {
    await requireApiIdentity(request, { platform: true })
    return apiSuccess(await profileForApi(profileHandleSchema.parse((await params).username)))
  } catch (error) { return apiFailure(error, 'profile') }
}
