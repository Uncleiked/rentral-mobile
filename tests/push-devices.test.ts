import type { PushDevice, Prisma } from '@prisma/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ prepared: vi.fn(), ready: vi.fn(), tx: vi.fn(), lock: vi.fn(), active: vi.fn(), userFind: vi.fn(), userUpdate: vi.fn(), session: vi.fn(), find: vi.fn(), list: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), revoke: vi.fn(), deliveries: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertPushReady: mocks.ready, pushPrepared: mocks.prepared }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.tx(work) }))
vi.mock('@/lib/db', () => ({ default: { pushDevice: { findMany: mocks.list }, user: { findUnique: mocks.userFind } } }))
import { closePushAccountInTransaction, pushCapability, registerPushDevice, revokePushDevice, revokePushInstallation, revokePushSessionInTransaction } from '@/lib/push/devices'
import { openPushToken, pushProofHash, pushTokenHash, sealPushToken } from '@/lib/push/crypto'
import { pushRegistrationSchema } from '@/lib/push/policy'
const first = '11111111-1111-4111-8111-111111111111', second = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333'
const installation = '44444444-4444-4444-8444-444444444444', project = '55555555-5555-4555-8555-555555555555'
const sid = '66666666-6666-4666-8666-666666666666'
const secret = Buffer.alloc(32, 7).toString('base64url'), token = 'ExpoPushToken[owned_fixture_token_1234]', now = new Date('2030-01-01T10:00:00Z')
const input = { installationId: installation, installationSecret: secret, expoPushToken: token, projectId: project, platform: 'android', permissionGranted: true, optIn: true, expectedConsentVersion: 0 }
let row: PushDevice | null
let versions: Map<string, number>
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED', 'true'); vi.stubEnv('PUSH_NOTIFICATIONS_SINCE', '2029-12-01T00:00:00Z')
  vi.stubEnv('EXPO_PUBLIC_EAS_PROJECT_ID', project); vi.stubEnv('EXPO_ACCESS_TOKEN', 'owned_fixture_expo_access_token'); vi.stubEnv('PUSH_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'))
  versions = new Map([[first, 0], [second, 0]])
  row = { id, revision: 0, user_id: first, auth_session_id: sid, installation_id: installation, token_hash: pushTokenHash(token), proof_hash: pushProofHash(installation, secret), platform: 'android', status: 'active',
    opted_in_at: now, revoked_at: null, createdAt: now, updatedAt: now, ...sealPushToken(id, token) }
  mocks.prepared.mockResolvedValue(true); mocks.ready.mockResolvedValue(undefined); mocks.active.mockResolvedValue({ count: 1 }); mocks.lock.mockResolvedValue(true); mocks.count.mockResolvedValue(0)
  mocks.userFind.mockImplementation(async ({ where }: { where: { id: string } }) => ({ push_consent_version: versions.get(where.id) ?? 0 }))
  mocks.userUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: { push_consent_version: number } }) => { versions.set(where.id, data.push_consent_version); return data })
  mocks.session.mockResolvedValue({ id: sid })
  mocks.find.mockImplementation(async ({ where }: { where: { id?: string; token_hash?: string; installation_id?: string } }) => row && (where.id === row.id || where.token_hash === row.token_hash || where.installation_id === row.installation_id) ? row : null)
  mocks.list.mockImplementation(async ({ where }: { where: { user_id: string; auth_session_id?: string } }) => row && row.user_id === where.user_id && (!where.auth_session_id || row.auth_session_id === where.auth_session_id) ? [row] : [])
  mocks.update.mockImplementation(async ({ data }: { data: Partial<PushDevice> }) => { if (!row) throw new Error('Missing owned fixture'); row = { ...row, ...data, updatedAt: now }; return row })
  mocks.create.mockImplementation(async ({ data }: { data: PushDevice }) => { row = { ...data, revision: 0, createdAt: now, updatedAt: now }; return row })
  mocks.revoke.mockImplementation(async ({ data }: { data: Partial<PushDevice> }) => { if (row) row = { ...row, ...data }; return { count: row ? 1 : 0 } })
  mocks.tx.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ user: { updateMany: mocks.active, findUnique: mocks.userFind, update: mocks.userUpdate }, authSession: { findFirst: mocks.session }, pushDevice: { findUnique: mocks.find, findMany: mocks.list, count: mocks.count, create: mocks.create, update: mocks.update, updateMany: mocks.revoke }, pushDelivery: { updateMany: mocks.deliveries } }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
