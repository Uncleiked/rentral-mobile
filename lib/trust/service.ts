import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { bookingWindowAvailable } from '@/lib/bookings/availability'
import { disputeSchema, reviewSchema, reviewSubject } from './policy'
import { assertActiveAccounts } from '@/lib/accounts/availability'

export class TrustError extends Error {}

/** Both web actions and authenticated API adapters derive the subject from the booking. */
export async function submitBookingReview(userId: string, input: unknown): Promise<void> {
  const data = reviewSchema.parse(input)
  await withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    await lockRecord(tx, 'booking', data.bookingId)
    const booking = await tx.booking.findFirst({ where: { id: data.bookingId,
      OR: [{ seeker_id: userId }, { lister_id: userId }] }, select: { seeker_id: true, lister_id: true, status: true } })
    const subject = booking ? reviewSubject(userId, booking) : null
    if (!subject) throw new TrustError('Reviews are available once per participant after a completed booking.')
    await tx.review.create({ data: { booking_id: data.bookingId, author_id: userId,
      subject_id: subject, rating: data.rating, comment: data.comment } })
    await tx.notification.create({ data: { user_id: subject, kind: 'review', title: 'A new review',
      body: 'A participant reviewed your completed booking.', href: '/marketplace/profile' } })
  })
}

/** A report preserves the reservation and never implies a refund or payout. */
export async function openBookingReport(userId: string, input: unknown): Promise<void> {
  const data = disputeSchema.parse(input)
  await withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    const scoped = await tx.booking.findFirst({ where: { id: data.bookingId, OR: [{ seeker_id: userId }, { lister_id: userId }] }, select: { listing_id: true } })
    if (!scoped) throw new TrustError('This booking is unavailable.')
    await lockRecord(tx, 'listing', scoped.listing_id)
    await lockRecord(tx, 'booking', data.bookingId)
    const booking = await tx.booking.findFirst({ where: { id: data.bookingId,
      OR: [{ seeker_id: userId }, { lister_id: userId }], status: { in: ['confirmed', 'completed', 'disputed'] } } })
    if (!booking || await tx.dispute.findFirst({ where: { booking_id: booking.id, opened_by: userId, status: 'open' }, select: { id: true } })) {
      throw new TrustError('A report could not be opened. Check the booking or your existing report.')
    }
    if (!await bookingWindowAvailable(tx, booking)) throw new TrustError('This booking needs reservation review before a report can be opened.')
    await tx.dispute.create({ data: { booking_id: booking.id, opened_by: userId, reason: data.reason } })
    await tx.booking.update({ where: { id: booking.id }, data: { status: 'disputed' } })
  })
}
