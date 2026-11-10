import { z } from 'zod'
import type { BookingView } from '@/lib/bookings/service'
import { discoveryLocation } from '@/lib/discovery-policy'
import { bookingQuoteSchema, bookingTransition } from '@/lib/bookings/policy'
import { paymentsEnabled } from '@/lib/payments/config'
import { ApiError } from './http'

export const apiMoneySchema = z.string().max(19).regex(/^(0|[1-9]\d*)$/)
const timestamp = z.string().datetime({ offset: true })
export const apiBookingQuoteSchema = bookingQuoteSchema.extend({
  period: z.string().min(1).max(12), days: z.number().int().min(1).max(3660), baseKobo: apiMoneySchema, totalKobo: apiMoneySchema,
  fees: z.array(z.object({ label: z.string().min(1).max(80), amountKobo: apiMoneySchema }).strict()).max(12),
  holdCreditKobo: apiMoneySchema.optional(), payableKobo: apiMoneySchema.optional(),
}).strict().refine(quote => {
  if (![quote.baseKobo, quote.totalKobo, quote.holdCreditKobo ?? '0', ...(quote.payableKobo === undefined ? [] : [quote.payableKobo]), ...quote.fees.map(fee => fee.amountKobo)].every(value => apiMoneySchema.safeParse(value).success)) return false
  const total = BigInt(quote.totalKobo), credit = BigInt(quote.holdCreditKobo ?? '0')
  return quote.fees.reduce((sum, fee) => sum + BigInt(fee.amountKobo), BigInt(quote.baseKobo)) === total && credit <= total &&
    (quote.payableKobo === undefined || BigInt(quote.payableKobo) === total - credit)
}, 'The quote balance is inconsistent.')
export const bookingActionSchema = z.object({
  accept: z.boolean(), cancel: z.boolean(), complete: z.boolean(), checkout: z.boolean(),
  reconcile: z.boolean(), checkIn: z.boolean(), issueCode: z.boolean(), convertHold: z.boolean(),
}).strict()
export const apiBookingSchema = z.object({
  id: z.uuid(), kind: z.enum(['inspection', 'rental', 'hold']),
  status: z.enum(['requested', 'awaiting_payment', 'confirmed', 'completed', 'cancelled', 'expired', 'disputed', 'converted']),
  startsAt: timestamp, endsAt: timestamp, expiresAt: timestamp.nullable(), createdAt: timestamp,
  amountKobo: apiMoneySchema, holdCreditKobo: apiMoneySchema, payableKobo: apiMoneySchema,
  currency: z.literal('NGN'), holdBookingId: z.uuid().nullable(), rentalBookingId: z.uuid().nullable(),
  settlementStatus: z.string().min(1).max(40), role: z.enum(['renter', 'host']),
  listing: z.object({ id: z.uuid(), category: z.enum(['house', 'car', 'boat']), location: z.string().max(160) }).strict(),
  renter: z.object({ username: z.string().max(24).nullable() }).strict(),
  host: z.object({ username: z.string().max(24).nullable() }).strict(),
  checkIn: z.object({ renterAt: timestamp.nullable(), hostAt: timestamp.nullable() }).strict(),
  inspectionMode: z.enum(['recorded', 'manual']).optional().default('recorded'),
  payments: z.array(z.object({ id: z.uuid(), reference: z.string().min(1).max(150), status: z.string().min(1).max(40) }).strict()).max(100),
  quote: apiBookingQuoteSchema.nullable(), actions: bookingActionSchema, paymentAvailable: z.boolean(),
}).strict().superRefine((value, context) => {
  if (![value.holdCreditKobo, value.amountKobo, value.payableKobo].every(amount => apiMoneySchema.safeParse(amount).success)) return
  if (BigInt(value.holdCreditKobo) > BigInt(value.amountKobo) || BigInt(value.payableKobo) !== BigInt(value.amountKobo) - BigInt(value.holdCreditKobo) ||
    Date.parse(value.endsAt) <= Date.parse(value.startsAt) || (value.quote !== null && value.quote.totalKobo !== value.amountKobo)) {
    context.addIssue({ code: 'custom', message: 'Booking balance is inconsistent.' })
  }
})
export type ApiBooking = z.infer<typeof apiBookingSchema>

