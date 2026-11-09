import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/db'
import { expireListingReservations, otherConfirmedHold, paidBookingExpiry } from '@/lib/bookings/service'
import { bookingPayableKobo, holdCreditCanConfirm, reviewHoldCredit } from '@/lib/bookings/hold-credit'
import { paymentsEnabled, paymentCallbackUrl } from './config'
import { initializePaystack, verifyPaystack, type VerifiedPayment } from './paystack'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { bookingWindowAvailable } from '@/lib/bookings/availability'
import { insertBalancedLedger } from './ledger'

const paymentMetadataSchema = z.object({ rentral_payment_id: z.string().uuid(), rentral_user_id: z.string().uuid() })

export function paymentBindingMatches(payment: { id: string; user_id: string; reference: string; amount_kobo: bigint; currency: string; customer_email: string }, verified: VerifiedPayment): boolean {
  let metadata: unknown = verified.metadata
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata) } catch { return false }
  }
  const parsed = paymentMetadataSchema.safeParse(metadata)
  return parsed.success && parsed.data.rentral_payment_id === payment.id && parsed.data.rentral_user_id === payment.user_id &&
    verified.reference === payment.reference && BigInt(verified.amount) === payment.amount_kobo && verified.currency === payment.currency &&
    verified.customer.email.toLowerCase() === payment.customer_email.toLowerCase() && verified.status === 'success'
}

export async function startBookingPayment(userId: string, bookingId: string): Promise<string> {
  if (!paymentsEnabled()) throw new Error('Online payments are not available yet. Your booking remains unpaid.')
  const intent = await withTransaction(async tx => {
    const owned = await tx.booking.findFirst({ where: { id: bookingId, seeker_id: userId }, select: { listing_id: true } })
    if (!owned) throw new Error('Booking not found.')
    await lockRecord(tx, 'listing', owned.listing_id)
    await expireListingReservations(tx, owned.listing_id, new Date())
    if (await otherConfirmedHold(tx, owned.listing_id, userId, new Date())) throw new Error('This asset is protected by another renter’s active hold.')
    await lockRecord(tx, 'booking', bookingId)
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } })
    if (booking.status !== 'awaiting_payment' || !booking.expires_at || booking.expires_at <= new Date()) throw new Error('Ask the host to accept an available booking before paying.')
    if (!await bookingWindowAvailable(tx, booking)) throw new Error('This reservation needs reconciliation before paying.')
    if (!await holdCreditCanConfirm(tx, booking, new Date())) throw new Error('The holding credit needs reconciliation before paying.')
    const payable = bookingPayableKobo(booking)
    if (payable <= BigInt(0)) throw new Error('No additional payment is required. Refresh your booking.')
    const existing = await tx.paymentIntent.findUnique({ where: { idempotency_key: `booking:${bookingId}` } })
    if (existing) return existing
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })
    return tx.paymentIntent.create({ data: { booking_id: bookingId, user_id: userId, kind: 'booking', reference: `rentral-${randomUUID()}`,
      idempotency_key: `booking:${bookingId}`, amount_kobo: payable, currency: booking.currency, customer_email: user.email } })
  })
  if (intent.status === 'pending' && intent.checkout_url) return intent.checkout_url
  if (intent.status !== 'created') throw new Error('This payment is being reconciled. Check payment status before trying again.')
  const claimed = await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'created' }, data: { status: 'initializing' } })
  if (!claimed.count) throw new Error('Checkout is already being prepared. Check payment status shortly.')
  try {
    const url = await initializePaystack({ id: intent.id, userId, email: intent.customer_email, reference: intent.reference,
      amountKobo: intent.amount_kobo, callbackUrl: paymentCallbackUrl(bookingId) })
    // A webhook can win while initialization is in flight; never overwrite success.
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { checkout_url: url, status: 'pending' } })
    return url
  } catch {
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { status: 'uncertain' } })
    throw new Error('Checkout could not be confirmed. Check payment status before trying again; a new charge was not started.')
  }
}

export async function startListingFeePayment(userId: string, listingId: string): Promise<string> {
  if (!paymentsEnabled()) throw new Error('Online payments are not available yet.')
  const intent = await withTransaction(async tx => {
    await lockRecord(tx, 'listing', listingId)
    const listing = await tx.listing.findFirst({ where: { id: listingId, lister_id: userId, listing_status: 'pending_verification' }, select: { id: true } })
    if (!listing) throw new Error('Only your submitted listings can receive a publication fee.')
    const existing = await tx.paymentIntent.findUnique({ where: { idempotency_key: `listing:${listingId}` } })
    if (existing) return existing
    const user = await tx.user.findFirstOrThrow({ where: { id: userId }, select: { email: true } })
    return tx.paymentIntent.create({ data: { listing_id: listingId, user_id: userId, kind: 'listing_fee', reference: `rentral-${randomUUID()}`,
      idempotency_key: `listing:${listingId}`, amount_kobo: BigInt(100000), customer_email: user.email } })
  })
  if (intent.status === 'succeeded') throw new Error('The publication fee has already been received.')
  if (intent.status === 'pending' && intent.checkout_url) return intent.checkout_url
  if (intent.status !== 'created') throw new Error('This payment is being reconciled. Check status before paying again.')
  const claimed = await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'created' }, data: { status: 'initializing' } })
  if (!claimed.count) throw new Error('Checkout is already being prepared.')
  try {
    const url = await initializePaystack({ id: intent.id, userId, email: intent.customer_email, reference: intent.reference,
      amountKobo: intent.amount_kobo, callbackUrl: paymentCallbackUrl(null) })
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { checkout_url: url, status: 'pending' } })
    return url
  } catch {
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { status: 'uncertain' } })
    throw new Error('Checkout is uncertain. Check payment status before paying again.')
  }
}

