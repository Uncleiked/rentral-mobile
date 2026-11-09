import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiSuccess } from '@/lib/api/http'
import { commercialFailure, emptyCommercialBody, type CommercialRouteContext } from '@/lib/api/commerce'
import { commercialCheckoutSchema } from '@/lib/commerce/contracts'
import { ownCommercialOrder } from '@/lib/commerce/views'
import { startCommercialOrderPayment } from '@/lib/payments/service'
export const runtime = 'nodejs'
export async function POST(request: Request, { params }: CommercialRouteContext): Promise<Response> {
  let started = false
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    await emptyCommercialBody(request); await ownCommercialOrder(actor.userId, id); started = true
    const result = commercialCheckoutSchema.safeParse({ url: await startCommercialOrderPayment(actor.userId, id) })
    if (!result.success) throw new ApiError(503, 'COMMERCIAL_CHECKOUT_UNCONFIRMED', 'Checkout could not be verified. Reconcile the existing reference before trying again.')
    return apiSuccess(result.data) }
  catch (error) { return commercialFailure(error, 'commercial-checkout', started) }
}
