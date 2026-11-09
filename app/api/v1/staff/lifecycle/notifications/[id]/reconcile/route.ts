import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { lifecycleFailure, type LifecycleRouteContext } from '@/lib/api/lifecycle'
import { reconcileNotificationEmail } from '@/lib/lifecycle/email-reconciliation'

export const runtime = 'nodejs'
export async function POST(request: Request, { params }: LifecycleRouteContext): Promise<Response> {
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id)
    const input = z.object({ reason: z.string().trim().min(30).max(2000) }).strict().parse(await readApiJson(request, 12288))
    return apiSuccess(await reconcileNotificationEmail(actor.userId, id, input.reason))
  } catch (error) { return lifecycleFailure(error, 'staff-email-reconcile') }
}
