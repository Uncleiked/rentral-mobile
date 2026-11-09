import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { lifecycleFailure, terminationForApi, type LifecycleRouteContext } from '@/lib/api/lifecycle'
import { confirmTermination } from '@/lib/lifecycle/service'
import { lifecycleCounterpartySchema } from '@/lib/lifecycle/policy'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: LifecycleRouteContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await terminationForApi(actor.userId, z.uuid().parse((await params).id))) }
  catch (error) { return lifecycleFailure(error, 'termination') }
}
export async function PATCH(request: Request, { params }: LifecycleRouteContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = lifecycleCounterpartySchema.parse(await readApiJson(request, 12288))
    await terminationForApi(actor.userId, id); started = true
    await confirmTermination(actor.userId, id, input)
    return apiSuccess(await terminationForApi(actor.userId, id))
  } catch (error) { return lifecycleFailure(error, 'termination-confirm', started) }
}
