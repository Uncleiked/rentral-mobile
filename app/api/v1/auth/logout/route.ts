import { z } from 'zod'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { revokeAccessToken, revokeRefreshToken } from '@/lib/auth/service'
import { authFailure, authLimit } from '@/lib/auth/api'
import { AuthError } from '@/lib/auth/types'
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try {
    authLimit(request)
    const header = request.headers.get('authorization')
    let revoked = false
    if (header?.startsWith('Bearer ')) {
      try { revoked = await revokeAccessToken(header.slice(7)) }
      catch (error) { if (!(error instanceof AuthError) || error.status !== 401) throw error }
    }
    if (!revoked) {
      const input = z.object({ refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(await readApiJson(request))
      // Possession of the refresh capability permits revoking this one session,
      // including when its access JWT has already expired.
      if (!await revokeRefreshToken(input.refreshToken)) throw new AuthError(409, 'LOGOUT_UNCONFIRMED', 'Sign-out could not be confirmed because the session changed. Refresh account status and try again.')
    }
    return apiSuccess({ signedOut: true })
  } catch (error) { return authFailure(error) }
}
