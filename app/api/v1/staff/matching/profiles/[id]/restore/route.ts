import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { matchingFailure, type MatchingRouteContext } from '@/lib/api/matching'
import { requireMatchingReviewer, restoreMatchingProfile } from '@/lib/matching/operations'

export const runtime = 'nodejs'
export async function POST(request: Request, { params }: MatchingRouteContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = z.object({ reason: z.string().trim().min(30).max(2000) }).strict().parse(await readApiJson(request, 12288))
    await requireMatchingReviewer(actor.userId); started = true
    await restoreMatchingProfile(actor.userId, id, input.reason)
    return apiSuccess({ restored: true })
  } catch (error) { return matchingFailure(error, 'staff-matching-restore', started) }
}
