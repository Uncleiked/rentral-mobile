import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { matchingFailure, type MatchingRouteContext } from '@/lib/api/matching'
import { matchingModerationSchema } from '@/lib/matching/policy'
import { requireMatchingReviewer } from '@/lib/matching/operations'
import { reviewMatchingReport } from '@/lib/matching/reports'

export const runtime = 'nodejs'
export async function PATCH(request: Request, { params }: MatchingRouteContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = matchingModerationSchema.parse(await readApiJson(request, 12288))
    await requireMatchingReviewer(actor.userId); started = true
    await reviewMatchingReport(actor.userId, id, input)
    return apiSuccess({ reviewed: true })
  } catch (error) { return matchingFailure(error, 'staff-matching-report', started) }
}
