import { randomUUID } from 'node:crypto'
import type { Prisma, PushDevice } from '@prisma/client'
import prisma from '@/lib/db'
import { assertPushReady, pushPrepared } from '@/lib/database/readiness'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { pushConfiguration, pushProjectId } from './config'
import { pushCapabilitySchema, pushConsentVersionSchema, pushDeviceSchema, PushError, pushRegistrationSchema } from './policy'
import { openPushToken, pushProofHash, pushProofMatches, pushTokenHash, sealPushToken } from './crypto'

export function publicPushDevice(row: PushDevice) {
  const parsed = pushDeviceSchema.safeParse({ id: row.id, installationId: row.installation_id, platform: row.platform, status: row.status,
    optedInAt: row.opted_in_at.toISOString(), revokedAt: row.revoked_at?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })
  if (!parsed.success) throw new PushError('Push device details could not be verified. Refresh in a moment.', 'PUSH_DATA_UNAVAILABLE', 503)
  return parsed.data
}
export async function pushCapability(userId: string) {
  const prepared = await pushPrepared()
  const [devices, user] = await Promise.all([
    prepared ? prisma.pushDevice.findMany({ where: { user_id: userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 50 }) : [],
    prisma.user.findUnique({ where: { id: userId }, select: { push_consent_version: true } }),
  ])
  return pushCapabilitySchema.parse({ enabled: Boolean(prepared && pushConfiguration()), projectId: pushProjectId(), consentVersion: consentVersion(user?.push_consent_version), devices: devices.map(publicPushDevice) })
}
function consentVersion(value: number | null | undefined): number {
  const parsed = pushConsentVersionSchema.safeParse(value ?? 0)
  if (!parsed.success) throw new PushError('Push consent could not be verified. Refresh account settings.', 'PUSH_DATA_UNAVAILABLE', 503)
  return parsed.data
}
/** Caller holds the user write lock. Null/missing legacy values represent epoch zero. */
async function advanceConsent(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { push_consent_version: true } }), version = consentVersion(user?.push_consent_version)
  if (!user || version === 2147483647) throw new PushError('Push consent could not be updated. Refresh account settings.', 'PUSH_DATA_UNAVAILABLE', 503)
  await tx.user.update({ where: { id: userId }, data: { push_consent_version: version + 1 } })
  return version + 1
}
async function capabilityInTransaction(tx: Prisma.TransactionClient, userId: string, version: number) {
  const devices = await tx.pushDevice.findMany({ where: { user_id: userId }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 50 })
  return pushCapabilitySchema.parse({ enabled: Boolean(pushConfiguration()), projectId: pushProjectId(), consentVersion: version, devices: devices.map(publicPushDevice) })
}
export async function registerPushDevice(userId: string, sessionId: string | undefined, input: unknown) {
  await assertPushReady()
  if (!sessionId) throw new PushError('A current sign-in is required to enable push.', 'UNAUTHORIZED', 401)
  const data = pushRegistrationSchema.parse(input), config = pushConfiguration()
  if (!config) throw new PushError('Remote push is currently unavailable. You can still read notifications in the app.', 'PUSH_DISABLED', 503)
  if (data.projectId.toLowerCase() !== config.projectId) throw new PushError('This app build does not match the configured push project.', 'PUSH_PROJECT_MISMATCH')
  const tokenHash = pushTokenHash(data.expoPushToken)
  const work = () => withTransaction(async tx => {
    const [byInstallation, byToken] = await Promise.all([tx.pushDevice.findUnique({ where: { installation_id: data.installationId } }), tx.pushDevice.findUnique({ where: { token_hash: tokenHash } })])
    if (byInstallation && byToken && byInstallation.id !== byToken.id) throw new PushError('This device registration cannot be reassigned. Revoke the previous binding first.', 'PUSH_BINDING_CONFLICT')
    const initial = byInstallation ?? byToken
    for (const id of [...new Set([userId, initial?.user_id].filter((id): id is string => Boolean(id)))].sort()) {
      if (id === userId) await assertActiveAccounts(tx, [id])
      else if (!await lockRecord(tx, 'user', id)) throw new PushError('This device binding needs review.', 'PUSH_BINDING_CONFLICT')
    }
    const [session, user] = await Promise.all([
      tx.authSession.findFirst({ where: { id: sessionId, user_id: userId, expires_at: { gt: new Date() }, OR: [{ revoked_at: null }, { revoked_at: { isSet: false } }] }, select: { id: true } }),
      tx.user.findUnique({ where: { id: userId }, select: { push_consent_version: true } }),
    ])
    if (!session) throw new PushError('This sign-in ended. Sign in before enabling push.', 'UNAUTHORIZED', 401)
    const version = consentVersion(user?.push_consent_version)
    if (initial) await lockRecord(tx, 'pushDevice', initial.id)
    const current = initial ? await tx.pushDevice.findUnique({ where: { id: initial.id } }) : null
    if (initial && (!current || current.user_id !== initial.user_id)) throw new PushError('The device binding changed. Refresh before trying again.', 'PUSH_BINDING_CONFLICT')
    if (current && current.user_id !== userId && (current.status !== 'revoked' || current.installation_id !== data.installationId || !pushProofMatches(current.proof_hash, data.installationId, data.installationSecret))) {
      throw new PushError('This device registration cannot be reassigned. Revoke the previous binding first.', 'PUSH_BINDING_CONFLICT')
    }
    const proof = pushProofHash(data.installationId, data.installationSecret)
    if (current && current.user_id === userId && current.auth_session_id === sessionId && current.installation_id === data.installationId && current.token_hash === tokenHash && current.proof_hash === proof && current.platform === data.platform && current.status === 'active') {
      try { if (openPushToken(current.id, current) === data.expoPushToken) return { device: publicPushDevice(current), consentVersion: version } } catch { /* Explicit owner registration repairs key/project rotation. */ }
    }
    if (data.expectedConsentVersion !== version) throw new PushError('Push consent changed. Refresh device settings before choosing whether to enable push again.', 'PUSH_CONSENT_CHANGED')
    if (await tx.pushDevice.count({ where: { user_id: userId, status: 'active', ...(current ? { id: { not: current.id } } : {}) } }) >= 8) throw new PushError('Revoke an older device before enabling push on another one.', 'PUSH_DEVICE_LIMIT')
    const id = current?.id ?? randomUUID(), fields = { user_id: userId, auth_session_id: sessionId, installation_id: data.installationId, token_hash: tokenHash, proof_hash: proof, platform: data.platform,
      status: 'active', opted_in_at: new Date(), revoked_at: null, ...sealPushToken(id, data.expoPushToken) }
    const saved = current ? await tx.pushDevice.update({ where: { id }, data: fields }) : await tx.pushDevice.create({ data: { id, ...fields } })
    return { device: publicPushDevice(saved), consentVersion: await advanceConsent(tx, userId) }
  })
  try { return await work() }
  catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return work(); throw error }
}
async function revokeBindings(tx: Prisma.TransactionClient, userId: string, ids: string[], code: string): Promise<void> {
  if (!ids.length) return
  await tx.pushDevice.updateMany({ where: { id: { in: ids }, user_id: userId }, data: { status: 'revoked', revoked_at: new Date(), token_ciphertext: null, token_iv: null, token_tag: null } })
  await tx.pushDelivery.updateMany({ where: { device_id: { in: ids }, user_id: userId, status: 'pending' }, data: { status: 'skipped', error_code: code } })
  await tx.pushDelivery.updateMany({ where: { device_id: { in: ids }, user_id: userId, status: 'submitting' }, data: { status: 'uncertain', error_code: `${code}_DURING_SEND` } })
}
export async function revokePushDevice(userId: string, id: string) {
  await assertPushReady()
  return withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId]); await lockRecord(tx, 'pushDevice', id)
    const current = await tx.pushDevice.findUnique({ where: { id }, select: { user_id: true } })
    if (!current || current.user_id !== userId) throw new PushError('This device is unavailable.', 'NOT_FOUND', 404)
    await revokeBindings(tx, userId, [id], 'DEVICE_REVOKED')
    return capabilityInTransaction(tx, userId, await advanceConsent(tx, userId))
  })
}
/** Opt-out also wins against enrollment that has not created a device row yet. */
export async function revokePushInstallation(userId: string, installationId: string) {
  await assertPushReady()
  return withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    const row = await tx.pushDevice.findUnique({ where: { installation_id: installationId }, select: { id: true, user_id: true } })
    if (row?.user_id === userId) {
      await lockRecord(tx, 'pushDevice', row.id)
      await revokeBindings(tx, userId, [row.id], 'DEVICE_REVOKED')
    }
    return capabilityInTransaction(tx, userId, await advanceConsent(tx, userId))
  })
}
/** Caller holds the user write lock and checks push preparation. */
export async function revokePushSessionInTransaction(tx: Prisma.TransactionClient, userId: string, sessionId: string): Promise<void> {
  const devices = await tx.pushDevice.findMany({ where: { user_id: userId, auth_session_id: sessionId }, select: { id: true } })
  await revokeBindings(tx, userId, devices.map(device => device.id), 'SESSION_REVOKED')
  await advanceConsent(tx, userId)
}
/** Caller holds the user write lock and checks push preparation. */
export async function closePushAccountInTransaction(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.pushDevice.updateMany({ where: { user_id: userId }, data: { status: 'revoked', revoked_at: new Date(), token_ciphertext: null, token_iv: null, token_tag: null } })
  await tx.pushDelivery.updateMany({ where: { user_id: userId, status: 'pending' }, data: { status: 'skipped', error_code: 'ACCOUNT_CLOSED' } })
  await tx.pushDelivery.updateMany({ where: { user_id: userId, status: 'submitting' }, data: { status: 'uncertain', error_code: 'ACCOUNT_CLOSED_DURING_SEND' } })
}
