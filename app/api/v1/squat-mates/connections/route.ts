import { requireApiIdentity } from '@/lib/api/auth'
import { archiveQuerySchema } from '@/lib/api/archive'
import { apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { createdMatchingResult, matchingFailure } from '@/lib/api/matching'
import { matchingConnectionInputSchema } from '@/lib/matching/policy'
import { requestMatchingConnection } from '@/lib/matching/connections'
import { matchingConnections } from '@/lib/matching/views'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await matchingConnections(actor.userId, archiveQuerySchema.parse(apiSearchParams(request)))) }
  catch (error) { return matchingFailure(error, 'matching-connections') }
}
export async function POST(request: Request): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const input = matchingConnectionInputSchema.parse(await readApiJson(request, 1024)); started = true
    return apiSuccess(createdMatchingResult(await requestMatchingConnection(actor.userId, input)), 201)
  } catch (error) { return matchingFailure(error, 'matching-contact-request', started) }
}
