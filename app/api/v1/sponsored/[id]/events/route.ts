import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { commercialFailure, type CommercialRouteContext } from '@/lib/api/commerce'
import { recordSponsoredObservation } from '@/lib/commerce/placements'
export const runtime = 'nodejs'
export async function POST(request: Request, { params }: CommercialRouteContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = z.object({ event: z.enum(['impression', 'click']) }).strict().parse(await readApiJson(request, 1024))
    return apiSuccess({ recorded: await recordSponsoredObservation(actor.userId, id, input.event) }) }
  catch (error) { return commercialFailure(error, 'sponsored-observation') }
}
