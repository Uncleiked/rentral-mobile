import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { lifecycleFailure, type LifecycleRouteContext } from '@/lib/api/lifecycle'
import { lifecycleDecisionSchema } from '@/lib/lifecycle/policy'
import { reviewRenewal } from '@/lib/lifecycle/service'
import { requireLifecycleStaff } from '@/lib/lifecycle/operations'

export const runtime = 'nodejs'
export async function PATCH(request: Request, { params }: LifecycleRouteContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = lifecycleDecisionSchema.parse(await readApiJson(request, 12288))
    await requireLifecycleStaff(actor.userId, 'renewal:review'); started = true
    await reviewRenewal(actor.userId, id, input)
    return apiSuccess({ reviewed: true })
  } catch (error) { return lifecycleFailure(error, 'staff-renewal', started) }
}
