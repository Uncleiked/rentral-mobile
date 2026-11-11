import { AuthError } from './types'

export type GoogleConfiguration = { clientId: string; clientSecret: string; origin: string; callback: string }
export function googleConfiguration(): GoogleConfiguration | null {
  if (process.env.GOOGLE_AUTH_ENABLED !== 'true') return null
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? ''
  if (!/^[A-Za-z0-9._-]{10,250}\.apps\.googleusercontent\.com$/.test(clientId) || !clientSecret || clientSecret.length > 500 || /\s/.test(clientSecret)) return null
  try {
    const app = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '')
    if (app.username || app.password || app.search || app.hash || app.pathname !== '/') return null
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname)
    if (app.protocol !== 'https:' && !(app.protocol === 'http:' && loopback)) return null
    return { clientId, clientSecret, origin: app.origin, callback: new URL('/auth/google/callback', app.origin).href }
  } catch { return null }
}
export function requireGoogleConfiguration(): GoogleConfiguration {
  const configuration = googleConfiguration()
  if (!configuration) throw new AuthError(503, 'GOOGLE_UNAVAILABLE', 'Google sign-in is not configured. You can still use your email and password.')
  return configuration
}
