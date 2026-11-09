import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { leaseEvidenceForApi, lifecycleFailure, type LifecycleRouteContext } from '@/lib/api/lifecycle'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: LifecycleRouteContext): Promise<Response> {
  try {
    const actor = await requireApiIdentity(request, { platform: true })
    const query = z.object({ redirect: z.literal('1').optional() }).strict().parse(apiSearchParams(request))
    const evidence = await leaseEvidenceForApi(actor.userId, z.uuid().parse((await params).id), 'termination')
    return query.redirect ? new Response(null, { status: 303, headers: { Location: evidence.url, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', Vary: 'Authorization, Cookie' } }) : apiSuccess(evidence)
  }
  catch (error) { return lifecycleFailure(error, 'termination-evidence') }
}
