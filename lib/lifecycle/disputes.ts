import { assertLifecycleReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertStaffPermission } from '@/lib/auth/roles'
import { bookingWindowAvailable } from '@/lib/bookings/availability'
import { expireListingReservations, otherConfirmedHold } from '@/lib/bookings/service'
import { reviewHoldCredit } from '@/lib/bookings/hold-credit'
import { bookingFundsReserved } from '@/lib/payments/allocations'
import { LifecycleError, assertIndependentLifecycleReviewer, disputeResolutionSchema, resolvedBookingState } from './policy'

/** Resolves operational booking state; no provider operation or ledger claim occurs. */
export async function resolveBookingDispute(actorId: string, disputeId: string, input: unknown): Promise<void> {
  await assertLifecycleReady()
  const data = disputeResolutionSchema.parse(input)
  await withTransaction(async tx => {
    const target = await tx.dispute.findUnique({ where: { id: disputeId }, select: { booking_id: true } })
    const locator = target ? await tx.booking.findUnique({ where: { id: target.booking_id }, select: { listing_id: true } }) : null
    if (!target || !locator) throw new LifecycleError('This report is unavailable.')
    await lockRecord(tx, 'listing', locator.listing_id)
    await lockRecord(tx, 'booking', target.booking_id)
    await lockRecord(tx, 'dispute', disputeId)
    await assertStaffPermission(tx, actorId, 'dispute:review')
    const report = await tx.dispute.findUnique({ where: { id: disputeId }, include: { booking: { include: { payments: { select: { status: true } } } } } })
    if (!report || report.status !== 'open' || report.booking.status !== 'disputed') throw new LifecycleError('Choose an open report on a disputed booking.')
    const booking = report.booking
    assertIndependentLifecycleReviewer(actorId, booking)
    const anotherReport = await tx.dispute.findFirst({ where: { booking_id: booking.id, id: { not: disputeId }, status: 'open' }, select: { id: true } })
    let nextStatus = 'disputed'
    if (!anotherReport) {
      nextStatus = resolvedBookingState(booking, data.decision)
      if (nextStatus === 'confirmed') {
        if (await bookingFundsReserved(tx, booking.id)) throw new LifecycleError('A refund or payout is reserved for this booking. Complete financial reconciliation before restoring it.')
        if (booking.settlement_status !== 'unsettled' || !booking.payments.some(payment => payment.status === 'succeeded') ||
          booking.payments.some(payment => payment.status === 'requires_review') || (booking.kind === 'hold' && (!booking.expires_at || booking.expires_at <= new Date()))) {
          throw new LifecycleError('Reconcile the collected payment and holding deadline before restoring a booking.')
        }
        await expireListingReservations(tx, booking.listing_id, new Date())
        if (await otherConfirmedHold(tx, booking.listing_id, booking.seeker_id, new Date()) || !await bookingWindowAvailable(tx, booking)) throw new LifecycleError('The restored booking would conflict with an existing reservation.')
      }
      const needsMoneyReview = nextStatus === 'cancelled' && (booking.hold_credit_kobo > BigInt(0) || booking.payments.some(payment => ['succeeded', 'requires_review'].includes(payment.status)))
      if (needsMoneyReview && booking.hold_credit_kobo > BigInt(0)) await reviewHoldCredit(tx, booking.id)
      await tx.booking.update({ where: { id: booking.id }, data: { status: nextStatus, ...(needsMoneyReview ? { settlement_status: 'requires_review' } : {}) } })
    }
    const updated = await tx.dispute.updateMany({ where: { id: disputeId, status: 'open' }, data: { status: 'resolved', resolution: data.reason,
      resolved_by: actorId, resolved_at: new Date(), booking_resolution: data.decision } })
    if (updated.count !== 1) throw new LifecycleError('This report has already been resolved.')
    await tx.adminAudit.create({ data: { actor_id: actorId, action: `resolve_dispute_${data.decision}`, target_type: 'dispute', target_id: disputeId,
      reason: data.reason, metadata: { bookingId: booking.id, previousStatus: booking.status, nextStatus, bookingDecisionApplied: !anotherReport, moneyMoved: false } } })
    await tx.notification.createMany({ data: [booking.seeker_id, booking.lister_id].map(user_id => ({ user_id, kind: 'dispute', title: 'Report reviewed',
      body: anotherReport ? 'This report was reviewed. Another open report keeps the booking disputed. Financial settlement remains separate.' :
        `The booking is now ${nextStatus}. Refunds and payouts require a separate verified financial process.`, href: `/marketplace/bookings/${booking.id}` })) })
  })
}
