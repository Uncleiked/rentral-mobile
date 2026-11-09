import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { requireSecurityIdentity, expireSecurityCookies } from '@/lib/auth/security-api'
import { AuthError } from '@/lib/auth/types'
import { closeAccount } from '@/lib/accounts/lifecycle'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireSecurityIdentity(request, true)
    await closeAccount(actor.userId, await readApiJson(request))
    await expireSecurityCookies()
    return apiSuccess({ closed: true, signInRequired: true })
  } catch (error) {
    if (error instanceof AuthError) return apiFailure(new ApiError(error.status, error.code, error.message), 'account.close')
    return apiFailure(error, 'account.close')
  }
}
