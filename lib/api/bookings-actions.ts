import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db'
import { getBookingForParticipant } from '@/lib/bookings/service'
import { BookingError } from '@/lib/bookings/policy'
import { paymentsEnabled } from '@/lib/payments/config'
import { PaymentCallbackConfigurationError, PaymentEnvironmentMismatchError } from '@/lib/payments/environment'
import { ApiError, apiFailure, readApiJson } from './http'
import { publicBooking } from './bookings'

export const bookingRouteId = z.uuid()
export type BookingRouteContext = { params: Promise<{ id: string }> }

export async function participantBooking(id: string, userId: string) {
  const booking = await getBookingForParticipant(id, userId)
  if (!booking) throw new ApiError(404, 'NOT_FOUND', 'This booking is unavailable.')
  return booking
}
export async function updatedBooking(id: string, userId: string) {
  revalidatePath('/marketplace/bookings'); revalidatePath(`/marketplace/bookings/${id}`)
  return publicBooking(await participantBooking(id, userId), userId)
}
export async function emptyBookingBody(request: Request): Promise<void> {
  if (request.body) z.object({}).strict().parse(await readApiJson(request, 1024))
}
export function requireBookingPayments(): void {
  if (!paymentsEnabled()) throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'Online payments are being prepared. Your booking remains unpaid.')
}
export function bookingFailure(error: unknown, scope: string, uncertain = false): Response {
  if (error instanceof PaymentCallbackConfigurationError) return apiFailure(new ApiError(503, error.code, error.message), scope)
  if (error instanceof PaymentEnvironmentMismatchError) return apiFailure(new ApiError(409, error.code, error.message), scope)
  if (error instanceof BookingError) return apiFailure(new ApiError(409, 'BOOKING_UNAVAILABLE', error.message), scope)
  if (uncertain && !(error instanceof ApiError) && !(error instanceof z.ZodError)) {
    return apiFailure(new ApiError(503, 'BOOKING_UPDATE_UNCONFIRMED', 'The update could not be confirmed. Refresh the booking before trying again.'), scope)
  }
  return apiFailure(error, scope)
}
export async function requireBookingPaymentReference(id: string, userId: string, reference: string): Promise<void> {
  const intent = await prisma.paymentIntent.findFirst({ where: { booking_id: id, user_id: userId, reference, kind: 'booking' }, select: { id: true } })
  if (!intent) throw new ApiError(404, 'NOT_FOUND', 'This booking payment is unavailable.')
}
export const checkoutResponseSchema = z.object({ url: z.string().max(2000).url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:' && url.hostname === 'checkout.paystack.com' && !url.username && !url.password && !url.port
}) }).strict()
export const paymentReferenceSchema = z.string().regex(/^rentral-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
export const paymentStatusSchema = z.object({ status: z.string().min(1).max(40).regex(/^[a-z_]+$/) }).strict()
