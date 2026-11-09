import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { quoteBookingForApi } from '@/lib/api/bookings-quote'
import { bookingFailure } from '@/lib/api/bookings-actions'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    return apiSuccess(await quoteBookingForApi(identity.userId, await readApiJson(request)))
  } catch (error) { return bookingFailure(error, 'booking-quote') }
}
