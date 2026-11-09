import { cookies } from 'next/headers'
import { requireApiIdentity } from '@/lib/api/auth'
import { ACCESS_COOKIE, expiredCookies } from './cookies'
import { accessClaims } from './token'
import { AuthError } from './types'

export async function requireSecurityIdentity(request: Request, mutation = false): Promise<{ userId: string; sessionId: string }> {
  const identity = await requireApiIdentity(request, { mutation, ...(mutation ? { verified: true } : {}) })
  const token = identity.mode === 'bearer' ? request.headers.get('authorization')?.slice(7) : (await cookies()).get(ACCESS_COOKIE)?.value
  if (!token) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  // Identity verification already checked the live session. Decode its signed SID without returning a secret to UI.
  const claims = await accessClaims(token)
  if (claims.userId !== identity.userId) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  return claims
}

export async function expireSecurityCookies(): Promise<void> {
  const store = await cookies()
  for (const cookie of expiredCookies()) store.set(cookie)
}
