import { z } from 'zod'
import { platformEnabled } from '@/lib/platform'

export function pushEncryptionKey(): Buffer {
  const value = process.env.PUSH_TOKEN_ENCRYPTION_KEY?.trim() ?? ''
  const key = Buffer.from(value, 'base64')
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value) || key.length !== 32 || key.toString('base64') !== value) throw new Error('PUSH_KEY_UNAVAILABLE')
  return key
}
export function pushProjectId(): string | null {
  const project = z.uuid().safeParse(process.env.EXPO_PUBLIC_EAS_PROJECT_ID)
  return project.success ? project.data.toLowerCase() : null
}
export function pushConfiguration() {
  if (!platformEnabled() || process.env.PUSH_NOTIFICATIONS_ENABLED !== 'true') return null
  const cutoff = z.string().max(80).datetime({ offset: true }).safeParse(process.env.PUSH_NOTIFICATIONS_SINCE), projectId = pushProjectId()
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim() ?? ''
  if (!cutoff.success || !projectId || !/^[\x21-\x7e]{16,512}$/.test(accessToken)) return null
  try { pushEncryptionKey() } catch { return null }
  return { cutoff: new Date(cutoff.data), projectId, accessToken }
}
