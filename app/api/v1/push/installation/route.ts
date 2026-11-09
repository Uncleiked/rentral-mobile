import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { publicPushResult, pushFailure } from '@/lib/api/push'
import { revokePushInstallation } from '@/lib/push/devices'
import { pushCapabilitySchema, pushInstallationRevokeSchema } from '@/lib/push/policy'
export const runtime = 'nodejs'
export async function DELETE(request: Request): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const input = pushInstallationRevokeSchema.parse(await readApiJson(request, 1024)); started = true
    return apiSuccess(publicPushResult(pushCapabilitySchema, await revokePushInstallation(actor.userId, input.installationId)))
  } catch (error) { return pushFailure(error, 'push-installation-revoke', started) }
}