it('requires explicit permission, opt-in and matching project before enrollment', async () => {
  expect(pushRegistrationSchema.safeParse({ ...input, optIn: false }).success).toBe(false)
  expect(pushRegistrationSchema.safeParse({ ...input, permissionGranted: false }).success).toBe(false)
  expect(pushRegistrationSchema.safeParse({ ...input, userId: second }).success).toBe(false)
  await expect(registerPushDevice(first, sid, { ...input, projectId: second })).rejects.toMatchObject({ code: 'PUSH_PROJECT_MISMATCH' })
  expect(mocks.tx).not.toHaveBeenCalled()
})
it('does not query new collections when push preparation is unavailable and never exposes credentials', async () => {
  mocks.prepared.mockResolvedValue(false)
  expect(await pushCapability(first)).toEqual({ enabled: false, projectId: project, consentVersion: 0, devices: [] })
  expect(mocks.list).not.toHaveBeenCalled()
  mocks.prepared.mockResolvedValue(true)
  const data = await pushCapability(first), json = JSON.stringify(data)
  for (const privateValue of [token, secret, row!.token_hash, row!.proof_hash, row!.token_ciphertext!]) expect(json).not.toContain(privateValue)
})
it('reuses the same active binding on response loss without resetting its opt-in date', async () => {
  expect((await registerPushDevice(first, sid, input)).device.id).toBe(id)
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
})
it('refuses stolen-token cross-account binding, even after revoke without the installation proof', async () => {
  await expect(registerPushDevice(second, sid, input)).rejects.toMatchObject({ code: 'PUSH_BINDING_CONFLICT' })
  if (!row) throw new Error('Fixture absent'); row.status = 'revoked'
  await expect(registerPushDevice(second, sid, { ...input, installationSecret: Buffer.alloc(32, 1).toString('base64url') })).rejects.toMatchObject({ code: 'PUSH_BINDING_CONFLICT' })
  expect(mocks.update).not.toHaveBeenCalled()
})
it('permits transfer only after revoke and matching stable proof while preserving the device identity', async () => {
  if (!row) throw new Error('Fixture absent'); row.status = 'revoked'
  expect((await registerPushDevice(second, sid, input)).device.id).toBe(id)
  expect(row?.user_id).toBe(second); expect(row?.status).toBe('active')
  expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), 'user', first)
  expect(mocks.active).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: second }) }))
})
it('lets the authenticated owner recover a lost proof and reseals data after key rotation', async () => {
  const next = Buffer.alloc(32, 2).toString('base64url')
  expect((await registerPushDevice(first, sid, { ...input, installationSecret: next })).device.id).toBe(id)
  expect(row?.proof_hash).toBe(pushProofHash(installation, next))
  vi.stubEnv('PUSH_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 3).toString('base64'))
  await registerPushDevice(first, sid, { ...input, installationSecret: next, expectedConsentVersion: 1 })
  expect(openPushToken(id, row!)).toBe(token)
})
it('binds encrypted tokens to the device and configured project, with no plaintext at rest', () => {
  expect(row?.token_ciphertext).not.toContain(token)
  expect(openPushToken(id, row!)).toBe(token)
  expect(() => openPushToken(second, row!)).toThrow('PUSH_TOKEN_UNAVAILABLE')
  vi.stubEnv('EXPO_PUBLIC_EAS_PROJECT_ID', second)
  expect(() => openPushToken(id, row!)).toThrow('PUSH_TOKEN_UNAVAILABLE')
})
it('revoke is owner-only and clears provider credentials while retaining the anti-rebind hashes', async () => {
  await expect(revokePushDevice(second, id)).rejects.toMatchObject({ status: 404 })
  expect(mocks.update).not.toHaveBeenCalled()
  await revokePushDevice(first, id)
  expect(mocks.revoke).toHaveBeenCalledWith({ where: { id: { in: [id] }, user_id: first }, data: expect.objectContaining({ status: 'revoked', token_ciphertext: null, token_iv: null, token_tag: null }) })
  expect(row?.token_hash).toBe(pushTokenHash(token)); expect(row?.proof_hash).toBe(pushProofHash(installation, secret))
})
it('rejects enrollment authenticated before its session was revoked', async () => {
  mocks.session.mockResolvedValue(null)
  await expect(registerPushDevice(first, sid, input)).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
})
it('first opt-out advances consent even without a row and blocks a late first enrollment', async () => {
  row = null
  expect((await revokePushInstallation(first, installation)).consentVersion).toBe(1)
  await expect(registerPushDevice(first, sid, input)).rejects.toMatchObject({ code: 'PUSH_CONSENT_CHANGED' })
  expect(mocks.create).not.toHaveBeenCalled()
})
it('opt-out cannot be undone by a stale retry; explicit fresh consent can enable again', async () => {
  expect((await revokePushInstallation(first, installation)).consentVersion).toBe(1)
  await expect(registerPushDevice(first, sid, input)).rejects.toMatchObject({ code: 'PUSH_CONSENT_CHANGED' })
  expect((await registerPushDevice(first, sid, { ...input, expectedConsentVersion: 1 })).consentVersion).toBe(2)
  expect(row?.status).toBe('active')
})
it('a changed SID requires fresh consent while exact active same-SID response retries remain harmless', async () => {
  versions.set(first, 1)
  expect((await registerPushDevice(first, sid, input)).consentVersion).toBe(1)
  await expect(registerPushDevice(first, second, input)).rejects.toMatchObject({ code: 'PUSH_CONSENT_CHANGED' })
  expect(mocks.update).not.toHaveBeenCalled()
})
it('server logout revokes only devices bound to the captured session, invalidates consent and preserves unknown send truth', async () => {
  const tx = { user: { findUnique: mocks.userFind, update: mocks.userUpdate }, pushDevice: { findMany: mocks.list, updateMany: mocks.revoke }, pushDelivery: { updateMany: mocks.deliveries } } as unknown as Prisma.TransactionClient
  await revokePushSessionInTransaction(tx, first, sid)
  expect(mocks.list).toHaveBeenCalledWith({ where: { user_id: first, auth_session_id: sid }, select: { id: true } })
  expect(row?.status).toBe('revoked'); expect(versions.get(first)).toBe(1)
  expect(mocks.deliveries).toHaveBeenCalledWith(expect.objectContaining({ where: { device_id: { in: [id] }, user_id: first, status: 'submitting' }, data: { status: 'uncertain', error_code: 'SESSION_REVOKED_DURING_SEND' } }))
})
it('closes push enrollment within a caller-owned transaction and never pretends an in-flight send was cancelled', async () => {
  const tx = { pushDevice: { updateMany: mocks.revoke }, pushDelivery: { updateMany: mocks.deliveries } } as unknown as Prisma.TransactionClient
  await closePushAccountInTransaction(tx, first)
  expect(mocks.deliveries).toHaveBeenCalledWith({ where: { user_id: first, status: 'submitting' }, data: { status: 'uncertain', error_code: 'ACCOUNT_CLOSED_DURING_SEND' } })
  expect(mocks.tx).not.toHaveBeenCalled(); expect(mocks.active).not.toHaveBeenCalled()
})
