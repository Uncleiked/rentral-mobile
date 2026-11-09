import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ request: vi.fn(), fetch: vi.fn(), proof: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn(), values: new Map<string, string>() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixture.request, ApiError: class ApiError extends Error { constructor(message: string, public readonly code: string, public readonly status: number) { super(message) } } }))
vi.mock('../apps/mobile/src/lib/session-storage', () => ({ sessionStorage: { getItem: fixture.get, setItem: fixture.set, removeItem: fixture.remove } }))
vi.mock('../apps/mobile/src/lib/config', () => ({ config: { apiUrl: 'http://127.0.0.1:3000' } }))
vi.mock('../apps/mobile/src/lib/push-installation', () => ({ loadPushInstallation: fixture.proof }))
import { createPushInstallationStore, pushSecret } from '../apps/mobile/src/lib/push-installation-core'
import { pushGate } from '../apps/mobile/src/lib/push-capability'
import { registerPushInstallation, revokePushInstallation } from '../apps/mobile/src/lib/push-api'
import { clearPushRecovery, loadPushRecovery, savePushRecovery } from '../apps/mobile/src/lib/push-recovery'
import { revokePushBeforeLogout } from '../apps/mobile/src/lib/push-logout'
import { ApiError } from '../apps/mobile/src/lib/api'

