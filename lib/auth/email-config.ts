import { z } from 'zod'
import { AuthError } from './types'

export type AuthDelivery = 'email' | 'development-outbox'
export function emailEncryptionKey(value: string | undefined): Buffer {
  const raw = value?.trim() ?? ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new AuthError(503, 'RECOVERY_UNAVAILABLE', 'Account email delivery is not configured.')
  const key = Buffer.from(raw, 'base64url')
  if (key.length !== 32 || key.toString('base64url') !== raw) throw new AuthError(503, 'RECOVERY_UNAVAILABLE', 'Account email delivery is not configured.')
  return key
}

function sender(): string {
  const from = process.env.RENTRAL_EMAIL_FROM?.trim() ?? ''
  if (!from || from.length > 320 || /[\r\n]/.test(from)) throw new Error('Invalid sender.')
  const address = from.includes('<') ? /^(?:[^<>]{1,80})\s*<([^<>]+)>$/.exec(from)?.[1] : from
  z.string().email().max(254).parse(address)
  return from
}

/** Validate global configuration before looking up an address: errors cannot disclose account existence. */
export function authEmailConfiguration(): { delivery: AuthDelivery; from: string } {
  if (process.env.AUTH_EMAIL_ENABLED === 'true') {
    try {
      if (!process.env.RESEND_API_KEY?.trim() || /[\r\n]/.test(process.env.RESEND_API_KEY)) throw new Error()
      emailEncryptionKey(process.env.AUTH_EMAIL_ENCRYPTION_KEY)
      return { delivery: 'email', from: sender() }
    } catch { throw new AuthError(503, 'RECOVERY_UNAVAILABLE', 'Account email delivery is not configured.') }
  }
  if (process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_EMAIL_OUTBOX === 'true') return { delivery: 'development-outbox', from: 'Rentral <local@rentral.invalid>' }
  throw new AuthError(503, 'RECOVERY_UNAVAILABLE', 'Account email delivery is not configured. Contact the Rentral operator.')
}

export function availableAuthDelivery(): AuthDelivery | 'unavailable' {
  try { return authEmailConfiguration().delivery } catch { return 'unavailable' }
}
