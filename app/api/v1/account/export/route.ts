import { apiFailure, apiSuccess, ApiError } from '@/lib/api/http'
import { requireApiIdentity } from '@/lib/api/auth'
import { exportAccountPage } from '@/lib/accounts/export'
import { AuthError } from '@/lib/auth/types'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireApiIdentity(request, { admission: false })
    const params = new URL(request.url).searchParams
    if ([...params.keys()].some(key => !['resource', 'cursor', 'limit'].includes(key)) || [...params.keys()].some(key => params.getAll(key).length !== 1)) throw new ApiError(400, 'INVALID_REQUEST', 'Choose a valid export resource and page.')
    const result = await exportAccountPage(actor.userId, Object.fromEntries(params))
    const response = apiSuccess(result)
    response.headers.set('Content-Disposition', 'attachment; filename="rentral-account-page.json"')
    return response
  } catch (error) {
    if (error instanceof AuthError) return apiFailure(new ApiError(error.status, error.code, error.message), 'account.export')
    return apiFailure(error, 'account.export')
  }
}
