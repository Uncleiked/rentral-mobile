import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { commercialFailure, requireCommercialReference, type CommercialRouteContext } from '@/lib/api/commerce'
import { paymentReferenceSchema } from '@/lib/api/bookings-actions'
import { ownCommercialOrder } from '@/lib/commerce/views'
import { reconcilePayment } from '@/lib/payments/service'
export const runtime = 'nodejs'
export async function POST(request: Request, { params }: CommercialRouteContext): Promise<Response> {
  let started = false
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = z.object({ reference: paymentReferenceSchema }).strict().parse(await readApiJson(request, 2048))
    await ownCommercialOrder(actor.userId, id); await requireCommercialReference(actor.userId, id, input.reference); started = true
    await reconcilePayment(actor.userId, input.reference); return apiSuccess({ order: await ownCommercialOrder(actor.userId, id) }) }
  catch (error) { return commercialFailure(error, 'commercial-reconcile', started) }
}
