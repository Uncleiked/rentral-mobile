import type { BookingView } from '@/lib/bookings/service'
import { discoveryLocation } from '@/lib/discovery-policy'

export function publicBooking(booking: BookingView, viewerId: string) {
  return {
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
    payments: booking.payments.map(payment => ({ id: payment.id, reference: payment.reference, status: payment.status })),
  }
}
