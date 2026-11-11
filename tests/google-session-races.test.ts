import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenHash } from '@/lib/auth/token'
const state = vi.hoisted(() => ({ user: vi.fn(), identity: vi.fn(), create: vi.fn(), lock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: state.user } } }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: state.lock, withTransaction: (run: (tx: unknown) => unknown) => run({ user: { findUnique: state.user }, googleIdentity: { findUnique: state.identity }, authSession: { create: state.create } }) }))
import { createGoogleAccountSession } from '@/lib/auth/service'
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', password_hash: 'current-hash', staff_role: 'owner', closed_at: null, suspended_at: null }
const fingerprint = tokenHash(JSON.stringify([user.email, user.password_hash]))
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('JWT_SECRET', 'google-session-fixture-key-that-is-long-enough'); state.lock.mockResolvedValue(true); state.user.mockResolvedValue(user); state.identity.mockResolvedValue({ user_id: user.id, credential_fingerprint: fingerprint }); state.create.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222' }) })
afterEach(() => vi.unstubAllEnvs())
describe('Google session creation serializes credential and availability checks', () => {
  it('preserves the current database staff role and creates ordinary JWT sessions', async () => {
    const session = await createGoogleAccountSession(user.id, 'verified-google-subject', fingerprint)
    expect(session.user.app_metadata).toEqual({ role: 'owner' })
    expect(state.lock).toHaveBeenCalledWith(expect.anything(), 'user', user.id)
    expect(state.create).toHaveBeenCalledOnce()
    expect(session).not.toHaveProperty('provider_token')
  })
  it('rejects a password reset between provider verification and session creation', async () => {
    state.user.mockResolvedValue({ ...user, password_hash: 'replacement-hash' })
    await expect(createGoogleAccountSession(user.id, 'verified-google-subject', fingerprint)).rejects.toMatchObject({ code: 'GOOGLE_RECONFIRM' })
    expect(state.create).not.toHaveBeenCalled()
  })
  it('rejects a credential change after the initial user read but before its write lock', async () => {
    state.user.mockResolvedValueOnce(user).mockResolvedValue({ ...user, password_hash: 'replacement-hash' })
    await expect(createGoogleAccountSession(user.id, 'verified-google-subject', fingerprint)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(state.create).not.toHaveBeenCalled()
  })
  it('rejects changed bindings and unavailable accounts without creating sessions', async () => {
    state.identity.mockResolvedValue({ user_id: 'another-user', credential_fingerprint: fingerprint })
    await expect(createGoogleAccountSession(user.id, 'verified-google-subject', fingerprint)).rejects.toMatchObject({ code: 'GOOGLE_RECONFIRM' })
    state.user.mockResolvedValue({ ...user, suspended_at: new Date() })
    await expect(createGoogleAccountSession(user.id, 'verified-google-subject', fingerprint)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(state.create).not.toHaveBeenCalled()
  })
})
