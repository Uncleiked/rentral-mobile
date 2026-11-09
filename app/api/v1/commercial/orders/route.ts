import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { commercialFailure } from '@/lib/api/commerce'
import { createCommercialOrder } from '@/lib/commerce/orders'
import { ownCommercialOrder } from '@/lib/commerce/views'
import { commercialOrderInputSchema } from '@/lib/commerce/policy'
export const runtime = 'nodejs'
export async function POST(request: Request): Promise<Response> {
  let started = false
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }); const input = commercialOrderInputSchema.parse(await readApiJson(request, 4096)); started = true
    const id = await createCommercialOrder(actor.userId, input); return apiSuccess({ order: await ownCommercialOrder(actor.userId, id) }, 201) }
  catch (error) { return commercialFailure(error, 'commercial-order-create', started) }
}
