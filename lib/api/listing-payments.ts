import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/db'
import { AccountUnavailableError } from '@/lib/accounts/availability'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { MongoReadinessError } from '@/lib/database/readiness'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { paymentCallbackUrl, paymentsEnabled } from '@/lib/payments/config'
import { paystackEnvironment } from '@/lib/payments/providers/paystack/client'
import { assertPaymentEnvironment, knownTerminalPayment, PaymentCallbackConfigurationError, PaymentEnvironmentMismatchError } from '@/lib/payments/environment'
import { PUBLICATION_FEE_KOBO, publicationFeeCheckoutSchema, publicationFeeSchema } from '@/lib/contracts/listing-payments'
import { ApiError, apiFailure, readApiJson } from './http'

export type ListingPaymentContext = { params: Promise<{ id: string }> }
export async function ownedPublicationFee(userId: string, listingId: string) {
  const listing = await prisma.listing.findFirst({ where: { id: listingId, lister_id: userId }, select: { id: true, listing_status: true, archived_at: true } })
  if (!listing) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable.')
  const payment = await prisma.paymentIntent.findFirst({ where: { listing_id: listingId, user_id: userId, kind: 'listing_fee' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, reference: true, status: true, provider_environment: true, amount_kobo: true, currency: true, createdAt: true, paid_at: true } })
  const configured = paymentsEnabled()
  const environment = configured ? paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim()) : null
  let paymentAvailable = false
  if (configured) { try { paymentCallbackUrl(null); paymentAvailable = true } catch { /* Keep saved history/reconciliation available while checkout is misconfigured. */ } }
  const compatible = !payment || payment.provider_environment === environment
  const result = publicationFeeSchema.safeParse({ listingId: listing.id, listingStatus: listing.listing_status, archived: Boolean(listing.archived_at),
    currency: 'NGN', amountKobo: PUBLICATION_FEE_KOBO, environment, paymentAvailable,
    payment: payment ? { id: payment.id, reference: payment.reference, status: payment.status, environment: payment.provider_environment,
      amountKobo: payment.amount_kobo.toString(), currency: payment.currency, createdAt: payment.createdAt.toISOString(), paidAt: payment.paid_at?.toISOString() ?? null } : null,
    actions: { checkout: Boolean(paymentAvailable && (compatible || payment && knownTerminalPayment(payment)) && listing.listing_status === 'pending_verification' && !listing.archived_at && (!payment || ['created', 'pending', 'failed', 'abandoned'].includes(payment.status))),
      reconcile: Boolean(configured && compatible && payment) } })
  if (!result.success) throw new ApiError(503, 'PUBLICATION_FEE_DATA_UNAVAILABLE', 'The publication fee details could not be verified. Refresh before paying.')
  return result.data
}
export async function emptyListingPaymentBody(request: Request): Promise<void> {
  if (request.body) z.object({}).strict().parse(await readApiJson(request, 1024))
}
/** Bind the returned provider URL to its exact persisted intent. Do not guess
 * metadata from whichever latest row happens to exist after provider I/O. */
export async function boundPublicationCheckout(userId: string, listingId: string, url: string) {
  if (!publicationFeeCheckoutSchema.shape.url.safeParse(url).success) throw new ApiError(503, 'PUBLICATION_FEE_CHECKOUT_UNCONFIRMED', 'Checkout could not be verified. Refresh and reconcile the existing payment before paying again.')
  const configured = paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim())
  return withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId]); await lockRecord(tx, 'listing', listingId)
    const listing = await tx.listing.findFirst({ where: { id: listingId, lister_id: userId, listing_status: 'pending_verification',
      OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: { id: true } })
    const matches = await tx.paymentIntent.findMany({ where: { user_id: userId, listing_id: listingId, kind: 'listing_fee', checkout_url: url }, take: 2, select: { id: true } })
    const latest = await tx.paymentIntent.findFirst({ where: { user_id: userId, listing_id: listingId, kind: 'listing_fee' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } })
    if (!listing || matches.length !== 1 || matches[0].id !== latest?.id) throw new ApiError(409, 'PUBLICATION_FEE_CHANGED', 'The listing or payment changed while checkout was prepared. Refresh the saved payment before continuing.')
    await lockRecord(tx, 'paymentIntent', latest.id)
    const payment = await tx.paymentIntent.findFirst({ where: { id: latest.id, user_id: userId, listing_id: listingId, kind: 'listing_fee', checkout_url: url,
      provider_environment: configured, status: 'pending' }, select: { id: true, reference: true, provider_environment: true } })
    if (!payment) throw new ApiError(409, 'PUBLICATION_FEE_CHANGED', 'Payment status changed while checkout was prepared. Refresh and reconcile the saved reference before continuing.')
    const result = publicationFeeCheckoutSchema.safeParse({ url, paymentId: payment.id, reference: payment.reference, environment: payment.provider_environment })
    if (!result.success) throw new ApiError(503, 'PUBLICATION_FEE_CHECKOUT_UNCONFIRMED', 'Checkout could not be verified. Refresh and reconcile the existing payment before paying again.')
    return result.data
  })
}
export function requireListingPayments(checkout = false): void {
  if (!paymentsEnabled()) throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', 'Online payments are unavailable. Your publication fee remains unchanged.')
  if (checkout) paymentCallbackUrl(null)
}
export async function requireListingPaymentReference(userId: string, listingId: string, reference: string): Promise<void> {
  const payment = await prisma.paymentIntent.findFirst({ where: { user_id: userId, listing_id: listingId, kind: 'listing_fee', reference }, select: { id: true, provider_environment: true } })
  if (!payment) throw new ApiError(404, 'NOT_FOUND', 'This listing payment is unavailable.')
  assertPaymentEnvironment(payment.provider_environment, paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim()))
}
export function listingPaymentFailure(error: unknown, scope: string, uncertain = false): Response {
  if (error instanceof PaymentCallbackConfigurationError) return apiFailure(new ApiError(503, error.code, error.message), scope)
  if (error instanceof PaymentEnvironmentMismatchError) return apiFailure(new ApiError(409, error.code, error.message), scope)
  if (uncertain && !(error instanceof ApiError) && !(error instanceof z.ZodError) && !(error instanceof AccountUnavailableError) && !(error instanceof MongoReadinessError)) return apiFailure(new ApiError(503, 'PUBLICATION_FEE_UPDATE_UNCONFIRMED', 'The payment result could not be confirmed. Refresh this listing fee and reconcile the existing reference before preparing checkout again.'), scope)
  return apiFailure(error, scope)
}
export function revalidatePublicationFee(listingId: string): void {
  revalidatePath('/marketplace/listing'); revalidatePath(`/marketplace/listing/${listingId}`)
}
