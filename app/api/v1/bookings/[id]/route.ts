import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { publicBooking } from '@/lib/api/bookings'
import { getBookingForParticipant, changeBookingStatus } from '@/lib/bookings/service'
import { BOOKING_OPERATIONS } from '@/lib/bookings/policy'
import { bookingFailure, updatedBooking, participantBooking } from '@/lib/api/bookings-actions'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const id = z.uuid().parse((await params).id)
    const booking = await getBookingForParticipant(id, identity.userId)
    if (!booking) throw new ApiError(404, 'NOT_FOUND', 'This booking is unavailable.')
    return apiSuccess(publicBooking(booking, identity.userId))
  } catch (error) { return apiFailure(error, 'booking') }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let started = false
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const id = z.uuid().parse((await params).id)
    const input = z.object({ operation: z.enum(BOOKING_OPERATIONS) }).strict().parse(await readApiJson(request, 1024))
    await participantBooking(id, identity.userId)
    started = true
    await changeBookingStatus(identity.userId, id, input.operation)
    return apiSuccess(await updatedBooking(id, identity.userId))
  } catch (error) { return bookingFailure(error, 'booking-update', started) }
}
