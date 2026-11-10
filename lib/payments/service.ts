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
import { PaystackError, paystackEnvironment } from './providers/paystack/client'
import { activeAccountWhere, assertActiveAccounts } from '@/lib/accounts/availability'
import { lockCommercialPayment } from './commercial-locks'
import { applyVerifiedCommercialOrder, revokeCommercialOrder } from '@/lib/commerce/service'
import { recordConfirmedBookingObservation } from '@/lib/analytics/observations'
import { assertPaymentEnvironment, knownTerminalPayment } from './environment'
import { PUBLICATION_FEE_KOBO } from '@/lib/contracts/listing-payments'
import { publicationFeeWaived } from '@/lib/listings/fee-policy'
export { startCommercialOrderPayment } from './commercial'

const paymentMetadataSchema = z.object({ rentral_payment_id: z.string().uuid(), rentral_user_id: z.string().uuid() })

function paymentDetailsMatch(payment: { id: string; user_id: string; reference: string; amount_kobo: bigint; currency: string; customer_email: string; provider_environment?: string | null }, verified: VerifiedPayment): boolean {
  let metadata: unknown = verified.metadata
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata) } catch { return false }
  }
  const parsed = paymentMetadataSchema.safeParse(metadata)
  return parsed.success && parsed.data.rentral_payment_id === payment.id && parsed.data.rentral_user_id === payment.user_id &&
    verified.reference === payment.reference && BigInt(verified.amount) === payment.amount_kobo && verified.currency === payment.currency &&
    verified.customer.email.toLowerCase() === payment.customer_email.toLowerCase() &&
    (payment.provider_environment ? verified.environment === payment.provider_environment : verified.environment === undefined)
}

export function paymentBindingMatches(payment: Parameters<typeof paymentDetailsMatch>[0], verified: VerifiedPayment): boolean {
  return paymentDetailsMatch(payment, verified) && verified.status === 'success'
}

export async function startBookingPayment(userId: string, bookingId: string): Promise<string> {
  if (!paymentsEnabled()) throw new Error('Online payments are not available yet. Your booking remains unpaid.')
  const environment = paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim())
  const callbackUrl = paymentCallbackUrl(bookingId)
  const intent = await withTransaction(async tx => {
    const owned = await tx.booking.findFirst({ where: { id: bookingId, seeker_id: userId }, select: { listing_id: true } })
    if (!owned) throw new Error('Booking not found.')
    await lockRecord(tx, 'listing', owned.listing_id)
    await expireListingReservations(tx, owned.listing_id, new Date())
    if (await otherConfirmedHold(tx, owned.listing_id, userId, new Date())) throw new Error('This asset is protected by another renter’s active hold.')
    await lockRecord(tx, 'booking', bookingId)
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } })
    await assertActiveAccounts(tx, [booking.seeker_id, booking.lister_id])
    if (booking.status !== 'awaiting_payment' || !booking.expires_at || booking.expires_at <= new Date()) throw new Error('Ask the host to accept an available booking before paying.')
    if (!await bookingWindowAvailable(tx, booking)) throw new Error('This reservation needs reconciliation before paying.')
    if (!await holdCreditCanConfirm(tx, booking, new Date())) throw new Error('The holding credit needs reconciliation before paying.')
    const payable = bookingPayableKobo(booking)
    if (payable <= BigInt(0)) throw new Error('No additional payment is required. Refresh your booking.')
    const existing = await tx.paymentIntent.findFirst({ where: { booking_id: bookingId, user_id: userId, kind: 'booking' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    if (existing && !knownTerminalPayment(existing)) assertPaymentEnvironment(existing.provider_environment, environment)
    if (existing && !['failed', 'abandoned'].includes(existing.status)) return existing
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })
    return tx.paymentIntent.create({ data: { booking_id: bookingId, user_id: userId, kind: 'booking', reference: `rentral-${randomUUID()}`,
      idempotency_key: existing ? `booking:${bookingId}:after:${existing.id}` : `booking:${bookingId}`, amount_kobo: payable, currency: booking.currency, customer_email: user.email,
      provider_environment: environment } })
  })
  if (intent.status === 'pending' && intent.checkout_url) return intent.checkout_url
  if (intent.status !== 'created') throw new Error('This payment is being reconciled. Check payment status before trying again.')
  const claimed = await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'created' }, data: { status: 'initializing' } })
  if (!claimed.count) throw new Error('Checkout is already being prepared. Check payment status shortly.')
  try {
    const url = await initializePaystack({ id: intent.id, userId, email: intent.customer_email, reference: intent.reference,
      amountKobo: intent.amount_kobo, callbackUrl })
    // A webhook can win while initialization is in flight; never overwrite success.
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { checkout_url: url, status: 'pending' } })
    return url
  } catch (error) {
    const rejected = error instanceof PaystackError && !error.uncertain && ['REJECTED', 'INVALID_INPUT'].includes(error.code)
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { status: rejected ? 'failed' : 'uncertain' } })
    throw new Error('Checkout could not be confirmed. Check payment status before trying again; a new charge was not started.')
  }
}

