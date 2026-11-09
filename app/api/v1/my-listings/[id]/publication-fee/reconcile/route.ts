import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { listingPaymentFailure, ownedPublicationFee, requireListingPaymentReference, requireListingPayments, revalidatePublicationFee, type ListingPaymentContext } from '@/lib/api/listing-payments'
import { publicationFeeReconcileSchema } from '@/lib/contracts/listing-payments'
import { reconcilePayment } from '@/lib/payments/service'
export const runtime = 'nodejs'
export async function POST(request: Request, { params }: ListingPaymentContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = publicationFeeReconcileSchema.parse(await readApiJson(request, 2048))
    await ownedPublicationFee(actor.userId, id); requireListingPayments(); await requireListingPaymentReference(actor.userId, id, input.reference)
    started = true; await reconcilePayment(actor.userId, input.reference); revalidatePublicationFee(id)
    return apiSuccess(await ownedPublicationFee(actor.userId, id))
  } catch (error) { return listingPaymentFailure(error, 'listing-publication-reconcile', started) }
}
