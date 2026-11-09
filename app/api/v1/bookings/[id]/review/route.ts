import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { bookingReviewInputSchema, trustFailure } from '@/lib/api/trust'
import { participantBooking } from '@/lib/api/bookings-actions'
import { submitBookingReview } from '@/lib/trust/service'

export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let started = false
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const id = z.uuid().parse((await params).id)
    const input = bookingReviewInputSchema.parse(await readApiJson(request, 12288))
    await participantBooking(id, identity.userId)
    started = true
    await submitBookingReview(identity.userId, { ...input, bookingId: id })
    revalidatePath('/marketplace/bookings'); revalidatePath('/marketplace/profile')
    return apiSuccess({ submitted: true }, 201)
  } catch (error) { return trustFailure(error, 'booking-review', started) }
}
