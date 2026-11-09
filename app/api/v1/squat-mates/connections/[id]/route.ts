import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { matchingFailure, validatedMatchingResult, type MatchingRouteContext } from '@/lib/api/matching'
import { matchingDecisionSchema } from '@/lib/matching/policy'
import { decideMatchingConnection } from '@/lib/matching/connections'
import { matchingConnection } from '@/lib/matching/views'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: MatchingRouteContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await matchingConnection(actor.userId, z.uuid().parse((await params).id))) }
  catch (error) { return matchingFailure(error, 'matching-connection') }
}
export async function PATCH(request: Request, { params }: MatchingRouteContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = matchingDecisionSchema.parse(await readApiJson(request, 1024)); started = true
    return apiSuccess(validatedMatchingResult(z.object({ status: z.enum(['accepted', 'declined', 'closed']) }).strict(), { status: await decideMatchingConnection(actor.userId, id, input) }))
  } catch (error) { return matchingFailure(error, 'matching-contact-decision', started) }
}
