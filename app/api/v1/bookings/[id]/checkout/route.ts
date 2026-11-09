import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiSuccess } from '@/lib/api/http'
import { bookingFailure, bookingRouteId, checkoutResponseSchema, emptyBookingBody, participantBooking, requireBookingPayments, type BookingRouteContext } from '@/lib/api/bookings-actions'
import { startBookingPayment } from '@/lib/payments/service'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: BookingRouteContext): Promise<Response> {
  let started = false
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const id = bookingRouteId.parse((await params).id)
    await emptyBookingBody(request)
    const booking = await participantBooking(id, identity.userId)
    if (booking.seeker_id !== identity.userId) throw new ApiError(403, 'FORBIDDEN', 'Only the renter can open this booking checkout.')
    requireBookingPayments()
    started = true
    const result = checkoutResponseSchema.safeParse({ url: await startBookingPayment(identity.userId, id) })
    if (!result.success) throw new ApiError(502, 'CHECKOUT_UNCONFIRMED', 'Checkout could not be verified. Check payment status before trying again.')
    return apiSuccess(result.data)
  } catch (error) { return bookingFailure(error, 'booking-checkout', started) }
}