const actor = '11111111-1111-4111-8111-111111111111', installationId = '22222222-2222-4222-8222-222222222222', deviceId = '33333333-3333-4333-8333-333333333333', projectId = '44444444-4444-4444-8444-444444444444', other = '55555555-5555-4555-8555-555555555555'
const date = '2030-01-01T10:00:00.000Z', secret = 'p'.repeat(43), token = 'ExpoPushToken[fixture_token_only]'
const device = { id: deviceId, installationId, platform: 'android' as const, status: 'active' as const, optedInAt: date, revokedAt: null, createdAt: date, updatedAt: date }
const capability = { enabled: true, projectId, consentVersion: 4, devices: [device] }
const command = { installationId, installationSecret: secret, expoPushToken: token, projectId, platform: 'android' as const, permissionGranted: true as const, optIn: true as const, expectedConsentVersion: 4 }
const storage = { getItem: fixture.get, setItem: fixture.set, removeItem: fixture.remove }
beforeEach(() => {
  vi.resetAllMocks(); fixture.values.clear()
  fixture.get.mockImplementation(async key => fixture.values.get(key) ?? null)
  fixture.set.mockImplementation(async (key, value) => { fixture.values.set(key, value) })
  fixture.remove.mockImplementation(async key => { fixture.values.delete(key) })
  fixture.proof.mockResolvedValue({ version: 1, installationId, installationSecret: secret })
})
it.each([new Uint8Array(32), Uint8Array.from({ length: 32 }, (_, n) => n), new Uint8Array(32).fill(255)])('encodes all thirty-two secure bytes as canonical forty-three-character base64url %#', bytes => {
  expect(pushSecret(bytes)).toBe(Buffer.from(bytes).toString('base64url'))
  expect(pushSecret(bytes)).toMatch(/^[A-Za-z0-9_-]{43}$/)
})
it.each([new Uint8Array(31), new Uint8Array(33)])('never substitutes weak randomness for invalid byte length %#', bytes => { expect(() => pushSecret(bytes)).toThrow('thirty-two') })
it('coalesces proof creation and retains the same proof across JWT logout/account changes', async () => {
  const random = vi.fn().mockResolvedValue(new Uint8Array(32)), uuid = vi.fn(() => installationId)
  const proof = createPushInstallationStore(storage, uuid, random)
  const results = await Promise.all(Array.from({ length: 8 }, () => proof.create()))
  expect(random).toHaveBeenCalledTimes(1); expect(uuid).toHaveBeenCalledTimes(1)
  expect(results.every(item => item.installationId === installationId && item.installationSecret === results[0].installationSecret)).toBe(true)
  fixture.values.set('rentral.jwt.session', 'a JWT fixture'); fixture.values.delete('rentral.jwt.session')
  expect(await proof.load()).toEqual(results[0]); expect(await proof.create()).toEqual(results[0])
})
it('does not store proof if cryptographic randomness fails and never falls back to Math.random', async () => {
  const random = vi.fn().mockRejectedValue(new Error('Secure randomness unavailable'))
  const proof = createPushInstallationStore(storage, () => installationId, random)
  await expect(proof.create()).rejects.toThrow('Secure randomness unavailable'); expect(fixture.set).not.toHaveBeenCalled()
})
it('does not silently replace missing/corrupt push proof with a different installation', async () => {
  const random = vi.fn().mockResolvedValue(new Uint8Array(32)), proof = createPushInstallationStore(storage, () => installationId, random)
  fixture.values.set('rentral.push.installation.present', '1')
  await expect(proof.create()).rejects.toThrow('incomplete'); expect(random).not.toHaveBeenCalled()
  await proof.reset(); await proof.create(); expect(random).toHaveBeenCalledTimes(1)
})
it.each([
  [{ platform: 'web', expoGo: false, projectId }, capability], [{ platform: 'android', expoGo: true, projectId }, capability],
  [{ platform: 'ios', expoGo: false, projectId: null }, capability], [{ platform: 'ios', expoGo: false, projectId: other }, capability],
  [{ platform: 'android', expoGo: false, projectId }, { ...capability, enabled: false }],
])('never enables unsupported runtime, ExpoGo, missing/mismatched project or disabled capability %#', (build, server) => { expect(pushGate(build, server).allowed).toBe(false) })
it('allows a configured native development/production build without mistaking its shared storeClient runtime for ExpoGo', () => {
  expect(pushGate({ platform: 'android', expoGo: false, projectId }, capability).allowed).toBe(true)
})
it('binds registration to the captured consent epoch and confirms the exact installation/platform/active response', async () => {
  fixture.request.mockResolvedValueOnce({ device, consentVersion: 5 })
  expect(await registerPushInstallation(command, actor)).toEqual({ device, consentVersion: 5 })
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith('/push/devices', { method: 'POST', body: command, expectedUserId: actor })
})
it.each([{ device: { ...device, installationId: other }, consentVersion: 5 }, { device: { ...device, status: 'revoked' }, consentVersion: 5 },
  { device: { ...device, expoPushToken: token }, consentVersion: 5 }, { device, consentVersion: 3 }])('does not declare a contradictory/private-field registration acknowledgment successful %#', async value => {
  fixture.request.mockResolvedValueOnce(value)
  await expect(registerPushInstallation(command, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('never retries stale consent with a newer epoch automatically', async () => {
  fixture.request.mockRejectedValueOnce(new ApiError('Consent changed', 'PUSH_CONSENT_CHANGED', 409))
  await expect(registerPushInstallation(command, actor)).rejects.toMatchObject({ code: 'PUSH_CONSENT_CHANGED', status: 409 })
  expect(fixture.request).toHaveBeenCalledTimes(1); expect(fixture.request.mock.calls[0][1].body.expectedConsentVersion).toBe(4)
})
it('validates authoritative revocation capability rather than inventing local timestamps/status', async () => {
  fixture.request.mockResolvedValueOnce({ ...capability, consentVersion: 5, devices: [{ ...device, status: 'revoked', revokedAt: date }] }).mockResolvedValueOnce(capability)
  expect((await revokePushInstallation(deviceId, actor)).devices[0].revokedAt).toBe(date)
  await expect(revokePushInstallation(deviceId, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('serializes private recovery changes so newer logout intent survives older cleanup', async () => {
  await savePushRecovery({ actorId: actor, installationId, operation: 'register' })
  await Promise.all([clearPushRecovery(actor), savePushRecovery({ actorId: actor, installationId, operation: 'revoke' })])
  expect(await loadPushRecovery(actor)).toEqual({ actorId: actor, installationId, operation: 'revoke' })
  expect(await loadPushRecovery(other)).toBeNull()
  expect([...fixture.values.values()].join('')).not.toContain(secret); expect([...fixture.values.values()].join('')).not.toContain(token)
})
it('keeps torn recovery unknown instead of silently replaying enrollment', async () => {
  fixture.values.set(`rentral.push.recovery.${actor}.present`, '1')
  await expect(loadPushRecovery(actor)).rejects.toThrow('incomplete'); expect(fixture.request).not.toHaveBeenCalled()
})
const session = { access_token: 'captured-account-a-access', refresh_token: 'r'.repeat(43), expires_at: 2000000000, expires_in: 900, token_type: 'bearer' as const, user: { id: actor, email: 'fixture@example.test', app_metadata: {}, user_metadata: {}, is_anonymous: false as const } }
it('revokes the installation using only the captured bearer, even if no device row exists yet', async () => {
  fixture.fetch.mockResolvedValue(Response.json({ success: true, data: { ...capability, consentVersion: 5, devices: [] } }))
  vi.stubGlobal('fetch', fixture.fetch)
  try {
    await revokePushBeforeLogout(session)
    expect(fixture.fetch).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:3000/api/v1/push/installation', expect.objectContaining({ method: 'DELETE', credentials: 'omit', body: JSON.stringify({ installationId }), headers: expect.objectContaining({ Authorization: `Bearer ${session.access_token}`, 'X-Rentral-Account': actor }) }))
    expect(fixture.request).not.toHaveBeenCalled(); expect(await loadPushRecovery(actor)).toBeNull()
  } finally { vi.unstubAllGlobals() }
})
it('preserves unknown revocation on logout failure without exposing or replacing the installation proof', async () => {
  fixture.fetch.mockResolvedValue(new Response('Unavailable', { status: 503 })); vi.stubGlobal('fetch', fixture.fetch)
  try { await expect(revokePushBeforeLogout(session)).rejects.toThrow('could not be confirmed'); expect((await loadPushRecovery(actor))?.operation).toBe('revoke'); expect(fixture.remove).not.toHaveBeenCalled() }
  finally { vi.unstubAllGlobals() }
})
