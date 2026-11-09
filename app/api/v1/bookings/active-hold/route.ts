import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiFailure, apiSearchParams, apiSuccess } from '@/lib/api/http'
import { publicBooking } from '@/lib/api/bookings'
import { getOwnActiveHold } from '@/lib/bookings/service'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const input = z.object({ listingId: z.uuid() }).strict().parse(apiSearchParams(request))
    const hold = await getOwnActiveHold(input.listingId, identity.userId)
    return apiSuccess(hold ? publicBooking(hold, identity.userId) : null)
  } catch (error) { return apiFailure(error, 'booking-active-hold') }
}
