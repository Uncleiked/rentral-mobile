import { z } from 'zod'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { authenticateAccess, revokeSession, revokeRefreshToken } from '@/lib/auth/service'
import { authFailure, authLimit } from '@/lib/auth/api'
import { AuthError } from '@/lib/auth/types'
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  try {
    authLimit(request)
    const header = request.headers.get('authorization')
    let sessionId: string | null = null
    if (header?.startsWith('Bearer ')) {
      try { sessionId = (await authenticateAccess(header.slice(7))).sessionId }
      catch (error) { if (!(error instanceof AuthError) || error.status !== 401) throw error }
    }
    if (sessionId) await revokeSession(sessionId)
    else {
      const input = z.object({ refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(await readApiJson(request))
      // Possession of the refresh capability permits revoking this one session,
      // including when its access JWT has already expired.
      await revokeRefreshToken(input.refreshToken)
    }
    return apiSuccess({ signedOut: true })
  } catch (error) { return authFailure(error) }
}
