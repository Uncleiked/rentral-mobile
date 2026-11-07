import type { Prisma } from '@prisma/client'
import { BookingError, bookingQuoteSchema, PAYMENT_WINDOW_MS } from './policy'

type CreditBooking = {
  id: string; listing_id: string; seeker_id: string; lister_id: string; kind: string; status: string;
  currency: string; amount_kobo: bigint; settlement_status: string; expires_at: Date | null;
  starts_at: Date; ends_at: Date;
}
type HoldPayment = { user_id: string; status: string; amount_kobo: bigint; currency: string; paid_at: Date | null }

/** Internal allocation of an already collected liability. It never claims a new transfer. */
export function holdCreditTerms(hold: CreditBooking, rental: CreditBooking, payments: HoldPayment[], now: Date): { creditKobo: bigint; payableKobo: bigint; expiresAt: Date } {
  if (hold.kind !== 'hold' || hold.status !== 'confirmed' || hold.settlement_status !== 'unsettled' || !hold.expires_at || hold.expires_at <= now ||
    rental.kind !== 'rental' || rental.status !== 'requested' || rental.settlement_status !== 'unsettled' ||
    hold.listing_id !== rental.listing_id || hold.seeker_id !== rental.seeker_id || hold.lister_id !== rental.lister_id || hold.currency !== rental.currency ||
    hold.starts_at.getTime() !== rental.starts_at.getTime() || hold.ends_at.getTime() !== rental.ends_at.getTime()) {
    throw new BookingError('This hold cannot fund this rental. Use the same asset, renter and rental dates before the hold expires.')
  }
  const successful = payments.filter(payment => payment.status === 'succeeded')
  if (payments.some(payment => payment.status === 'requires_review') || successful.length !== 1 || !successful[0].paid_at ||
    successful[0].user_id !== hold.seeker_id || successful[0].amount_kobo !== hold.amount_kobo || successful[0].currency !== hold.currency) {
    throw new BookingError('This holding payment needs reconciliation before it can be credited.')
  }
  if (hold.amount_kobo <= BigInt(0) || rental.amount_kobo < hold.amount_kobo) throw new BookingError('The holding credit exceeds this rental total. Contact support for reconciliation.')
  return { creditKobo: hold.amount_kobo, payableKobo: rental.amount_kobo - hold.amount_kobo,
    expiresAt: new Date(Math.min(hold.expires_at.getTime(), now.getTime() + PAYMENT_WINDOW_MS)) }
}

export function bookingPayableKobo(booking: { amount_kobo: bigint; hold_credit_kobo?: bigint }): bigint {
  const credit = booking.hold_credit_kobo ?? BigInt(0)
  if (credit < BigInt(0) || credit > booking.amount_kobo) throw new BookingError('The booking balance needs reconciliation.')
  return booking.amount_kobo - credit
}

/** Listing lock must already be held. A request alone never consumes a hold. */
export async function allocateHoldCredit(tx: Prisma.TransactionClient, rental: CreditBooking & { pricing_snapshot: unknown }, now: Date): Promise<{ status: string; expires_at: Date | null; hold_credit_kobo: bigint; pricing_snapshot: Prisma.InputJsonValue } | null> {
  const quote = bookingQuoteSchema.safeParse(rental.pricing_snapshot)
  if (!quote.success || !quote.data.holdBookingId) return null
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${quote.data.holdBookingId} FOR UPDATE`
  const hold = await tx.booking.findUnique({ where: { id: quote.data.holdBookingId }, include: { payments: true, allocated_hold_credit: true } })
  if (!hold || hold.allocated_hold_credit) throw new BookingError('This holding credit is unavailable or has already been allocated.')
  const terms = holdCreditTerms(hold, rental, hold.payments, now)
  const seeker = await tx.user.findFirst({ where: { id: rental.seeker_id, kyc_verified: true }, select: { id: true } })
  if (!seeker) throw new BookingError('The renter must have a current verified identity.')
  // Remove the source from the rental exclusion only in the allocation transaction.
  await tx.booking.update({ where: { id: hold.id }, data: { status: 'converted' } })
  await tx.holdCreditAllocation.create({ data: { hold_booking_id: hold.id, rental_booking_id: rental.id, amount_kobo: terms.creditKobo, currency: rental.currency } })
  return { status: terms.payableKobo === BigInt(0) ? 'confirmed' : 'awaiting_payment', expires_at: terms.payableKobo === BigInt(0) ? null : terms.expiresAt,
    hold_credit_kobo: terms.creditKobo, pricing_snapshot: { ...quote.data, holdCreditKobo: terms.creditKobo.toString(), payableKobo: terms.payableKobo.toString() } }
}

/** An allocated source is never recycled or sent through default compensation. */
export async function reviewHoldCredit(tx: Prisma.TransactionClient, rentalId: string): Promise<void> {
  const allocation = await tx.holdCreditAllocation.findUnique({ where: { rental_booking_id: rentalId } })
  if (!allocation) return
  await tx.booking.updateMany({ where: { id: { in: [allocation.hold_booking_id, rentalId] } }, data: { settlement_status: 'requires_review' } })
}

/** Validate credit again under the listing lock before confirming a balance payment. */
export async function holdCreditCanConfirm(tx: Prisma.TransactionClient, rental: CreditBooking & { hold_credit_kobo?: bigint }, now: Date): Promise<boolean> {
  if (!rental.hold_credit_kobo) return true
  const allocation = await tx.holdCreditAllocation.findUnique({ where: { rental_booking_id: rental.id }, include: { hold_booking: { include: { payments: true } } } })
  if (!allocation) return false
  const hold = allocation.hold_booking
  const paid = hold.payments.filter(payment => payment.status === 'succeeded')
  return allocation.amount_kobo === rental.hold_credit_kobo && hold.status === 'converted' && hold.settlement_status === 'unsettled' &&
    rental.settlement_status === 'unsettled' && Boolean(hold.expires_at && hold.expires_at > now) &&
    hold.listing_id === rental.listing_id && hold.seeker_id === rental.seeker_id && hold.lister_id === rental.lister_id && hold.currency === rental.currency &&
    paid.length === 1 && paid[0].amount_kobo === allocation.amount_kobo && paid[0].currency === rental.currency && paid[0].user_id === rental.seeker_id && Boolean(paid[0].paid_at) &&
    !hold.payments.some(payment => payment.status === 'requires_review')
}
