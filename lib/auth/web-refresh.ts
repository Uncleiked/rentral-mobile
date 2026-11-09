import { refreshSession } from './service'
import { tokenHash } from './token'
import { AuthError, type AuthSession } from './types'

const pending = new Map<string, Promise<AuthSession>>()
const MAX_PENDING = 128

/** Cookie requests in one server process share only an in-flight rotation.
 * The bearer refresh endpoint keeps its strict, single-use compare-and-swap.
 */
export async function refreshWebSession(refreshToken: string): Promise<AuthSession> {
  const key = tokenHash(refreshToken)
  const existing = pending.get(key)
  if (existing) return existing
  if (pending.size >= MAX_PENDING) throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again.')
  const work = refreshSession(refreshToken)
  pending.set(key, work)
  try { return await work }
  finally { if (pending.get(key) === work) pending.delete(key) }
}
