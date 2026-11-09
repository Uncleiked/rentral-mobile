import { z } from 'zod'
import { apiSuccess } from '@/lib/api/http'
import { authFailure } from '@/lib/auth/api'
import { expireSecurityCookies, requireSecurityIdentity } from '@/lib/auth/security-api'
import { revokeAccountSessions } from '@/lib/auth/account-security'

export const runtime = 'nodejs'
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireSecurityIdentity(request, true), id = z.string().uuid().parse((await context.params).id)
    await revokeAccountSessions(identity.userId, id)
    const current = id === identity.sessionId
    if (current) await expireSecurityCookies()
    return apiSuccess({ revoked: true, current })
  } catch (error) { return authFailure(error) }
}
