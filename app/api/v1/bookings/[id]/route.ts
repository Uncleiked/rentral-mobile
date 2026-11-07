import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess } from '@/lib/api/http'
import { publicBooking } from '@/lib/api/bookings'
import { getBookingForParticipant } from '@/lib/bookings/service'

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
