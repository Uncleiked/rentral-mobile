import { revalidatePath } from 'next/cache'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, apiSuccess, readApiJson } from '@/lib/api/http'
import { publicBooking } from '@/lib/api/bookings'
import { getBookingsForUser, requestBooking } from '@/lib/bookings/service'
import { BookingError, bookingRequestSchema } from '@/lib/bookings/policy'
import { MutationConflictError } from '@/lib/database/mutations'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true })
    const bookings = await getBookingsForUser(identity.userId)
    return apiSuccess({ items: bookings.map(booking => publicBooking(booking, identity.userId)), limit: 100 })
  } catch (error) { return apiFailure(error, 'bookings') }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const input = bookingRequestSchema.parse(await readApiJson(request))
    const id = await requestBooking(identity.userId, input)
    revalidatePath('/marketplace/bookings')
    return apiSuccess({ id }, 201)
  } catch (error) { return apiFailure(error instanceof MutationConflictError ? new ApiError(409, error.code, error.message)
    : error instanceof BookingError ? new ApiError(400, 'BOOKING_UNAVAILABLE', error.message) : error, 'bookings') }
}
