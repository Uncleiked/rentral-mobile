import { platformEnabled } from '@/lib/platform'
import { paystackEnvironment } from './providers/paystack/client'
import { PaymentCallbackConfigurationError } from './environment'

export function paymentsEnabled(): boolean {
  if (!platformEnabled() || process.env.PAYMENTS_ENABLED !== 'true') return false
  try {
    paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim())
    return true
  } catch { return false }
}

export function paymentCallbackUrl(bookingId: string | null): string {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    const environment = paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim())
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || ((process.env.NODE_ENV === 'production' || environment === 'live') && origin.protocol !== 'https:')) throw new Error('Invalid callback origin')
    return new URL(bookingId ? `/marketplace/bookings/${bookingId}` : '/marketplace/listing', origin).href
  } catch { throw new PaymentCallbackConfigurationError() }
}
