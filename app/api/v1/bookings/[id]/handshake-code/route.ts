import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiSuccess } from '@/lib/api/http'
import { bookingFailure, bookingRouteId, emptyBookingBody, participantBooking, type BookingRouteContext } from '@/lib/api/bookings-actions'
import { issueHandshakeCode } from '@/lib/bookings/service'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: BookingRouteContext): Promise<Response> {
  let started = false
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const id = bookingRouteId.parse((await params).id)
    await emptyBookingBody(request)
    const booking = await participantBooking(id, identity.userId)
    if (booking.seeker_id !== identity.userId) throw new ApiError(403, 'FORBIDDEN', 'Only the renter can generate this inspection code.')
    started = true
    const result = z.object({ code: z.string().regex(/^\d{6}$/) }).strict().safeParse({ code: await issueHandshakeCode(identity.userId, id) })
    if (!result.success) throw new ApiError(503, 'CODE_UNAVAILABLE', 'A valid inspection code could not be confirmed. Refresh the booking.')
    return apiSuccess(result.data)
  } catch (error) { return bookingFailure(error, 'booking-code', started) }
}
