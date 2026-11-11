/** Pure validation shared by Next runtime and the offline environment checker. */
export type GoogleConfiguration = { clientId: string; clientSecret: string; origin: string; callback: string }
type GoogleSettingKey = 'GOOGLE_AUTH_ENABLED' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'NEXT_PUBLIC_APP_URL'
export type GoogleSettingIssue = {
  key: GoogleSettingKey
  reason: 'GOOGLE_AUTH_NOT_ENABLED' | 'GOOGLE_CLIENT_ID_INVALID' | 'GOOGLE_CLIENT_SECRET_INVALID' | 'NEXT_PUBLIC_APP_URL_INVALID'
  message: string
}
export function inspectGoogleSettings(environment: Record<string, string | undefined>): { configuration: GoogleConfiguration | null; issues: GoogleSettingIssue[] } {
  const issues: GoogleSettingIssue[] = []
  if (environment.GOOGLE_AUTH_ENABLED !== 'true') {
    issues.push({ key: 'GOOGLE_AUTH_ENABLED', reason: 'GOOGLE_AUTH_NOT_ENABLED', message: 'Use exactly true to enable Google sign-in.' })
  }
  const clientId = environment.GOOGLE_CLIENT_ID?.trim() ?? ''
  const clientSecret = environment.GOOGLE_CLIENT_SECRET?.trim() ?? ''
  if (!/^[A-Za-z0-9._-]{10,250}\.apps\.googleusercontent\.com$/.test(clientId)) {
    issues.push({ key: 'GOOGLE_CLIENT_ID', reason: 'GOOGLE_CLIENT_ID_INVALID', message: 'Use the complete Web application OAuth client ID, without quotes or a key=value prefix.' })
  }
  if (!clientSecret || clientSecret.length > 500 || /\s/.test(clientSecret)) {
    issues.push({ key: 'GOOGLE_CLIENT_SECRET', reason: 'GOOGLE_CLIENT_SECRET_INVALID', message: 'Use only the Web application client secret, without quotes, spaces or a key=value prefix.' })
  }
  let origin = ''
  try {
    const app = new URL(environment.NEXT_PUBLIC_APP_URL ?? '')
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname)
    if (app.username || app.password || app.search || app.hash || app.pathname !== '/' ||
        (app.protocol !== 'https:' && !(app.protocol === 'http:' && loopback))) throw new Error('Invalid origin')
    origin = app.origin
  } catch {
    issues.push({ key: 'NEXT_PUBLIC_APP_URL', reason: 'NEXT_PUBLIC_APP_URL_INVALID', message: 'Use the HTTPS web origin only; HTTP is allowed only for localhost. NEXT_APP_URL is not used.' })
  }
  return { issues, configuration: issues.length ? null : { clientId, clientSecret, origin, callback: new URL('/auth/google/callback', origin).href } }
}
