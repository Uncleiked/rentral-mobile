import { cookies } from 'next/headers'
import { authenticateAccess, loginAccount, registerAccount, requestPasswordReset, revokeRefreshToken, revokeAccessToken } from '@/lib/auth/service'
import { refreshWebSession } from '@/lib/auth/web-refresh'
import { ACCESS_COOKIE, REFRESH_COOKIE, expiredCookies, sessionCookies } from '@/lib/auth/cookies'
import { AuthError, type AuthSession } from '@/lib/auth/types'

/** Request-scoped JWT/cookie adapter shared by existing web actions and API guards. */
export async function createClient() {
  const store = await cookies()
  let issued: AuthSession | null = null
  function save(session: AuthSession): void {
    issued = session
    for (const cookie of sessionCookies(session)) store.set(cookie)
  }
  async function getUser(token?: string) {
    let attemptedRefresh = false
    try {
      const value = token ?? issued?.access_token ?? store.get(ACCESS_COOKIE)?.value
      if (!value) {
        const refresh = token === undefined ? store.get(REFRESH_COOKIE)?.value : null
        if (!refresh) return { data: { user: null }, error: null }
        attemptedRefresh = true
        const session = await refreshWebSession(refresh)
        save(session)
        const authenticated = await authenticateAccess(session.access_token)
        return { data: { user: authenticated.user, sessionId: authenticated.sessionId }, error: null }
      }
      const authenticated = await authenticateAccess(value)
      return { data: { user: authenticated.user, sessionId: authenticated.sessionId }, error: null }
    } catch (error) {
      if (!attemptedRefresh && token === undefined && error instanceof AuthError && error.status === 401 && store.get(REFRESH_COOKIE)?.value) {
        try {
          const session = await refreshWebSession(store.get(REFRESH_COOKIE)!.value)
          save(session)
          const authenticated = await authenticateAccess(session.access_token)
          return { data: { user: authenticated.user, sessionId: authenticated.sessionId }, error: null }
        } catch (refreshError) {
          return { data: { user: null }, error: refreshError instanceof AuthError ? refreshError : new AuthError(503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.') }
        }
      }
      return { data: { user: null }, error: error instanceof AuthError ? error : new AuthError(503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.') }
    }
  }
  return { auth: {
    getUser,
    async getSession() { const result = await getUser(); return { data: { session: result.data.user ? { user: result.data.user } : null }, error: result.error } },
    async signInWithPassword(input: { email: string; password: string }) {
      try { const session = await loginAccount(input); save(session); return { data: { session, user: session.user }, error: null } }
      catch (error) { return { data: { session: null, user: null }, error: error instanceof AuthError ? error : new AuthError(503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.') } }
    },
    async signUp(input: { email: string; password: string; accountType?: 'individual' | 'organization'; options?: { emailRedirectTo?: string } }) {
      try { const session = await registerAccount({ email: input.email, password: input.password, accountType: input.accountType }); save(session); return { data: { session, user: session.user }, error: null } }
      catch (error) { return { data: { session: null, user: null }, error: error instanceof AuthError ? error : new AuthError(503, 'AUTH_UNAVAILABLE', 'Account creation is temporarily unavailable.') } }
    },
    async signOut() {
      try {
        const value = issued?.access_token ?? store.get(ACCESS_COOKIE)?.value
        let revoked = false
        if (value) {
          try { revoked = await revokeAccessToken(value) }
          catch (error) { if (!(error instanceof AuthError) || error.status !== 401) throw error }
        }
        if (!revoked) {
          const refresh = issued?.refresh_token ?? store.get(REFRESH_COOKIE)?.value
          if (refresh && !await revokeRefreshToken(refresh)) throw new AuthError(409, 'LOGOUT_UNCONFIRMED', 'Sign-out could not be confirmed because the session changed. Refresh account status and try again.')
        }
        for (const cookie of expiredCookies()) store.set(cookie)
        issued = null
        return { error: null }
      } catch (error) { return { error: error instanceof AuthError ? error : new AuthError(503, 'AUTH_UNAVAILABLE', 'Could not sign out. Please try again.') } }
    },
    async refreshSession() {
      try {
        const token = store.get(REFRESH_COOKIE)?.value
        if (!token) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
        const session = await refreshWebSession(token); save(session)
        return { data: { session }, error: null }
      } catch (error) { return { data: { session: null }, error: error instanceof AuthError ? error : new AuthError(503, 'AUTH_UNAVAILABLE', 'Sign-in is temporarily unavailable.') } }
    },
    async resetPasswordForEmail(email: string, _options?: { redirectTo?: string }) {
      void _options
      try { await requestPasswordReset(email); return { error: null } }
      catch (error) { return { error: error instanceof AuthError ? error : new AuthError(503, 'AUTH_UNAVAILABLE', 'Password recovery is temporarily unavailable.') } }
    },
    async updateUser(_input: { password?: string; email?: string }, _options?: { emailRedirectTo?: string }) {
      void _input; void _options
      return { error: new AuthError(400, 'CONFIRMATION_REQUIRED', 'Use a password reset code to change your password. Email changes require a configured confirmation service.') }
    },
    async exchangeCodeForSession(_code: string) { void _code; return { error: new AuthError(410, 'OAUTH_REMOVED', 'Use your email and password to sign in.') } },
  } }
}
