import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { bookingFailure, bookingRouteId, participantBooking, updatedBooking, type BookingRouteContext } from '@/lib/api/bookings-actions'
import { checkInSchema } from '@/lib/bookings/policy'
import { checkInBooking } from '@/lib/bookings/service'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: BookingRouteContext): Promise<Response> {
  let started = false
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const id = bookingRouteId.parse((await params).id)
    const input = checkInSchema.parse(await readApiJson(request, 2048))
    await participantBooking(id, identity.userId)
    started = true
    await checkInBooking(identity.userId, id, input)
    return apiSuccess(await updatedBooking(id, identity.userId))
  } catch (error) { return bookingFailure(error, 'booking-check-in', started) }
}
