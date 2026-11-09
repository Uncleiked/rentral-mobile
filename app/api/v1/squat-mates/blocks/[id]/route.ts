import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { emptyMatchingBody, matchingFailure, type MatchingRouteContext } from '@/lib/api/matching'
import { setMatchingBlock } from '@/lib/matching/blocks'

export const runtime = 'nodejs'
async function changeBlock(request: Request, { params }: MatchingRouteContext, blocked: boolean): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), profileId = z.uuid().parse((await params).id)
    await emptyMatchingBody(request); started = true
    await setMatchingBlock(actor.userId, profileId, blocked)
    return apiSuccess({ blocked })
  } catch (error) { return matchingFailure(error, 'matching-block-update', started) }
}
export async function PUT(request: Request, context: MatchingRouteContext): Promise<Response> { return changeBlock(request, context, true) }
export async function DELETE(request: Request, context: MatchingRouteContext): Promise<Response> { return changeBlock(request, context, false) }
