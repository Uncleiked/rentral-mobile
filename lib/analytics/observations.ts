import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { coarseNeighborhood } from './policy'
import { ANALYTICS_RETENTION_DAYS, AnalyticsError, analyticsCollectionEnabled, recordAnalyticsObservationInTransaction } from './service'

export function listingObservationContext(listing: { category: string; text_address: string | null; base_rent_amount: number | null; asset_metadata: unknown }) {
  const metadata = listing.asset_metadata && typeof listing.asset_metadata === 'object' && !Array.isArray(listing.asset_metadata) ? listing.asset_metadata as Record<string, unknown> : {}
  const amount = listing.base_rent_amount
  const budgetBand = amount === null || !Number.isFinite(amount) ? 'unspecified' : amount < 1000000 ? 'under-1m' : amount <= 3000000 ? '1m-3m' : amount <= 5000000 ? '3m-5m' : '5m-plus'
  return { category: listing.category, intent: ['rent', 'buy', 'squat', 'shortlet'].includes(String(metadata.rentalIntent)) ? String(metadata.rentalIntent) : 'rent',
    neighborhood: coarseNeighborhood(typeof metadata.neighborhood === 'string' ? metadata.neighborhood : listing.text_address ?? ''), budgetBand }
}
/** Call only after confirmed booking state + collection journal commit within
 * this transaction. This helper independently rechecks those persisted facts. */
export async function recordConfirmedBookingObservation(tx: Prisma.TransactionClient, userId: string, bookingId: string): Promise<boolean> {
  if (!analyticsCollectionEnabled()) return false
  const booking = await tx.booking.findFirst({ where: { id: bookingId, seeker_id: userId, kind: 'rental', status: 'confirmed' }, select: { id: true,
    listing: { select: { category: true, text_address: true, base_rent_amount: true, asset_metadata: true } } } })
  if (!booking) return false
  const credit = await tx.holdCreditAllocation.findUnique({ where: { rental_booking_id: bookingId }, select: { hold_booking_id: true } })
  const payment = await tx.paymentIntent.findFirst({ where: { user_id: userId, booking_id: { in: credit ? [bookingId, credit.hold_booking_id] : [bookingId] }, kind: 'booking', provider: 'paystack', status: 'succeeded',
    paid_at: { gte: new Date(Date.now() - ANALYTICS_RETENTION_DAYS * 86400000) }, provider_transaction_id: { not: null }, ledger: { some: { kind: 'provider_collection' } } }, select: { id: true, paid_at: true } })
  if (!payment) return false
  try { return await recordAnalyticsObservationInTransaction(tx, userId, { event: 'verified_booking', ...listingObservationContext(booking.listing) }, `booking:${bookingId}`, payment.paid_at ?? undefined) }
  catch (error) {
    // Validation is before optional writes. Never discard an otherwise valid
    // collected receipt because a legacy privacy mapping needs repair.
    if (error instanceof AnalyticsError || error instanceof z.ZodError) { console.warn('[analytics] Observation skipped: ANALYTICS_MAPPING_UNAVAILABLE'); return false }
    throw error
  }
}
