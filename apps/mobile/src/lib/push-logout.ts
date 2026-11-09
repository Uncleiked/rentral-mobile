import { z } from 'zod'
import { config } from './config'
import type { AuthSession } from './auth-types'
import { loadPushInstallation } from './push-installation'
import { pushCapabilitySchema } from '../../../../lib/push/policy'
import { clearPushRecovery, savePushRecovery } from './push-recovery'

/** Uses only the captured credential; it cannot refresh or accidentally act as the next account. */
export async function revokePushBeforeLogout(session: AuthSession): Promise<void> {
  const proof = await loadPushInstallation()
  if (!proof) return
  const actorId = session.user.id
  await savePushRecovery({ actorId, installationId: proof.installationId, operation: 'revoke' }).catch(() => undefined)
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 4500)
  const headers = { Authorization: `Bearer ${session.access_token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'X-Rentral-Account': actorId }
  try {
    // Even without a device row, this advances the consent epoch so an older
    // in-flight enrollment cannot create/reactivate a binding after logout.
    const response = await fetch(`${config.apiUrl}/api/v1/push/installation`, { method: 'DELETE', headers, credentials: 'omit', body: JSON.stringify({ installationId: proof.installationId }), signal: controller.signal })
    if (!response.ok) throw new Error('Unconfirmed')
    const payload: unknown = await response.json()
    const overview = z.object({ success: z.literal(true), data: pushCapabilitySchema }).parse(payload).data
    const device = overview.devices.find(item => item.installationId === proof.installationId)
    if (device?.status === 'active') throw new Error('Unconfirmed')
    await clearPushRecovery(actorId)
  } catch { throw new Error('This device’s push revocation could not be confirmed. Its private recovery record is retained.') }
  finally { clearTimeout(timeout) }
}
