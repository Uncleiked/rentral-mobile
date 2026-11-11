import { googleConfiguration } from '@/lib/auth/google-config'
import { googleAuthPrepared } from '@/lib/database/readiness'

export async function getAuthProviders(): Promise<{ google: boolean; apple: boolean }> {
  if (!googleConfiguration()) return { google: false, apple: false }
  return { google: await googleAuthPrepared().catch(() => false), apple: false }
}
