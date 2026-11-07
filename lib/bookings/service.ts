import { createHash, randomInt } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { platformEnabled } from '@/lib/platform'
import { bookingRequestSchema, bookingTransition, bookingQuoteSchema, checkInSchema, nairaToKobo, quoteBookingBreakdown, HOLD_WINDOW_MS, PAYMENT_WINDOW_MS, BookingError, type BookingOperation } from './policy'
import { allocateHoldCredit, reviewHoldCredit, holdCreditTerms } from './hold-credit'

const bookingSelect = {
  id: true, listing_id: true, seeker_id: true, lister_id: true, kind: true, status: true,
  starts_at: true, ends_at: true, expires_at: true, amount_kobo: true, currency: true, settlement_status: true, createdAt: true,
  pricing_snapshot: true, hold_credit_kobo: true,
  rental_hold_credit: { select: { hold_booking_id: true } }, allocated_hold_credit: { select: { rental_booking_id: true } },
  seeker_checked_in_at: true, lister_checked_in_at: true,
  listing: { select: { category: true, text_address: true } },
  seeker: { select: { username: true } }, lister: { select: { username: true } },
  payments: { select: { id: true, reference: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.BookingSelect

type BookingRow = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>
export type BookingView = Omit<BookingRow, 'amount_kobo' | 'hold_credit_kobo' | 'starts_at' | 'ends_at' | 'expires_at' | 'createdAt' | 'seeker_checked_in_at' | 'lister_checked_in_at'> & {
  amount_kobo: string; hold_credit_kobo: string; starts_at: string; ends_at: string; expires_at: string | null; createdAt: string;
  seeker_checked_in_at: string | null; lister_checked_in_at: string | null;
}

function serializeBooking(row: BookingRow): BookingView {
  return { ...row, amount_kobo: row.amount_kobo.toString(), hold_credit_kobo: row.hold_credit_kobo.toString(), starts_at: row.starts_at.toISOString(), ends_at: row.ends_at.toISOString(),
    expires_at: row.expires_at?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
    seeker_checked_in_at: row.seeker_checked_in_at?.toISOString() ?? null, lister_checked_in_at: row.lister_checked_in_at?.toISOString() ?? null }
}

export async function getBookingsForUser(userId: string): Promise<BookingView[]> {
  if (!platformEnabled()) return []
  const rows = await prisma.booking.findMany({ where: { OR: [{ seeker_id: userId }, { lister_id: userId }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, select: bookingSelect })
  return rows.map(serializeBooking)
}

export async function getBookingForParticipant(id: string, userId: string): Promise<BookingView | null> {
  if (!platformEnabled()) return null
  const row = await prisma.booking.findFirst({ where: { id, OR: [{ seeker_id: userId }, { lister_id: userId }] }, select: bookingSelect })
  return row ? serializeBooking(row) : null
}

/** Call while holding the listing lock. Expiry never invents refunds or payouts. */
export async function expireListingReservations(tx: Prisma.TransactionClient, listingId: string, now: Date): Promise<void> {
  const holds = await tx.booking.findMany({ where: { listing_id: listingId, kind: 'hold', status: 'confirmed', expires_at: { lte: now } }, select: { id: true, seeker_id: true, lister_id: true } })
  const conversions = await tx.booking.findMany({ where: { listing_id: listingId, hold_credit_kobo: { gt: BigInt(0) }, status: 'awaiting_payment', expires_at: { lte: now } }, select: { id: true } })
  for (const conversion of conversions) await reviewHoldCredit(tx, conversion.id)
  await tx.booking.updateMany({ where: { listing_id: listingId, expires_at: { lte: now }, status: 'awaiting_payment' }, data: { status: 'expired' } })
  await tx.booking.updateMany({ where: { listing_id: listingId, expires_at: { lte: now }, status: 'confirmed', kind: 'hold' }, data: { status: 'expired', settlement_status: 'requires_review' } })
  if (holds.length) await tx.notification.createMany({ data: holds.flatMap(hold => [hold.seeker_id, hold.lister_id].map(user_id => ({ user_id,
    kind: 'hold_expired', title: 'Holding period ended', body: 'The holding period ended. Any compensation or refund is awaiting settlement review.',
    href: `/marketplace/bookings/${hold.id}`, dedupe_key: `hold-expired:${hold.id}:${user_id}` }))), skipDuplicates: true })
}

/** Call under the listing lock: a confirmed live hold protects the entire asset. */
export async function otherConfirmedHold(tx: Prisma.TransactionClient, listingId: string, userId: string, now: Date): Promise<{ id: string; expires_at: Date | null } | null> {
  return tx.booking.findFirst({ where: { listing_id: listingId, seeker_id: { not: userId }, kind: 'hold', expires_at: { gt: now }, OR: [
    { status: 'confirmed' }, { status: 'converted', allocated_hold_credit: { rental_booking: { status: 'awaiting_payment', expires_at: { gt: now } } } },
  ] }, select: { id: true, expires_at: true } })
}

/** Owner-scoped route helper. No holder identity is added to discovery payloads. */
export async function getOwnActiveHold(listingId: string, userId: string): Promise<BookingView | null> {
  if (!platformEnabled()) return null
  const row = await prisma.booking.findFirst({ where: { listing_id: listingId, seeker_id: userId, kind: 'hold', status: 'confirmed', settlement_status: 'unsettled', expires_at: { gt: new Date() }, allocated_hold_credit: null }, select: bookingSelect })
  return row ? serializeBooking(row) : null
}

async function assertNoOtherHold(tx: Prisma.TransactionClient, listingId: string, userId: string): Promise<void> {
  if (await otherConfirmedHold(tx, listingId, userId, new Date())) throw new BookingError('This asset is protected by another renter’s active hold. Try again after the hold expires.')
}

export async function requestBooking(userId: string, input: unknown): Promise<string> {
  const parsed = bookingRequestSchema.parse(input)
  const start = new Date(parsed.startsAt), end = new Date(parsed.endsAt), now = new Date()
  if ((!parsed.holdBookingId && start.getTime() < now.getTime() - 60000) || end <= now) throw new BookingError('Choose an available rental period.')
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${parsed.listingId} FOR UPDATE`
    const listing = await tx.listing.findFirst({ where: { id: parsed.listingId, listing_status: 'active', lister: { kyc_verified: true } }, select: { id: true, lister_id: true, category: true, base_rent_amount: true, asset_metadata: true } })
    if (!listing || !listing.base_rent_amount) throw new BookingError('This listing is unavailable.')
    if (listing.lister_id === userId) throw new BookingError('You cannot book your own listing.')
    await expireListingReservations(tx, listing.id, now)
    await assertNoOtherHold(tx, listing.id, userId)
    const quote = quoteBookingBreakdown(parsed.kind, listing.category, nairaToKobo(listing.base_rent_amount.toString()), start, end, listing.asset_metadata, parsed.holdDays)
    const amount = BigInt(quote.totalKobo)
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new BookingError('The requested total is too large. Choose a shorter period.')
    if (parsed.holdBookingId) {
      const hold = await tx.booking.findUnique({ where: { id: parsed.holdBookingId }, include: { payments: true, allocated_hold_credit: true } })
      if (!hold || hold.allocated_hold_credit) throw new BookingError('This holding credit is unavailable or has already been allocated.')
      holdCreditTerms(hold, { id: '', listing_id: listing.id, seeker_id: userId, lister_id: listing.lister_id, kind: parsed.kind,
        status: 'requested', currency: 'NGN', amount_kobo: amount, settlement_status: 'unsettled', expires_at: null, starts_at: start, ends_at: end }, hold.payments, now)
    }
    const booking = await tx.booking.create({ data: { listing_id: listing.id, seeker_id: userId, lister_id: listing.lister_id,
      kind: parsed.kind, starts_at: start, ends_at: end, amount_kobo: amount, pricing_snapshot: { ...quote, ...(parsed.holdBookingId ? { holdBookingId: parsed.holdBookingId } : {}) } } })
    await tx.notification.create({ data: { user_id: listing.lister_id, kind: 'booking_requested', title: 'A new booking request', body: 'Review the dates and price before accepting.', href: `/marketplace/bookings/${booking.id}` } })
    return booking.id
  })
}

export async function changeBookingStatus(userId: string, id: string, operation: BookingOperation): Promise<void> {
  await prisma.$transaction(async tx => {
    const owned = await tx.booking.findFirst({ where: { id, OR: [{ seeker_id: userId }, { lister_id: userId }] }, select: { listing_id: true } })
    if (!owned) throw new BookingError('Booking not found.')
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${owned.listing_id} FOR UPDATE`
    await expireListingReservations(tx, owned.listing_id, new Date())
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${id} FOR UPDATE`
    const booking = await tx.booking.findUniqueOrThrow({ where: { id }, include: { payments: { where: { status: { in: ['succeeded', 'requires_review'] } }, select: { id: true } } } })
    if (operation === 'complete' && booking.kind !== 'rental') throw new BookingError('Inspections require both participants to check in on site.')
    const status = bookingTransition(booking.status, operation, userId === booking.lister_id, userId === booking.seeker_id, booking.payments.length > 0, booking.ends_at <= new Date())
    if (!status) throw new BookingError('This change is unavailable. Paid cancellations require a dispute and refund review.')
    let credit: Awaited<ReturnType<typeof allocateHoldCredit>> = null
    if (operation === 'accept') {
      await assertNoOtherHold(tx, booking.listing_id, booking.seeker_id)
      const listing = await tx.listing.findFirst({ where: { id: booking.listing_id, listing_status: 'active', lister: { kyc_verified: true } }, select: { id: true } })
      const isConversion = Boolean(bookingQuoteSchema.safeParse(booking.pricing_snapshot).data?.holdBookingId)
      if (!listing || booking.ends_at <= new Date() || (!isConversion && booking.starts_at <= new Date())) throw new BookingError('This listing or booking period is no longer available.')
      credit = await allocateHoldCredit(tx, booking, new Date())
    }
    if (operation === 'cancel' && booking.hold_credit_kobo > BigInt(0)) await reviewHoldCredit(tx, id)
    const nextStatus = credit?.status ?? status
    await tx.booking.update({ where: { id }, data: { status, ...(status === 'awaiting_payment' ? { expires_at: new Date(Date.now() + PAYMENT_WINDOW_MS) } : {}), ...(credit ?? {}) } })
    await tx.notification.create({ data: { user_id: userId === booking.lister_id ? booking.seeker_id : booking.lister_id,
      kind: 'booking_updated', title: `Booking ${nextStatus.replaceAll('_', ' ')}`, body: credit ? 'Your paid hold was allocated once to this rental. Open the booking to see the remaining balance and deadline.' : 'Open your booking for the current details.', href: `/marketplace/bookings/${id}` } })
  })
}

export async function issueHandshakeCode(userId: string, id: string): Promise<string> {
  const code = randomInt(100000, 1000000).toString()
  const changed = await prisma.booking.updateMany({ where: { id, seeker_id: userId, kind: 'inspection', status: 'confirmed' },
    data: { handshake_code_hash: createHash('sha256').update(`${id}:${code}`).digest('hex') } })
  if (!changed.count) throw new BookingError('A confirmed inspection is required.')
  return code
}

export async function checkInBooking(userId: string, id: string, input: unknown): Promise<void> {
  const parsed = checkInSchema.parse(input)
  if (Math.abs(Date.now() - Date.parse(parsed.capturedAt)) > 120000) throw new BookingError('Your location reading is too old. Request a fresh location and retry.')
  await prisma.$transaction(async tx => {
    const scoped = await tx.booking.findFirst({ where: { id, OR: [{ seeker_id: userId }, { lister_id: userId }] }, select: { listing_id: true, seeker_id: true } })
    if (!scoped) throw new BookingError('Confirmed inspection not found.')
    await tx.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${scoped.listing_id} FOR UPDATE`
    await assertNoOtherHold(tx, scoped.listing_id, scoped.seeker_id)
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${id} FOR UPDATE`
    const booking = await tx.booking.findFirst({ where: { id, kind: 'inspection', status: 'confirmed', OR: [{ seeker_id: userId }, { lister_id: userId }] } })
    if (!booking) throw new BookingError('Confirmed inspection not found.')
    const now = new Date()
    if (Math.abs(now.getTime() - booking.starts_at.getTime()) > 4 * 60 * 60 * 1000) throw new BookingError('Check in within four hours of the inspection time.')
    const proximity = await tx.$queryRaw<{ nearby: boolean }[]>`SELECT extensions.ST_DWithin("hardware_coordinates", extensions.ST_SetSRID(extensions.ST_MakePoint(${parsed.longitude}, ${parsed.latitude}),4326)::extensions.geography,20) AS nearby FROM "Listing" WHERE "id" = ${booking.listing_id}`
    if (!proximity[0]?.nearby) throw new BookingError('Move closer to the listed asset and try again. Check-in requires being within 20 metres.')
    const isSeeker = booking.seeker_id === userId
    if (!isSeeker && (!parsed.code || createHash('sha256').update(`${id}:${parsed.code}`).digest('hex') !== booking.handshake_code_hash)) throw new BookingError('Ask the renter for the current six-digit check-in code.')
    const otherCheckIn = isSeeker ? booking.lister_checked_in_at : booking.seeker_checked_in_at
    const bothPresent = otherCheckIn !== null && now.getTime() - otherCheckIn.getTime() < 15 * 60 * 1000
    await tx.booking.update({ where: { id }, data: { ...(isSeeker ? { seeker_checked_in_at: now } : { lister_checked_in_at: now }), ...(bothPresent ? { status: 'completed', handshake_code_hash: null } : {}) } })
    // Provider custody/payout acceptance remains separate from this evidence check.
  })
}

export function paidBookingExpiry(kind: string, snapshot?: unknown): Date | null {
  const quote = bookingQuoteSchema.safeParse(snapshot)
  const days = quote.success ? quote.data.holdDays ?? 1 : 1
  return kind === 'hold' ? new Date(Date.now() + HOLD_WINDOW_MS * days) : null
}
