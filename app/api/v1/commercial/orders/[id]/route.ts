import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { commercialFailure, type CommercialRouteContext } from '@/lib/api/commerce'
import { cancelCommercialOrder } from '@/lib/commerce/orders'
import { ownCommercialOrder } from '@/lib/commerce/views'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: CommercialRouteContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess({ order: await ownCommercialOrder(actor.userId, z.uuid().parse((await params).id)) }) }
  catch (error) { return commercialFailure(error, 'commercial-order') }
}
export async function PATCH(request: Request, { params }: CommercialRouteContext): Promise<Response> {
  let started = false
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    z.object({ operation: z.literal('cancel') }).strict().parse(await readApiJson(request, 1024)); started = true
    await cancelCommercialOrder(actor.userId, id); return apiSuccess({ order: await ownCommercialOrder(actor.userId, id) }) }
  catch (error) { return commercialFailure(error, 'commercial-order-cancel', started) }
}
