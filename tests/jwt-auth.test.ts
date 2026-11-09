import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT } from 'jose'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { accessClaims, accessToken, signingKey, tokenHash } from '@/lib/auth/token'

const mocks = vi.hoisted(() => ({
  userFind: vi.fn(), userCreate: vi.fn(), sessionFind: vi.fn(), sessionCreate: vi.fn(), sessionUpdate: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ default: {
  user: { findUnique: mocks.userFind, create: mocks.userCreate },
  authSession: { findUnique: mocks.sessionFind, create: mocks.sessionCreate, updateMany: mocks.sessionUpdate },
} }))
vi.mock('@/lib/database/transactions', () => ({
  withTransaction: (work: (tx: unknown) => Promise<unknown>) => work({ user: { findUnique: mocks.userFind }, authSession: { create: mocks.sessionCreate } }),
  lockRecord: async () => true,
}))
import { authenticateAccess, loginAccount, refreshSession, registerAccount, revokeRefreshToken, revokeSession } from '@/lib/auth/service'

const userId = 'f305fc41-73fd-4b8d-a685-b25f3bb8a58b'
const sessionId = '024e9cee-996d-4ed4-af2d-bcf752ac0a0a'
const user = { id: userId, email: 'member@example.test', staff_role: null, password_hash: null }
let currentAccount: Omit<typeof user, 'password_hash'> & { password_hash: string | null }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('JWT_SECRET', 'fixture-signing-secret-at-least-thirty-two-bytes')
  currentAccount = { ...user }
  mocks.userCreate.mockImplementation(async ({ data }: { data: { email: string; password_hash: string } }) => { currentAccount = { ...user, ...data }; return { ...currentAccount } })
  mocks.userFind.mockImplementation(async () => ({ ...currentAccount }))
  mocks.sessionCreate.mockResolvedValue({ id: sessionId }); mocks.sessionUpdate.mockResolvedValue({ count: 1 })
})
afterEach(() => vi.unstubAllEnvs())

describe('JWT signatures and session boundaries', () => {
  it('binds an expiring signed JWT to the user and database session', async () => {
    const token = await accessToken(userId, sessionId)
    expect(await accessClaims(token)).toEqual({ userId, sessionId })
    await expect(accessClaims(`${token.slice(0, -8)}tampered`)).rejects.toMatchObject({ status: 401 })
  })
  it('rejects expired tokens and tokens for another audience', async () => {
    const expired = await new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setAudience('rentral-app').setIssuer('rentral').setExpirationTime(1).setIssuedAt(0).sign(signingKey())
    await expect(accessClaims(expired)).rejects.toMatchObject({ status: 401 })
    const wrongAudience = await new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setAudience('another-app').setIssuer('rentral').setExpirationTime('1h').sign(signingKey())
    await expect(accessClaims(wrongAudience)).rejects.toMatchObject({ status: 401 })
  })
  it('fails closed without a strong backend-only signing secret', () => {
    vi.stubEnv('JWT_SECRET', 'short')
    expect(signingKey).toThrow('not configured')
  })
  it('checks session revocation and current database staff role on each request', async () => {
    const token = await accessToken(userId, sessionId)
    mocks.sessionFind.mockResolvedValue({ user_id: userId, revoked_at: null, expires_at: new Date(Date.now() + 60000), user })
    expect((await authenticateAccess(token)).user.app_metadata).toEqual({})
    mocks.sessionFind.mockResolvedValue({ user_id: userId, revoked_at: new Date(), expires_at: new Date(Date.now() + 60000), user })
    await expect(authenticateAccess(token)).rejects.toMatchObject({ status: 401 })
  })
  it('does not accept a session owned by another account', async () => {
    const token = await accessToken(userId, sessionId)
    mocks.sessionFind.mockResolvedValue({ user_id: 'someone-else', revoked_at: null, expires_at: new Date(Date.now() + 60000), user })
    await expect(authenticateAccess(token)).rejects.toMatchObject({ status: 401 })
  })
})

describe('MongoDB account credentials', () => {
  it('stores a salted slow password hash and never returns it to clients', async () => {
    const result = await registerAccount({ email: 'Member@Example.test', password: 'local-password-123' })
    const inserted = mocks.userCreate.mock.calls[0][0].data
    expect(inserted.email).toBe('member@example.test')
    expect(inserted.password_hash).toMatch(/^scrypt-v1:/)
    expect(inserted.password_hash).not.toContain('local-password-123')
    expect(inserted).not.toHaveProperty('staff_role')
    expect(inserted).not.toHaveProperty('kyc_verified')
    expect(JSON.stringify(result)).not.toContain('password_hash')
    expect(JSON.stringify(result)).not.toContain('local-password-123')
    expect(result.user.email).toBe('member@example.test')
  })
  it('gives identical passwords different salts and verifies without plaintext storage', async () => {
    const first = await hashPassword('an-example-password')
    const second = await hashPassword('an-example-password')
    expect(first).not.toBe(second)
    expect(await verifyPassword('an-example-password', first)).toBe(true)
    expect(await verifyPassword('wrong', first)).toBe(false)
    expect(await verifyPassword('wrong', 'malformed')).toBe(false)
  })
  it('rejects actor/role injections and weak signup passwords', async () => {
    await expect(registerAccount({ email: 'member@example.test', password: 'local-password-123', staff_role: 'admin' })).rejects.toThrow()
    await expect(registerAccount({ email: 'member@example.test', password: 'short' })).rejects.toThrow()
    expect(mocks.userCreate).not.toHaveBeenCalled()
  })
  it('does not authenticate unknown emails or missing password hashes', async () => {
    mocks.userFind.mockResolvedValue(null)
    await expect(loginAccount({ email: 'unknown@example.test', password: 'local-password-123' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    mocks.userFind.mockResolvedValue(user)
    await expect(loginAccount({ email: user.email, password: 'local-password-123' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(mocks.sessionCreate).not.toHaveBeenCalled()
  })
  it('rotates refresh tokens with a compare-and-swap and stores only their hash', async () => {
    const token = 'a'.repeat(43)
    mocks.sessionFind.mockResolvedValue({ id: sessionId, user_id: userId, revoked_at: null, expires_at: new Date(Date.now() + 60000), user })
    const result = await refreshSession(token)
    expect(result.refresh_token).not.toBe(token)
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: sessionId, refresh_hash: tokenHash(token) }), data: { refresh_hash: tokenHash(result.refresh_token) } }))
    mocks.sessionUpdate.mockResolvedValue({ count: 0 })
    await expect(refreshSession(token)).rejects.toMatchObject({ status: 401 })
  })
  it('does not consume a refresh token while the signing secret is unavailable', async () => {
    vi.stubEnv('JWT_SECRET', 'short')
    await expect(refreshSession('a'.repeat(43))).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE', status: 503 })
    expect(mocks.sessionUpdate).not.toHaveBeenCalled()
  })
  it('revokes only the selected session', async () => {
    await revokeSession(sessionId)
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({ where: { id: sessionId, revoked_at: null }, data: { revoked_at: expect.any(Date) } })
  })
  it('revokes an opaque refresh credential by its hash when the access cookie has expired', async () => {
    const token = 'a'.repeat(43)
    await revokeRefreshToken(token)
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({ where: { refresh_hash: tokenHash(token), revoked_at: null }, data: { revoked_at: expect.any(Date) } })
    await revokeRefreshToken('malformed')
    expect(mocks.sessionUpdate).toHaveBeenCalledOnce()
  })
})
