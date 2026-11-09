import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { publicPushResult, pushFailure } from '@/lib/api/push'
import { pushCapability } from '@/lib/push/devices'
import { pushCapabilitySchema } from '@/lib/push/policy'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess(publicPushResult(pushCapabilitySchema, await pushCapability(actor.userId))) }
  catch (error) { return pushFailure(error, 'push') }
}
