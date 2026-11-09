import { z } from 'zod'
import { pushCapabilitySchema, pushRegistrationResultSchema, pushRegistrationSchema } from '../../../../lib/push/policy'
import { api, ApiError } from './api'
import { memberResponse } from './member-api'
export { pushCapabilitySchema }
export async function registerPushInstallation(input: z.infer<typeof pushRegistrationSchema>, actorId: string, signal?: AbortSignal) {
  const body = pushRegistrationSchema.safeParse(input)
  if (!body.success) throw new ApiError('The device’s private push registration could not be confirmed. Check the app build and try again.', 'INVALID_INPUT', 400)
  const result = memberResponse(pushRegistrationResultSchema, await api<unknown>('/push/devices', { method: 'POST', body: body.data, expectedUserId: actorId, ...(signal ? { signal } : {}) }))
  if (result.device.installationId !== body.data.installationId || result.device.platform !== body.data.platform || result.device.status !== 'active' || result.consentVersion < body.data.expectedConsentVersion) throw new ApiError('The push registration acknowledgment did not match this device. Refresh its status before trying again.', 'INVALID_RESPONSE', 200)
  return result
}
export async function revokePushInstallation(id: string, actorId: string, signal?: AbortSignal) {
  const result = memberResponse(pushCapabilitySchema, await api<unknown>(`/push/devices/${z.uuid().parse(id)}`, { method: 'DELETE', expectedUserId: actorId, ...(signal ? { signal } : {}) }))
  if (result.devices.some(device => device.id === id && device.status === 'active')) throw new ApiError('The device revocation could not be confirmed. Refresh the server registrations.', 'INVALID_RESPONSE', 200)
  return result
}