/** UI hints only; shared mutation services recheck current permissions and availability. */
export function bookingActions(booking: BookingView, viewerId: string, paymentAvailable: boolean, now = new Date()): z.infer<typeof bookingActionSchema> {
  const renter = booking.seeker_id === viewerId, host = booking.lister_id === viewerId
  const paid = booking.payments.some(payment => ['succeeded', 'requires_review'].includes(payment.status))
  const snapshot = bookingQuoteSchema.safeParse(booking.pricing_snapshot)
  const liveDeadline = Boolean(booking.expires_at && Date.parse(booking.expires_at) > now.getTime())
  const ended = Date.parse(booking.ends_at) <= now.getTime()
  return {
    accept: host && Boolean(bookingTransition(booking.status, 'accept', host, renter, paid, ended)) && !ended &&
      (Date.parse(booking.starts_at) > now.getTime() || Boolean(snapshot.data?.holdBookingId)),
    cancel: Boolean(bookingTransition(booking.status, 'cancel', host, renter, paid, ended)),
    complete: booking.kind === 'rental' && Boolean(bookingTransition(booking.status, 'complete', host, renter, paid, ended)),
    checkout: renter && paymentAvailable && booking.status === 'awaiting_payment' && liveDeadline &&
      BigInt(booking.amount_kobo) > BigInt(booking.hold_credit_kobo) &&
      booking.payments.every(payment => ['created', 'pending', 'failed', 'abandoned'].includes(payment.status)),
    reconcile: renter && paymentAvailable && booking.payments.some(payment => !['succeeded', 'requires_review'].includes(payment.status)),
    checkIn: booking.listing.media_source !== 'approved_gallery' && (renter || host) && booking.kind === 'inspection' && booking.status === 'confirmed' && Math.abs(Date.parse(booking.starts_at) - now.getTime()) <= 4 * 60 * 60 * 1000,
    issueCode: booking.listing.media_source !== 'approved_gallery' && renter && booking.kind === 'inspection' && booking.status === 'confirmed',
    convertHold: renter && booking.kind === 'hold' && booking.status === 'confirmed' && booking.settlement_status === 'unsettled' &&
      liveDeadline && !ended && !booking.allocated_hold_credit && paid && !booking.payments.some(payment => payment.status === 'requires_review'),
  }
}

export function publicBooking(booking: BookingView, viewerId: string): ApiBooking {
  if (![booking.seeker_id, booking.lister_id].includes(viewerId)) throw new ApiError(404, 'NOT_FOUND', 'This booking is unavailable.')
  if (!apiMoneySchema.safeParse(booking.amount_kobo).success || !apiMoneySchema.safeParse(booking.hold_credit_kobo).success) {
    throw new ApiError(503, 'BOOKING_DATA_UNAVAILABLE', 'Booking details could not be verified. Refresh before continuing.')
  }
  const paymentAvailable = paymentsEnabled()
  const quote = apiBookingQuoteSchema.safeParse(booking.pricing_snapshot)
  const result = apiBookingSchema.safeParse({
    id: booking.id, kind: booking.kind, status: booking.status,
    startsAt: booking.starts_at, endsAt: booking.ends_at, expiresAt: booking.expires_at,
    amountKobo: booking.amount_kobo, holdCreditKobo: booking.hold_credit_kobo,
    payableKobo: (BigInt(booking.amount_kobo) - BigInt(booking.hold_credit_kobo)).toString(), currency: booking.currency, createdAt: booking.createdAt,
    holdBookingId: booking.rental_hold_credit?.hold_booking_id ?? null,
    rentalBookingId: booking.allocated_hold_credit?.rental_booking_id ?? null,
    settlementStatus: booking.settlement_status,
    role: booking.seeker_id === viewerId ? 'renter' : 'host',
    listing: { id: booking.listing_id, category: booking.listing.category, location: discoveryLocation(booking.listing.text_address) },
    renter: { username: booking.seeker.username }, host: { username: booking.lister.username },
    checkIn: { renterAt: booking.seeker_checked_in_at, hostAt: booking.lister_checked_in_at },
    inspectionMode: booking.listing.media_source === 'approved_gallery' ? 'manual' : 'recorded',
    payments: booking.payments.map(payment => ({ id: payment.id, reference: payment.reference, status: payment.status })),
    quote: quote.success ? quote.data : null, actions: bookingActions(booking, viewerId, paymentAvailable), paymentAvailable,
  })
  if (!result.success) throw new ApiError(503, 'BOOKING_DATA_UNAVAILABLE', 'Booking details could not be verified. Refresh before continuing.')
  return result.data
}