export async function startListingFeePayment(userId: string, listingId: string): Promise<string> {
  if (!paymentsEnabled()) throw new Error('Online payments are not available yet.')
  const environment = paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim())
  const callbackUrl = paymentCallbackUrl(null)
  const intent = await withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    await lockRecord(tx, 'listing', listingId)
    const listing = await tx.listing.findFirst({ where: { id: listingId, lister_id: userId, listing_status: 'pending_verification',
      OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: { id: true, fee_waived_at: true, fee_waived_by: true, fee_waiver_reason: true } })
    if (!listing) throw new Error('Only your submitted listings can receive a publication fee.')
    if (publicationFeeWaived(listing)) throw new Error('The publication fee has been waived. Refresh this listing instead of paying.')
    const existing = await tx.paymentIntent.findFirst({ where: { listing_id: listingId, user_id: userId, kind: 'listing_fee' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    if (existing && !knownTerminalPayment(existing)) assertPaymentEnvironment(existing.provider_environment, environment)
    if (existing && !['failed', 'abandoned'].includes(existing.status)) return existing
    const user = await tx.user.findFirstOrThrow({ where: { id: userId }, select: { email: true } })
    return tx.paymentIntent.create({ data: { listing_id: listingId, user_id: userId, kind: 'listing_fee', reference: `rentral-${randomUUID()}`,
      idempotency_key: existing ? `listing:${listingId}:after:${existing.id}` : `listing:${listingId}`, amount_kobo: BigInt(PUBLICATION_FEE_KOBO), customer_email: user.email,
      provider_environment: environment } })
  })
  if (intent.status === 'succeeded') throw new Error('The publication fee has already been received.')
  if (intent.status === 'pending' && intent.checkout_url) return intent.checkout_url
  if (intent.status !== 'created') throw new Error('This payment is being reconciled. Check status before paying again.')
  const claimed = await withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    await lockRecord(tx, 'listing', listingId)
    const current = await tx.listing.findFirst({ where: { id: listingId, lister_id: userId, listing_status: 'pending_verification', OR: [{ archived_at: null }, { archived_at: { isSet: false } }] },
      select: { id: true, fee_waived_at: true, fee_waived_by: true, fee_waiver_reason: true } })
    if (!current || publicationFeeWaived(current)) throw new Error('This listing changed or its publication fee was waived. Refresh before preparing checkout.')
    return tx.paymentIntent.updateMany({ where: { id: intent.id, user_id: userId, listing_id: listingId, status: 'created' }, data: { status: 'initializing' } })
  })
  if (!claimed.count) throw new Error('Checkout is already being prepared.')
  try {
    const url = await initializePaystack({ id: intent.id, userId, email: intent.customer_email, reference: intent.reference,
      amountKobo: intent.amount_kobo, callbackUrl })
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { checkout_url: url, status: 'pending' } })
    return url
  } catch (error) {
    const rejected = error instanceof PaystackError && !error.uncertain && ['REJECTED', 'INVALID_INPUT'].includes(error.code)
    await prisma.paymentIntent.updateMany({ where: { id: intent.id, status: 'initializing' }, data: { status: rejected ? 'failed' : 'uncertain' } })
    throw new Error('Checkout is uncertain. Check payment status before paying again.')
  }
}

