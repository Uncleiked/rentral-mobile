import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { publicPushResult, pushFailure } from '@/lib/api/push'
import { pushCapability, registerPushDevice } from '@/lib/push/devices'
import { pushCapabilitySchema, pushRegistrationResultSchema, pushRegistrationSchema } from '@/lib/push/policy'
export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try { const actor = await requireApiIdentity(request, { platform: true }); return apiSuccess({ items: publicPushResult(pushCapabilitySchema, await pushCapability(actor.userId)).devices }) }
  catch (error) { return pushFailure(error, 'push-devices') }
}
export async function POST(request: Request): Promise<Response> {
  let started = false
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), input = pushRegistrationSchema.parse(await readApiJson(request, 4096)); started = true
    return apiSuccess(publicPushResult(pushRegistrationResultSchema, await registerPushDevice(actor.userId, actor.sessionId, input)), 201) }
  catch (error) { return pushFailure(error, 'push-register', started) }
}
