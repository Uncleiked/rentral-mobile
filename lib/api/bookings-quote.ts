import prisma from '@/lib/db'
import { BookingError, bookingRequestSchema, nairaToKobo, quoteBookingBreakdown } from '@/lib/bookings/policy'
import { holdCreditTerms } from '@/lib/bookings/hold-credit'
import { z } from 'zod'
import { apiBookingQuoteSchema, apiMoneySchema } from './bookings'
import { ApiError } from './http'
import { galleryIsPublic, galleryListingSelect, galleryUserSelect } from '@/lib/listings/gallery'

export const bookingQuoteResponseSchema = apiBookingQuoteSchema.safeExtend({
  currency: z.literal('NGN'), holdCreditKobo: apiMoneySchema, payableKobo: apiMoneySchema,
})

/** Price preview only: no reservation or allocation is made; request/accept recheck under locks. */
export async function quoteBookingForApi(userId: string, input: unknown): Promise<z.infer<typeof bookingQuoteResponseSchema>> {
  const request = bookingRequestSchema.parse(input)
  const startsAt = new Date(request.startsAt), endsAt = new Date(request.endsAt), now = new Date()
  if ((!request.holdBookingId && startsAt.getTime() < now.getTime() - 60000) || endsAt <= now) throw new BookingError('Choose an available rental period.')
  const listing = await prisma.listing.findFirst({ where: { id: request.listingId, listing_status: 'active' },
    select: { id: true, lister_id: true, category: true, base_rent_amount: true, asset_metadata: true, ...galleryListingSelect, lister: { select: galleryUserSelect } } })
  if (!listing || !listing.base_rent_amount || !galleryIsPublic(listing)) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable.')
  if (listing.lister_id === userId) throw new BookingError('You cannot book your own listing.')
  const quote = quoteBookingBreakdown(request.kind, listing.category, nairaToKobo(listing.base_rent_amount.toString()), startsAt, endsAt, listing.asset_metadata, request.holdDays)
  let holdCreditKobo = BigInt(0)
  if (request.holdBookingId) {
    const hold = await prisma.booking.findFirst({ where: { id: request.holdBookingId, seeker_id: userId }, include: { payments: true, allocated_hold_credit: true } })
    if (!hold || hold.allocated_hold_credit) throw new BookingError('This holding credit is unavailable or has already been allocated.')
    const terms = holdCreditTerms(hold, { id: '', listing_id: listing.id, seeker_id: userId, lister_id: listing.lister_id,
      kind: request.kind, status: 'requested', currency: 'NGN', amount_kobo: BigInt(quote.totalKobo), settlement_status: 'unsettled', expires_at: null,
      starts_at: startsAt, ends_at: endsAt }, hold.payments, now)
    holdCreditKobo = terms.creditKobo
  }
  const result = bookingQuoteResponseSchema.safeParse({ ...quote, currency: 'NGN', holdCreditKobo: holdCreditKobo.toString(),
    payableKobo: (BigInt(quote.totalKobo) - holdCreditKobo).toString(), ...(request.holdBookingId ? { holdBookingId: request.holdBookingId } : {}) })
  if (!result.success) throw new ApiError(503, 'QUOTE_UNAVAILABLE', 'The quote could not be verified. Please refresh the listing.')
  return result.data
}
