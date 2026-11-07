import { platformEnabled } from '@/lib/platform'

export function paymentsEnabled(): boolean {
  return platformEnabled() && process.env.PAYMENTS_ENABLED === 'true' && Boolean(process.env.PAYSTACK_SECRET_KEY?.trim())
}

export function paymentCallbackUrl(bookingId: string | null): string {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('HTTPS application origin required.')
  return new URL(bookingId ? `/marketplace/bookings/${bookingId}` : '/marketplace/listing', origin).href
}