/** Both signed callbacks and authenticated reconciliation converge here. */
export async function recordVerifiedPayment(verified: VerifiedPayment, payloadHash: string): Promise<void> {
  await withTransaction(async tx => {
    const intent = await tx.paymentIntent.findUnique({ where: { reference: verified.reference } })
    if (!intent) return
    if (!paymentBindingMatches(intent, verified)) throw new Error('Payment verification mismatch.')
    // Every path takes listing -> booking -> payment locks in that order.
    const booking = intent.booking_id ? await tx.booking.findUnique({ where: { id: intent.booking_id } }) : null
    const listingId = booking?.listing_id ?? intent.listing_id
    if (listingId) await lockRecord(tx, 'listing', listingId)
    if (booking) await lockRecord(tx, 'booking', booking.id)
    await lockRecord(tx, 'paymentIntent', intent.id)
    const current = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })
    if (['succeeded', 'requires_review'].includes(current.status)) return
    const eventKey = `charge.success:${verified.id}`
    const event = await tx.paymentEvent.findUnique({ where: { event_key: eventKey } })
    if (event?.processed_at) return
    await tx.paymentEvent.create({ data: { payment_id: intent.id, event_key: eventKey, event_type: 'charge.success', payload_hash: payloadHash, processed_at: new Date() } })
    const freshBooking = booking ? await tx.booking.findUniqueOrThrow({ where: { id: booking.id } }) : null
    const eligibleListing = listingId ? await tx.listing.findFirst({ where: { id: listingId, listing_status: 'active' }, select: { id: true } }) : null
    const eligibleSeeker = await tx.user.findFirst({ where: { id: intent.user_id }, select: { id: true } })
    const conflictingHold = listingId ? await otherConfirmedHold(tx, listingId, intent.user_id, new Date()) : null
    const creditEligible = freshBooking ? await holdCreditCanConfirm(tx, freshBooking, new Date()) : true
    const matchingBalance = !freshBooking || bookingPayableKobo(freshBooking) === intent.amount_kobo
    const available = freshBooking ? await bookingWindowAvailable(tx, freshBooking) : true
    const bookable = available && creditEligible && matchingBalance && !conflictingHold && Boolean(eligibleListing && eligibleSeeker) && freshBooking?.status === 'awaiting_payment' && freshBooking.expires_at !== null && freshBooking.expires_at > new Date()
    const status = freshBooking && !bookable ? 'requires_review' : 'succeeded'
    await tx.paymentIntent.update({ where: { id: intent.id }, data: { status, provider_transaction_id: verified.id, paid_at: new Date() } })
    await insertBalancedLedger(tx, { payment_id: intent.id, currency: intent.currency, kind: 'provider_collection', entries: [
      { account_key: 'provider:paystack:collections', direction: 'debit', amount_kobo: intent.amount_kobo, currency: intent.currency },
      { account_key: `customer:${intent.user_id}:unsettled`, direction: 'credit', amount_kobo: intent.amount_kobo, currency: intent.currency },
    ] })
    if (bookable && freshBooking) {
      await tx.booking.update({ where: { id: freshBooking.id }, data: { status: 'confirmed', expires_at: paidBookingExpiry(freshBooking.kind, freshBooking.pricing_snapshot) } })
      await tx.notification.create({ data: { user_id: freshBooking.lister_id, kind: 'booking_confirmed', title: 'Booking payment confirmed', body: 'Payment has been verified. Settlement remains a separate provider process.', href: `/marketplace/bookings/${freshBooking.id}` } })
    }
    if (status === 'requires_review' && freshBooking?.hold_credit_kobo) await reviewHoldCredit(tx, freshBooking.id)
    await tx.notification.create({ data: { user_id: intent.user_id, kind: status === 'requires_review' ? 'payment_review' : 'payment_confirmed',
      title: status === 'requires_review' ? 'Payment received after booking expiry' : 'Payment received',
      body: status === 'requires_review' ? 'Your reservation was not reopened. Contact support for reconciliation and refund review.' : 'The provider confirmed your payment. This is not a wallet balance.',
      href: intent.booking_id ? `/marketplace/bookings/${intent.booking_id}` : '/marketplace/listing' } })
  })
}

export async function reconcilePayment(userId: string, reference: string): Promise<string> {
  if (!paymentsEnabled()) throw new Error('Payments are not available yet.')
  const intent = await prisma.paymentIntent.findFirst({ where: { reference, user_id: userId }, select: { status: true } })
  if (!intent) throw new Error('Payment not found.')
  if (['succeeded', 'requires_review'].includes(intent.status)) return intent.status
  const verified = await verifyPaystack(reference)
  if (verified.status !== 'success') return 'pending'
  await recordVerifiedPayment(verified, createHash('sha256').update(JSON.stringify(verified)).digest('hex'))
  const result = await prisma.paymentIntent.findFirstOrThrow({ where: { reference, user_id: userId }, select: { status: true } })
  return result.status
}
