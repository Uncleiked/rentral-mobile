import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { bookingReportInputSchema, trustFailure } from '@/lib/api/trust'
import { participantBooking } from '@/lib/api/bookings-actions'
import { openBookingReport } from '@/lib/trust/service'

export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let started = false
  try {
    const identity = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const id = z.uuid().parse((await params).id)
    const input = bookingReportInputSchema.parse(await readApiJson(request, 24576))
    await participantBooking(id, identity.userId)
    started = true
    await openBookingReport(identity.userId, { ...input, bookingId: id })
    revalidatePath('/marketplace/bookings'); revalidatePath('/marketplace/support')
    return apiSuccess({ submitted: true }, 201)
  } catch (error) { return trustFailure(error, 'booking-report', started) }
}
