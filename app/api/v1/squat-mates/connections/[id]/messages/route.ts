import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { archiveQuerySchema } from '@/lib/api/archive'
import { apiSearchParams, apiSuccess, readApiJson } from '@/lib/api/http'
import { createdMatchingResult, matchingFailure, type MatchingRouteContext } from '@/lib/api/matching'
import { matchingMessageInputSchema } from '@/lib/matching/policy'
import { matchingMessages, persistMatchingMessage } from '@/lib/matching/messages'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: MatchingRouteContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await matchingMessages(actor.userId, z.uuid().parse((await params).id), archiveQuerySchema.parse(apiSearchParams(request)))) }
  catch (error) { return matchingFailure(error, 'matching-messages') }
}
export async function POST(request: Request, { params }: MatchingRouteContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = matchingMessageInputSchema.parse(await readApiJson(request, 16384)); started = true
    return apiSuccess(createdMatchingResult(await persistMatchingMessage(actor.userId, id, input)), 201)
  } catch (error) { return matchingFailure(error, 'matching-message-send', started) }
}
