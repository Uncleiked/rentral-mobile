import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/types'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), expire: vi.fn(), account: vi.fn(), password: vi.fn(), sessions: vi.fn(), revoke: vi.fn(), email: vi.fn(), cancel: vi.fn(), confirm: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/auth/security-api', () => ({ requireSecurityIdentity: mocks.identity, expireSecurityCookies: mocks.expire }))
vi.mock('@/lib/auth/account-security', () => ({ getAccountSecurity: mocks.account, changeAccountPassword: mocks.password, getAccountSessions: mocks.sessions,
  revokeAccountSessions: mocks.revoke, requestAccountEmailChange: mocks.email, cancelAccountEmailChange: mocks.cancel, confirmAccountEmailChange: mocks.confirm }))
vi.mock('@/lib/auth/api', async original => ({ ...(await original<typeof import('@/lib/auth/api')>()), authLimit: mocks.limit }))

import { GET as account } from '@/app/api/v1/auth/account/route'
import { POST as changePassword } from '@/app/api/v1/auth/password/route'
import { GET as sessions, DELETE as revokeAll } from '@/app/api/v1/auth/sessions/route'
import { DELETE as revoke } from '@/app/api/v1/auth/sessions/[id]/route'
import { POST as email, DELETE as cancel } from '@/app/api/v1/auth/email-change/route'
import { POST as confirm } from '@/app/api/v1/auth/email-change/confirm/route'

const actor = 'f889f677-c3d3-4182-bd60-64066ee1c237', sessionId = '828db1e4-46ec-4774-9d8d-e78058b399d2'
function request(body: unknown) { return new Request('http://localhost:3000/api/v1/auth/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.identity.mockResolvedValue({ userId: actor, sessionId })
  mocks.account.mockResolvedValue({ email: 'member@example.test', delivery: 'unavailable', emailChange: null })
  mocks.sessions.mockResolvedValue({ items: [], nextCursor: null })
  mocks.email.mockResolvedValue({ pending: {}, delivery: 'email' }); mocks.confirm.mockResolvedValue({ status: 'waiting', signInRequired: false })
})

describe('account security HTTP contracts', () => {
  it('authenticates before reading current email or session metadata', async () => {
    mocks.identity.mockRejectedValue(new AuthError(401, 'UNAUTHORIZED', 'Sign in again.'))
    expect((await account(new Request('http://localhost/account'))).status).toBe(401)
    expect(mocks.account).not.toHaveBeenCalled()
  })
  it('keeps account/security responses private with no shared cache', async () => {
    const result = await account(new Request('http://localhost/account'))
    expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.account).toHaveBeenCalledWith(actor)
  })
  it('requires authenticated mutation policy before current-password proof and clears cookies only after success', async () => {
    const result = await changePassword(request({ currentPassword: 'old-password', newPassword: 'new-password-123' }))
    expect(result.status).toBe(200)
    expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), true)
    expect(mocks.password).toHaveBeenCalledWith(actor, { currentPassword: 'old-password', newPassword: 'new-password-123' })
    expect(mocks.expire).toHaveBeenCalledOnce()
    expect(await result.json()).toMatchObject({ data: { changed: true, signInRequired: true } })
  })
  it('does not destroy a valid session when the current-password proof is wrong', async () => {
    mocks.password.mockRejectedValue(new AuthError(400, 'CURRENT_PASSWORD_INCORRECT', 'Your current password is incorrect.'))
    expect((await changePassword(request({ currentPassword: 'wrong', newPassword: 'new-password-123' }))).status).toBe(400)
    expect(mocks.expire).not.toHaveBeenCalled()
  })
  it('passes stable session cursor plus current SID and does not expose tokens', async () => {
    const result = await sessions(new Request('http://localhost/sessions?cursor=older'))
    expect(result.status).toBe(200)
    expect(mocks.sessions).toHaveBeenCalledWith(actor, sessionId, 'older')
    expect(await result.text()).not.toMatch(/refresh_hash|access_token/)
  })
  it('scopes one-session revocation to the authenticated user and clears cookies only for its current SID', async () => {
    const target = 'cd6bf8ce-f1ad-4898-8015-c67f9f703ebd'
    expect((await revoke(new Request('http://localhost/sessions', { method: 'DELETE' }), { params: Promise.resolve({ id: target }) })).status).toBe(200)
    expect(mocks.revoke).toHaveBeenCalledWith(actor, target)
    expect(mocks.expire).not.toHaveBeenCalled()
    expect((await revoke(new Request('http://localhost/sessions', { method: 'DELETE' }), { params: Promise.resolve({ id: sessionId }) })).status).toBe(200)
    expect(mocks.expire).toHaveBeenCalledOnce()
  })
  it('revokes all sessions with authenticated mutation policy and an explicit sign-in-required response', async () => {
    const result = await revokeAll(new Request('http://localhost/sessions', { method: 'DELETE' }))
    expect(mocks.revoke).toHaveBeenCalledWith(actor)
    expect(await result.json()).toMatchObject({ data: { revoked: true, signInRequired: true } })
    expect(mocks.expire).toHaveBeenCalledOnce()
  })
  it('requires authenticated current-password command for email change but never echoes it', async () => {
    const result = await email(request({ newEmail: 'new@example.test', currentPassword: 'PRIVATE_PASSWORD' }))
    expect(result.status).toBe(201)
    expect(mocks.email).toHaveBeenCalledWith(actor, { newEmail: 'new@example.test', currentPassword: 'PRIVATE_PASSWORD' })
    expect(await result.text()).not.toContain('PRIVATE_PASSWORD')
  })
  it('cancels only the authenticated actor pending change', async () => {
    expect((await cancel(new Request('http://localhost/email', { method: 'DELETE' }))).status).toBe(200)
    expect(mocks.cancel).toHaveBeenCalledWith(actor)
  })
  it('uses public token capability plus origin/rate policy without trusting an ambient account', async () => {
    const token = 'A'.repeat(43)
    mocks.confirm.mockResolvedValue({ status: 'completed', signInRequired: true })
    const result = await confirm(request({ token }))
    expect(result.status).toBe(200)
    expect(mocks.limit).toHaveBeenCalledOnce()
    expect(mocks.confirm).toHaveBeenCalledWith({ token })
    expect(mocks.identity).not.toHaveBeenCalled()
    expect(mocks.expire).not.toHaveBeenCalled()
    expect(await result.text()).not.toContain(token)
  })
  it('rejects oversized bodies before confirmation service access', async () => {
    expect((await confirm(request({ token: 'A'.repeat(20000) }))).status).toBe(413)
    expect(mocks.confirm).not.toHaveBeenCalled()
  })
  it('preserves account state on email capability or destination errors', async () => {
    mocks.confirm.mockRejectedValue(new AuthError(400, 'INVALID_EMAIL_CONFIRMATION', 'Code expired or already used.'))
    expect((await confirm(request({ token: 'A'.repeat(43) }))).status).toBe(400)
    expect(mocks.expire).not.toHaveBeenCalled()
  })
})
