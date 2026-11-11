import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
const state = vi.hoisted(() => ({ identityFind: vi.fn(), identityCreate: vi.fn(), identityUpdate: vi.fn(), userFind: vi.fn(), userCreate: vi.fn(), ready: vi.fn(), issue: vi.fn(), password: vi.fn(), lock: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { googleIdentity: { findUnique: state.identityFind }, user: { findUnique: state.userFind } } }))
vi.mock('@/lib/database/readiness', () => ({ assertGoogleAuthReady: state.ready }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: state.lock, withTransaction: (run: (tx: unknown) => unknown) => run({ googleIdentity: { findUnique: state.identityFind, create: state.identityCreate, updateMany: state.identityUpdate }, user: { findUnique: state.userFind, create: state.userCreate } }) }))
vi.mock('@/lib/auth/service', () => ({ createGoogleAccountSession: state.issue }))
vi.mock('@/lib/auth/password', () => ({ verifyPassword: state.password }))
vi.mock('@/lib/api/rate-limit', () => ({ apiRateLimiter: { allow: state.limit } }))
import { completeVerifiedGoogle, finishGoogleAccount } from '@/lib/auth/google-accounts'
const identity = { subject: 'google-subject-123', email: 'person@example.test' }, userId = '11111111-1111-4111-8111-111111111111'
const credentialFingerprint = (email = identity.email, passwordHash = 'existing-hash') => createHash('sha256').update(JSON.stringify([email, passwordHash])).digest('hex')
const account = { id: userId, email: identity.email, password_hash: 'existing-hash', closed_at: null, suspended_at: null }
beforeEach(() => {
  vi.clearAllMocks()
  state.identityFind.mockResolvedValue(null); state.userFind.mockResolvedValue(null); state.userCreate.mockResolvedValue({}); state.identityCreate.mockResolvedValue({}); state.identityUpdate.mockResolvedValue({ count: 1 })
  state.ready.mockResolvedValue(undefined); state.issue.mockResolvedValue({ user: { id: userId } }); state.lock.mockResolvedValue(true); state.limit.mockReturnValue(true); state.password.mockResolvedValue(true)
})
afterEach(() => vi.restoreAllMocks())
describe('Google accounts share MongoDB users without email auto-linking', () => {
  it('uses immutable Google subject for existing users without changing their role or account type', async () => {
    state.identityFind.mockResolvedValue({ user_id: userId, credential_fingerprint: credentialFingerprint() }); state.userFind.mockResolvedValue(account)
    expect(await completeVerifiedGoogle(identity, { mode: 'signup', accountType: 'organization', termsAccepted: true })).toMatchObject({ kind: 'session' })
    expect(state.issue).toHaveBeenCalledWith(userId, identity.subject, credentialFingerprint())
    expect(state.userCreate).not.toHaveBeenCalled(); expect(state.identityCreate).not.toHaveBeenCalled()
  })
  it('requires password confirmation when an existing email matches', async () => {
    state.userFind.mockResolvedValue(account)
    const result = await completeVerifiedGoogle(identity, { mode: 'signin' })
    expect(result).toMatchObject({ kind: 'finish', challenge: { kind: 'link', userId } })
    expect(state.issue).not.toHaveBeenCalled(); expect(state.identityCreate).not.toHaveBeenCalled()
  })
  it('requires account type before a sign-in can create a new account', async () => {
    expect(await completeVerifiedGoogle(identity, { mode: 'signin' })).toEqual({ kind: 'finish', challenge: { kind: 'new', identity } })
    expect(state.userCreate).not.toHaveBeenCalled()
  })
  it('creates a Google organization with no fabricated password, privileges or KYC', async () => {
    await completeVerifiedGoogle(identity, { mode: 'signup', accountType: 'organization', termsAccepted: true })
    const saved = state.userCreate.mock.calls[0][0].data
    expect(saved).toMatchObject({ email: identity.email, account_type: 'organization', password_hash: null })
    expect(saved).not.toHaveProperty('staff_role'); expect(saved).not.toHaveProperty('kyc_verified')
    expect(state.identityCreate.mock.calls[0][0].data).toMatchObject({ id: identity.subject, user_id: saved.id })
  })
  it('fails closed before new identity writes until setup is prepared', async () => {
    state.ready.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED'))
    await expect(completeVerifiedGoogle(identity, { mode: 'signin' })).rejects.toThrow('DATABASE_SETUP_REQUIRED')
    expect(state.userFind).not.toHaveBeenCalled()
  })
  it('does not connect suspended or closed accounts', async () => {
    state.userFind.mockResolvedValue({ ...account, suspended_at: new Date() })
    await expect(completeVerifiedGoogle(identity, { mode: 'signin' })).rejects.toMatchObject({ status: 401 })
    expect(state.identityCreate).not.toHaveBeenCalled()
  })
  it('confirms the existing password and credential snapshot under a user write lock', async () => {
    state.userFind.mockResolvedValue(account)
    const result = await completeVerifiedGoogle(identity, { mode: 'signin' })
    if (result.kind !== 'finish') throw Error('Missing challenge')
    await finishGoogleAccount(result.challenge, { password: 'existing-password' })
    expect(state.password).toHaveBeenCalledWith('existing-password', 'existing-hash')
    expect(state.lock).toHaveBeenCalledWith(expect.anything(), 'user', userId)
    expect(state.identityCreate).toHaveBeenCalledWith({ data: { id: identity.subject, user_id: userId, email_at_link: identity.email, credential_fingerprint: credentialFingerprint() } })
    expect(state.issue).toHaveBeenCalledWith(userId, identity.subject, credentialFingerprint())
  })
  it('rejects wrong passwords, changed credentials and replayed link attempts', async () => {
    const fingerprint = createHash('sha256').update(JSON.stringify([account.email, account.password_hash])).digest('hex')
    const challenge = { kind: 'link' as const, userId, fingerprint, identity }
    state.userFind.mockResolvedValue(account); state.password.mockResolvedValue(false)
    await expect(finishGoogleAccount(challenge, { password: 'wrong' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    state.password.mockResolvedValue(true); state.userFind.mockResolvedValueOnce(account).mockResolvedValue({ ...account, password_hash: 'new-hash' })
    await expect(finishGoogleAccount(challenge, { password: 'old' })).rejects.toMatchObject({ code: 'GOOGLE_RESTART' })
    state.userFind.mockResolvedValue(account); state.identityFind.mockResolvedValue({ user_id: userId, credential_fingerprint: credentialFingerprint() })
    await expect(finishGoogleAccount(challenge, { password: 'existing-password' })).rejects.toMatchObject({ code: 'GOOGLE_RESTART' })
    expect(state.identityCreate).not.toHaveBeenCalled()
  })
  it('requires password reconfirmation after password or email changes without abandoning the stable provider binding', async () => {
    state.identityFind.mockResolvedValue({ user_id: userId, credential_fingerprint: credentialFingerprint() })
    state.userFind.mockResolvedValue({ ...account, email: 'changed@example.test', password_hash: 'changed-password-hash' })
    const result = await completeVerifiedGoogle(identity, { mode: 'signin' })
    expect(result.kind).toBe('finish'); expect(state.issue).not.toHaveBeenCalled()
    if (result.kind !== 'finish') throw Error('Missing challenge')
    await finishGoogleAccount(result.challenge, { password: 'current-password' })
    expect(state.identityUpdate).toHaveBeenCalledWith({ where: { id: identity.subject, user_id: userId, credential_fingerprint: credentialFingerprint() }, data: { credential_fingerprint: credentialFingerprint('changed@example.test', 'changed-password-hash') } })
    expect(state.issue).toHaveBeenCalledWith(userId, identity.subject, credentialFingerprint('changed@example.test', 'changed-password-hash'))
  })
  it('requires signup consent and never replays a new-account continuation', async () => {
    await expect(finishGoogleAccount({ kind: 'new', identity }, { accountType: 'individual' })).rejects.toMatchObject({ code: 'ACCOUNT_TYPE_REQUIRED' })
    state.identityFind.mockResolvedValue({ user_id: userId })
    await expect(finishGoogleAccount({ kind: 'new', identity }, { accountType: 'individual', termsAccepted: true })).rejects.toMatchObject({ code: 'GOOGLE_RESTART' })
    expect(state.userCreate).not.toHaveBeenCalled()
  })
})
