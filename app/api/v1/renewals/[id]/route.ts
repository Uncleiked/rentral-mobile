import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { lifecycleFailure, renewalForApi, type LifecycleRouteContext } from '@/lib/api/lifecycle'
import { confirmRenewal } from '@/lib/lifecycle/service'
import { lifecycleCounterpartySchema } from '@/lib/lifecycle/policy'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: LifecycleRouteContext): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await renewalForApi(actor.userId, z.uuid().parse((await params).id))) }
  catch (error) { return lifecycleFailure(error, 'renewal') }
}
export async function PATCH(request: Request, { params }: LifecycleRouteContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = lifecycleCounterpartySchema.parse(await readApiJson(request, 12288))
    await renewalForApi(actor.userId, id); started = true
    await confirmRenewal(actor.userId, id, input)
    return apiSuccess(await renewalForApi(actor.userId, id))
  } catch (error) { return lifecycleFailure(error, 'renewal-confirm', started) }
}
