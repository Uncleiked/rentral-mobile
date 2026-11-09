'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db'
import { requireVerifiedUserId } from '@/lib/action-helpers'
import { platformEnabled, PLATFORM_UNAVAILABLE, type ActionResult } from '@/lib/platform'
import { disputeSchema, renewalSchema, reviewSchema, reviewSubject } from '@/lib/trust/policy'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { bookingWindowAvailable } from '@/lib/bookings/availability'

export async function submitReviewAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = reviewSchema.safeParse(input)
    if (!data.success) return { success: false, error: 'Choose 1–5 stars and write at least 10 characters.' }
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to leave a review.' }
    await withTransaction(async tx => {
      await lockRecord(tx, 'booking', data.data.bookingId)
      const booking = await tx.booking.findFirst({ where: { id: data.data.bookingId,
        OR: [{ seeker_id: userId }, { lister_id: userId }] },
        select: { seeker_id: true, lister_id: true, status: true } })
      const subject = booking ? reviewSubject(userId, booking) : null
      if (!subject) throw new Error('INELIGIBLE')
      await tx.review.create({ data: { booking_id: data.data.bookingId, author_id: userId,
        subject_id: subject, rating: data.data.rating, comment: data.data.comment } })
      await tx.notification.create({ data: { user_id: subject, kind: 'review', title: 'A new review',
        body: 'A participant reviewed your completed booking.', href: '/marketplace/profile' } })
    })
    revalidatePath('/marketplace/bookings'); revalidatePath('/marketplace/profile')
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'Reviews are available once per participant after a completed booking.' } }
}

export async function openDisputeAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = disputeSchema.safeParse(input)
    if (!data.success) return { success: false, error: 'Explain the issue in 20–4000 characters.' }
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to report a problem.' }
    await withTransaction(async tx => {
      const scoped = await tx.booking.findFirst({ where: { id: data.data.bookingId, OR: [{ seeker_id: userId }, { lister_id: userId }] }, select: { listing_id: true } })
      if (!scoped) throw new Error('INELIGIBLE')
      // Match the listing -> booking lock order used by rental/payment changes.
      await lockRecord(tx, 'listing', scoped.listing_id)
      await lockRecord(tx, 'booking', data.data.bookingId)
      const booking = await tx.booking.findFirst({ where: { id: data.data.bookingId,
        OR: [{ seeker_id: userId }, { lister_id: userId }],
        status: { in: ['confirmed', 'completed', 'disputed'] } } })
      if (!booking || await tx.dispute.findFirst({ where: { booking_id: booking.id, opened_by: userId, status: 'open' }, select: { id: true } })) throw new Error('INELIGIBLE')
      if (!await bookingWindowAvailable(tx, booking)) throw new Error('INELIGIBLE')
      await tx.dispute.create({ data: { booking_id: booking.id, opened_by: userId, reason: data.data.reason } })
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'disputed' } })
    })
    revalidatePath('/marketplace/bookings'); revalidatePath('/marketplace/support')
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'A report could not be opened. Check the booking or your existing report and try again.' } }
}

export async function submitRenewalAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = renewalSchema.safeParse(input)
    if (!data.success) return { success: false, error: 'Enter a valid payment reference and recipient route.' }
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to log a renewal.' }
    const booking = await prisma.booking.findFirst({ where: { id: data.data.bookingId, seeker_id: userId,
      kind: 'rental', status: { in: ['confirmed', 'completed'] }, listing: { category: 'house' } }, select: { id: true } })
    if (!booking) return { success: false, error: 'Choose one of your residential rental bookings.' }
    await prisma.renewal.create({ data: { booking_id: booking.id, user_id: userId,
      reference: data.data.reference, recipient_route: data.data.recipientRoute, status: 'pending_review' } })
    revalidatePath('/marketplace/renewals')
    return { success: true, data: undefined }
  } catch { return { success: false, error: 'This reference could not be saved. It may already have been submitted.' } }
}
