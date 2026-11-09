import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ identity: vi.fn(), capability: vi.fn(), register: vi.fn(), revoke: vi.fn(), revokeInstallation: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/push/devices', () => ({ pushCapability: mocks.capability, registerPushDevice: mocks.register, revokePushDevice: mocks.revoke, revokePushInstallation: mocks.revokeInstallation }))
import { ApiError } from '@/lib/api/http'
import { GET } from '@/app/api/v1/push/route'
import { POST } from '@/app/api/v1/push/devices/route'
import { DELETE } from '@/app/api/v1/push/devices/[id]/route'
import { DELETE as optOut } from '@/app/api/v1/push/installation/route'
const actor = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222', date = '2030-01-01T00:00:00Z'
const input = { installationId: id, installationSecret: Buffer.alloc(32, 7).toString('base64url'), expoPushToken: 'ExpoPushToken[owned_fixture_token_1234]', projectId: id, platform: 'android', permissionGranted: true, optIn: true, expectedConsentVersion: 0 }
const device = { id, installationId: id, platform: 'android', status: 'active', optedInAt: date, revokedAt: null, createdAt: date, updatedAt: date }
function request(method = 'GET', body?: unknown) { return new Request('http://localhost:3000/api/v1/push/devices', { method, headers: { authorization: 'Bearer owned-fixture', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }
const context = { params: Promise.resolve({ id }) }
const capability = { enabled: true, projectId: id, consentVersion: 1, devices: [device] }
beforeEach(() => { vi.resetAllMocks(); mocks.identity.mockResolvedValue({ userId: actor, sessionId: id, mode: 'bearer' }); mocks.capability.mockResolvedValue(capability); mocks.register.mockResolvedValue({ device, consentVersion: 1 }); mocks.revoke.mockResolvedValue(capability); mocks.revokeInstallation.mockResolvedValue(capability) })
it('authenticates before device reads or writes and preserves central mutation/CSRF guards', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  expect((await GET(request())).status).toBe(401); expect((await POST(request('POST', input))).status).toBe(401)
  expect(mocks.capability).not.toHaveBeenCalled(); expect(mocks.register).not.toHaveBeenCalled()
})
it('accepts only explicit opt-in and passes the authenticated owner separately from strict data', async () => {
  expect((await POST(request('POST', input))).status).toBe(201)
  expect(mocks.register).toHaveBeenCalledExactlyOnceWith(actor, id, input)
  expect(mocks.identity).toHaveBeenCalledWith(expect.anything(), { platform: true, mutation: true, verified: true })
  mocks.register.mockClear()
  for (const bad of [{ ...input, userId: id }, { ...input, optIn: false }, { ...input, permissionGranted: false }, { ...input, token_hash: 'client_hash' }]) expect((await POST(request('POST', bad))).status).toBe(400)
  expect(mocks.register).not.toHaveBeenCalled()
})
it('revoke is owner scoped and rejects injected ownership or opaque device identifiers', async () => {
  expect((await DELETE(request('DELETE', {}), context)).status).toBe(200)
  expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith(actor, id)
  expect((await DELETE(request('DELETE', { userId: id }), context)).status).toBe(400)
  expect((await DELETE(request('DELETE', {}), { params: Promise.resolve({ id: 'not-a-device-id' }) })).status).toBe(400)
})
it('never emits private provider credentials even after an accidental service-projection regression', async () => {
  mocks.register.mockResolvedValue({ device: { ...device, token_hash: 'private_hash', token_ciphertext: 'private_cipher' }, consentVersion: 1 })
  const response = await POST(request('POST', input)); expect(response.status).toBe(503)
  const text = await response.text(); expect(text).not.toContain('private_hash'); expect(text).not.toContain('private_cipher')
})
it('opt-out uses the captured account and installation even before a row exists', async () => {
  const response = await optOut(request('DELETE', { installationId: id }))
  expect(response.status).toBe(200)
  expect(mocks.revokeInstallation).toHaveBeenCalledExactlyOnceWith(actor, id)
  expect(await response.json()).toMatchObject({ data: { consentVersion: 1 } })
  expect((await optOut(request('DELETE', { installationId: id, userId: actor }))).status).toBe(400)
})
it('returns a safe uncertain mutation outcome without replaying registration', async () => {
  mocks.register.mockRejectedValue(new Error(`private token ${input.expoPushToken}`))
  const response = await POST(request('POST', input)); expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ code: 'PUSH_UPDATE_UNCONFIRMED' }); expect(mocks.register).toHaveBeenCalledOnce()
})
