import type { AuthSession } from './types'
import { REFRESH_SECONDS } from './token'

export const ACCESS_COOKIE = 'rentral_access'
export const REFRESH_COOKIE = 'rentral_refresh'
export function sessionCookies(session: AuthSession) {
  const options = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }
  return [
    { ...options, name: ACCESS_COOKIE, value: session.access_token, maxAge: session.expires_in },
    { ...options, name: REFRESH_COOKIE, value: session.refresh_token, maxAge: REFRESH_SECONDS },
  ]
}
export function expiredCookies() {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map(name => ({ name, value: '', maxAge: 0, httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/' }))
}
