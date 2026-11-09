'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireVerifiedUserId } from '@/lib/action-helpers'
import { platformEnabled, PLATFORM_UNAVAILABLE, type ActionResult } from '@/lib/platform'
import { BOOKING_OPERATIONS, BookingError } from '@/lib/bookings/policy'
import { requestBooking, changeBookingStatus, checkInBooking, issueHandshakeCode } from '@/lib/bookings/service'

function fail(error: unknown): ActionResult<never> {
  console.error('[actions/bookingActions] Booking operation failed', error instanceof Error ? error.name : 'UnknownError')
  return { success: false, error: error instanceof z.ZodError ? 'Check your dates and booking details.' : error instanceof BookingError ? error.message : 'This booking could not be updated. The dates may no longer be available.' }
}

export async function requestBookingAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to book.' }
    const id = await requestBooking(userId, input)
    revalidatePath('/marketplace/bookings')
    return { success: true, data: { id } }
  } catch (error) { return fail(error) }
}

export async function updateBookingAction(id: string, operation: unknown): Promise<ActionResult> {
  if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to manage bookings.' }
    await changeBookingStatus(userId, z.string().uuid().parse(id), z.enum(BOOKING_OPERATIONS).parse(operation))
    revalidatePath('/marketplace/bookings'); revalidatePath(`/marketplace/bookings/${id}`)
    return { success: true, data: undefined }
  } catch (error) { return fail(error) }
}

export async function checkInBookingAction(id: string, input: unknown): Promise<ActionResult> {
  if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to check in.' }
    await checkInBooking(userId, z.string().uuid().parse(id), input)
    revalidatePath(`/marketplace/bookings/${id}`)
    return { success: true, data: undefined }
  } catch (error) { return fail(error) }
}

export async function issueHandshakeCodeAction(id: string): Promise<ActionResult<string>> {
  if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to check in.' }
    return { success: true, data: await issueHandshakeCode(userId, z.string().uuid().parse(id)) }
  } catch (error) { return fail(error) }
}
