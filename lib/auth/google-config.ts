import { AuthError } from './types'
import { inspectGoogleSettings, type GoogleConfiguration } from './google-settings'

export type { GoogleConfiguration } from './google-settings'
export function googleConfigurationCheck() {
  return inspectGoogleSettings({
    GOOGLE_AUTH_ENABLED: process.env.GOOGLE_AUTH_ENABLED,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  })
}
export function googleConfiguration(): GoogleConfiguration | null {
  return googleConfigurationCheck().configuration
}
export function requireGoogleConfiguration(): GoogleConfiguration {
  const configuration = googleConfiguration()
  if (!configuration) throw new AuthError(503, 'GOOGLE_UNAVAILABLE', 'Google sign-in is not configured. You can still use your email and password.')
  return configuration
}