/** Both signed callbacks and authenticated reconciliation converge here. */
export async function recordVerifiedPayment(verified: VerifiedPayment, payloadHash: string): Promise<void> {
  await withTransaction(async tx => {
    const intent = await tx.paymentIntent.findUnique({ where: { reference: verified.reference } })
    if (!intent) return
    if (!paymentBindingMatches(intent, verified)) throw new Error('Payment verification mismatch.')
    await lockCommercialPayment(tx, intent)
    if (intent.booking_id) await lockRecord(tx, 'user', intent.user_id)
    // Every path takes listing -> booking -> payment locks in that order.
    const booking = intent.booking_id ? await tx.booking.findUnique({ where: { id: intent.booking_id } }) : null
    const listingId = booking?.listing_id ?? intent.listing_id
    if (listingId) await lockRecord(tx, 'listing', listingId)
    if (booking) await lockRecord(tx, 'booking', booking.id)
    await lockRecord(tx, 'paymentIntent', intent.id)
    const current = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })
    if (['succeeded', 'requires_review'].includes(current.status)) {
      if (current.order_id && current.status === 'succeeded') await applyVerifiedCommercialOrder(tx, current)
      return
    }
    const eventKey = `charge.success:${verified.environment ?? 'legacy'}:${verified.id}`
    const event = await tx.paymentEvent.findUnique({ where: { event_key: eventKey } })
    if (event?.processed_at) return
    await tx.paymentEvent.create({ data: { payment_id: intent.id, event_key: eventKey, event_type: 'charge.success', payload_hash: payloadHash, processed_at: new Date() } })
    const freshBooking = booking ? await tx.booking.findUniqueOrThrow({ where: { id: booking.id } }) : null
    const eligibleListing = listingId ? await tx.listing.findFirst({ where: { id: listingId, listing_status: 'active' }, select: { id: true } }) : null
    const eligibleSeeker = await tx.user.findFirst({ where: { id: intent.user_id, ...activeAccountWhere }, select: { id: true } })
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
    if (current.order_id) await applyVerifiedCommercialOrder(tx, current)
    if (bookable && freshBooking) {
      await tx.booking.update({ where: { id: freshBooking.id }, data: { status: 'confirmed', expires_at: paidBookingExpiry(freshBooking.kind, freshBooking.pricing_snapshot) } })
      if (freshBooking.kind === 'rental') await recordConfirmedBookingObservation(tx, freshBooking.seeker_id, freshBooking.id)
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
  const intent = await prisma.paymentIntent.findFirst({ where: { reference, user_id: userId } })
  if (!intent) throw new Error('Payment not found.')
  const verified = await verifyPaystack(reference)
  if (!paymentDetailsMatch(intent, verified)) throw new Error('Payment verification mismatch.')
  if (verified.status === 'success') await recordVerifiedPayment(verified, createHash('sha256').update(JSON.stringify(verified)).digest('hex'))
  else await withTransaction(async tx => {
    await lockCommercialPayment(tx, intent)
    const booking = intent.booking_id ? await tx.booking.findUnique({ where: { id: intent.booking_id } }) : null
    const listingId = booking?.listing_id ?? intent.listing_id
    if (listingId) await lockRecord(tx, 'listing', listingId)
    if (booking) await lockRecord(tx, 'booking', booking.id)
    await lockRecord(tx, 'paymentIntent', intent.id)
    const current = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } })
    if (verified.status === 'reversed') {
      const collection = await tx.ledgerTransaction.findFirst({ where: { payment_id: current.id, kind: 'provider_collection' }, select: { id: true } })
      if (collection && current.status !== 'reversed') {
        const businessKey = `provider_collection_reversal:${current.id}`
        if (!await tx.ledgerTransaction.findUnique({ where: { business_key: businessKey }, select: { id: true } })) {
          await insertBalancedLedger(tx, { payment_id: current.id, currency: current.currency, kind: 'provider_collection_reversal', business_key: businessKey,
            entries: [{ account_key: `customer:${current.user_id}:collection_reversed`, direction: 'debit', amount_kobo: current.amount_kobo, currency: current.currency },
              { account_key: 'provider:paystack:collections', direction: 'credit', amount_kobo: current.amount_kobo, currency: current.currency }] })
        }
        if (booking) await tx.booking.update({ where: { id: booking.id }, data: { settlement_status: 'requires_review' } })
      }
      await tx.paymentIntent.update({ where: { id: current.id }, data: { status: 'reversed' } })
      if (current.order_id) await revokeCommercialOrder(tx, current.order_id)
    } else if (!['succeeded', 'requires_review', 'reversed'].includes(current.status)) {
      await tx.paymentIntent.update({ where: { id: current.id }, data: { status: ['failed', 'abandoned'].includes(verified.status) ? verified.status : 'pending' } })
    }
  })
  const result = await prisma.paymentIntent.findFirstOrThrow({ where: { reference, user_id: userId }, select: { status: true } })
  return result.status
}
