import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSuccess } from '@/lib/api/http'
import { participantBooking } from '@/lib/api/bookings-actions'
import { bookingFeedbackForApi } from '@/lib/api/trust'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const id = z.uuid().parse((await params).id)
    await participantBooking(id, identity.userId)
    return apiSuccess(await bookingFeedbackForApi(identity.userId, id))
  } catch (error) { return apiFailure(error, 'booking-feedback') }
}
