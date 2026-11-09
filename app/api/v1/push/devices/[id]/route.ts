import { z } from 'zod'
import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/http'
import { pushFailure, emptyPushBody, publicPushResult } from '@/lib/api/push'
import { revokePushDevice } from '@/lib/push/devices'
import { pushCapabilitySchema } from '@/lib/push/policy'
export const runtime = 'nodejs'
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let started = false
  try { const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true }), id = z.uuid().parse((await params).id); await emptyPushBody(request); started = true
    return apiSuccess(publicPushResult(pushCapabilitySchema, await revokePushDevice(actor.userId, id))) }
  catch (error) { return pushFailure(error, 'push-revoke', started) }
}
