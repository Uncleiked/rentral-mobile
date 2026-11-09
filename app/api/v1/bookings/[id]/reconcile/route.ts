import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiSuccess, readApiJson } from '@/lib/api/http'
import { bookingFailure, bookingRouteId, participantBooking, paymentReferenceSchema, paymentStatusSchema, requireBookingPaymentReference, requireBookingPayments, type BookingRouteContext } from '@/lib/api/bookings-actions'
import { reconcilePayment } from '@/lib/payments/service'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: BookingRouteContext): Promise<Response> {
  let started = false
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const id = bookingRouteId.parse((await params).id)
    const input = z.object({ reference: paymentReferenceSchema }).strict().parse(await readApiJson(request, 1024))
    const booking = await participantBooking(id, identity.userId)
    if (booking.seeker_id !== identity.userId) throw new ApiError(403, 'FORBIDDEN', 'Only the renter can reconcile this booking payment.')
    await requireBookingPaymentReference(id, identity.userId, input.reference)
    requireBookingPayments()
    started = true
    const result = paymentStatusSchema.safeParse({ status: await reconcilePayment(identity.userId, input.reference) })
    if (!result.success) throw new ApiError(503, 'PAYMENT_STATUS_UNAVAILABLE', 'Payment status could not be verified. Do not pay again.')
    return apiSuccess(result.data)
  } catch (error) { return bookingFailure(error, 'booking-reconcile', started) }
}
