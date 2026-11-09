import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { matchingFailure, validatedMatchingResult, type MatchingRouteContext } from '@/lib/api/matching'
import { markMatchingRead } from '@/lib/matching/messages'

export const runtime = 'nodejs'
export async function POST(request: Request, { params }: MatchingRouteContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = z.object({ messageId: z.uuid().optional() }).strict().parse(request.body ? await readApiJson(request, 1024) : {}); started = true
    return apiSuccess(validatedMatchingResult(z.object({ readAt: z.string().datetime({ offset: true }) }).strict(), { readAt: await markMatchingRead(actor.userId, id, input.messageId) }))
  } catch (error) { return matchingFailure(error, 'matching-message-read', started) }
}
