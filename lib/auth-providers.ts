import { googleConfigurationCheck } from '@/lib/auth/google-config'
import { googleAuthPrepared } from '@/lib/database/readiness'
import { mongoReadinessFailure } from '@/lib/database/readiness-errors'

export async function getAuthProviders(): Promise<{ google: boolean; apple: boolean }> {
  const { configuration, issues } = googleConfigurationCheck()
  if (!configuration) {
    // Fixed reason codes only: never log settings, provider responses or errors.
    console.warn('[auth/google/readiness]', { reasons: issues.map(issue => issue.reason) })
    return { google: false, apple: false }
  }
  try {
    const google = await googleAuthPrepared()
    if (!google) console.warn('[auth/google/readiness]', { reasons: ['GOOGLE_DATABASE_SETUP_REQUIRED'] })
    return { google, apple: false }
  } catch (error) {
    const failure = mongoReadinessFailure(error)
    console.warn('[auth/google/readiness]', { reasons: [failure?.code ?? 'GOOGLE_DATABASE_CHECK_FAILED'] })
    return { google: false, apple: false }
  }
}
