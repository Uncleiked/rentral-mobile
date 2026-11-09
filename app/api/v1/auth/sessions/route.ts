import { apiSuccess } from '@/lib/api/http'
import { authFailure } from '@/lib/auth/api'
import { expireSecurityCookies, requireSecurityIdentity } from '@/lib/auth/security-api'
import { getAccountSessions, revokeAccountSessions } from '@/lib/auth/account-security'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireSecurityIdentity(request)
    return apiSuccess(await getAccountSessions(identity.userId, identity.sessionId, new URL(request.url).searchParams.get('cursor') ?? undefined))
  } catch (error) { return authFailure(error) }
}
export async function DELETE(request: Request): Promise<Response> {
  try {
    const identity = await requireSecurityIdentity(request, true)
    await revokeAccountSessions(identity.userId)
    await expireSecurityCookies()
    return apiSuccess({ revoked: true, signInRequired: true })
  } catch (error) { return authFailure(error) }
}
