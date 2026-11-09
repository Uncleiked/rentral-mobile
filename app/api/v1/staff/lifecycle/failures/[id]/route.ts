import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { lifecycleFailure, type LifecycleRouteContext } from '@/lib/api/lifecycle'
import { acknowledgeWorkerFailure, requireLifecycleStaff } from '@/lib/lifecycle/operations'

export const runtime = 'nodejs'
export async function PATCH(request: Request, { params }: LifecycleRouteContext): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.string().regex(/^[a-f0-9]{64}$/).parse((await params).id)
    const input = z.object({ reason: z.string().trim().min(30).max(2000) }).strict().parse(await readApiJson(request, 12288))
    await requireLifecycleStaff(actor.userId, 'operations:manage'); started = true
    await acknowledgeWorkerFailure(actor.userId, id, input.reason)
    return apiSuccess({ reviewed: true, underlyingStateChanged: false })
  } catch (error) { return lifecycleFailure(error, 'staff-worker-failure', started) }
}
