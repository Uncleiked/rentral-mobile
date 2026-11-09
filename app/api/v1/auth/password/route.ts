import { apiSuccess, readApiJson } from '@/lib/api/http'
import { authFailure } from '@/lib/auth/api'
import { expireSecurityCookies, requireSecurityIdentity } from '@/lib/auth/security-api'
import { changeAccountPassword } from '@/lib/auth/account-security'

export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireSecurityIdentity(request, true)
    await changeAccountPassword(identity.userId, await readApiJson(request))
    await expireSecurityCookies()
    return apiSuccess({ changed: true, signInRequired: true })
  } catch (error) { return authFailure(error) }
}
