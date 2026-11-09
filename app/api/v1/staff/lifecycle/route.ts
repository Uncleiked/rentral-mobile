import { requireApiIdentity } from '@/lib/api/auth'
import { apiSearchParams, apiSuccess } from '@/lib/api/http'
import { lifecycleFailure } from '@/lib/api/lifecycle'
import { lifecycleOperationsQueue, lifecycleQueueSchema } from '@/lib/lifecycle/operations'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(await lifecycleOperationsQueue(actor.userId, lifecycleQueueSchema.parse(apiSearchParams(request)))) }
  catch (error) { return lifecycleFailure(error, 'staff-lifecycle') }
}
