import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(), updateUser: vi.fn(), createSession: vi.fn(), revokeSessions: vi.fn(), consumeResets: vi.fn(),
  verifyPassword: vi.fn(), hashPassword: vi.fn(), lock: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: mocks.findUser } } }))
vi.mock('@/lib/auth/password', () => ({ verifyPassword: mocks.verifyPassword, hashPassword: mocks.hashPassword }))
vi.mock('@/lib/database/transactions', () => ({
  lockRecord: mocks.lock,
  withTransaction: (work: (tx: unknown) => Promise<unknown>) => work({
    user: { findUnique: mocks.findUser, update: mocks.updateUser },
    authSession: { create: mocks.createSession, updateMany: mocks.revokeSessions },
    passwordReset: { updateMany: mocks.consumeResets },
  }),
}))

import { changePassword, loginAccount } from '@/lib/auth/service'

const userId = 'f305fc41-73fd-4b8d-a685-b25f3bb8a58b'
const sessionId = '024e9cee-996d-4ed4-af2d-bcf752ac0a0a'
let account: { id: string; email: string; password_hash: string; staff_role: null }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('JWT_SECRET', 'isolated-race-fixture-only-signing-key-at-least-32-bytes')
  account = { id: userId, email: `${crypto.randomUUID()}@fixture.invalid`, password_hash: 'old-password-hash', staff_role: null }
  mocks.findUser.mockImplementation(async () => ({ ...account }))
  mocks.updateUser.mockImplementation(async ({ data }: { data: { password_hash: string } }) => { account = { ...account, ...data }; return { ...account } })
  mocks.hashPassword.mockResolvedValue('replacement-password-hash')
  mocks.verifyPassword.mockResolvedValue(true)
  mocks.lock.mockResolvedValue(true)
  mocks.createSession.mockResolvedValue({ id: sessionId })
  mocks.revokeSessions.mockResolvedValue({ count: 1 })
  mocks.consumeResets.mockResolvedValue({ count: 1 })
})
afterEach(() => vi.unstubAllEnvs())

it('rejects an old-password login if a password change commits while verification is in flight', async () => {
  let entered!: () => void
  let finish!: () => void
  const verifying = new Promise<void>(resolve => { entered = resolve })
  const release = new Promise<void>(resolve => { finish = resolve })
  mocks.verifyPassword.mockImplementation(async () => { entered(); await release; return true })
  const signingIn = loginAccount({ email: account.email, password: 'old-password-123' })
  const rejected = expect(signingIn).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 })
  await verifying
  await changePassword(userId, 'replacement-password-456')
  finish()
  await rejected
  expect(account.password_hash).toBe('replacement-password-hash')
  expect(mocks.revokeSessions).toHaveBeenCalledOnce()
  expect(mocks.createSession).not.toHaveBeenCalled()
})

it('issues a session when the verified credential snapshot remains current', async () => {
  const session = await loginAccount({ email: account.email, password: 'old-password-123' })
  expect(session.user.id).toBe(userId)
  expect(mocks.createSession).toHaveBeenCalledOnce()
  expect(mocks.lock).toHaveBeenCalledWith(expect.any(Object), 'user', userId)
  expect(JSON.stringify(session)).not.toContain('old-password-hash')
})
