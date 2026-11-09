import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiSuccess } from '@/lib/api/http'
import { boundPublicationCheckout, emptyListingPaymentBody, listingPaymentFailure, ownedPublicationFee, requireListingPayments, type ListingPaymentContext } from '@/lib/api/listing-payments'
import { startListingFeePayment } from '@/lib/payments/service'
export const runtime = 'nodejs'
export async function POST(request: Request, { params }: ListingPaymentContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    await emptyListingPaymentBody(request)
    const fee = await ownedPublicationFee(actor.userId, id); requireListingPayments(true)
    if (!fee.actions.checkout) throw new ApiError(409, 'PUBLICATION_FEE_RECONCILE_REQUIRED', 'Check this listing and its existing payment before preparing checkout.')
    started = true
    return apiSuccess(await boundPublicationCheckout(actor.userId, id, await startListingFeePayment(actor.userId, id)))
  } catch (error) { return listingPaymentFailure(error, 'listing-publication-checkout', started) }
}
