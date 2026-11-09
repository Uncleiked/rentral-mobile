import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { listingPaymentFailure, ownedPublicationFee, type ListingPaymentContext } from '@/lib/api/listing-payments'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: ListingPaymentContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await ownedPublicationFee(actor.userId, z.uuid().parse((await params).id))) }
  catch (error) { return listingPaymentFailure(error, 'listing-publication-fee') }
}
