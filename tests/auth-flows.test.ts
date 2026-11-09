import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AuthError } from '@/lib/auth/types'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), exchangeCode: vi.fn(), updateUser: vi.fn(), resetPassword: vi.fn(), signup: vi.fn(), login: vi.fn(),
  findUser: vi.fn(), upsertUser: vi.fn(), updateDbUser: vi.fn(),
  upsertProfile: vi.fn(), syncMetadata: vi.fn(), capture: vi.fn(),
  authenticate: vi.fn(), refresh: vi.fn(), resetWithCode: vi.fn(),
}))
vi.mock('@/lib/server', () => ({ createClient: async () => ({ auth: {
  getUser: mocks.getUser, exchangeCodeForSession: mocks.exchangeCode,
  updateUser: mocks.updateUser, resetPasswordForEmail: mocks.resetPassword,
  signUp: mocks.signup, signInWithPassword: mocks.login,
} }) }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ auth: { admin: { updateUserById: mocks.syncMetadata } } }) }))
vi.mock('@/lib/accounts/bootstrap', () => ({ ensureAccountHandle: (id: string) => mocks.findUser({ where: { id } }) }))
vi.mock('@/lib/db', () => ({ default: {
  user: { findUnique: mocks.findUser, upsert: mocks.upsertUser, update: mocks.updateDbUser },
  individualProfile: { upsert: mocks.upsertProfile }, organizationProfile: { upsert: mocks.upsertProfile },
} }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: mocks.capture }))
vi.mock('@/lib/auth/service', () => ({ authenticateAccess: mocks.authenticate, refreshSession: mocks.refresh, resetPassword: mocks.resetWithCode }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { GET } from '@/app/auth/callback/route'
import { POST as retiredVerification } from '@/app/api/verify/route'
import { updateSession } from '@/lib/proxy'
import { requireVerifiedUserId } from '@/lib/action-helpers'
import { updatePassword } from '@/app/(auth)/reset-password/actions'
import { login, signup } from '@/app/(auth)/sign-in/actions'

const completeUser = { id: 'user-1', app_metadata: { kyc_verified: true, profile_completed: true, username: 'renter' } }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: completeUser }, error: null })
  mocks.exchangeCode.mockResolvedValue({ error: null })
  mocks.syncMetadata.mockResolvedValue({ error: null })
  mocks.findUser.mockResolvedValue({ ...completeUser, kyc_verified: true, account_type: 'individual' })
  mocks.authenticate.mockResolvedValue({ user: completeUser, sessionId: 'session-1' })
})

describe('callback and proxy', () => {
  it('leaves only the exact media worker route to its bearer authorization', async () => {
    const response = await updateSession(new NextRequest('https://rentral.example/api/internal/media-worker'))
    expect(response.headers.get('location')).toBeNull()
    expect(mocks.authenticate).not.toHaveBeenCalled()
    mocks.authenticate.mockRejectedValue(new AuthError(401, 'UNAUTHORIZED', 'Expired'))
    const other = await updateSession(new NextRequest('https://rentral.example/api/internal/media-worker-other', { headers: { cookie: 'rentral_access=expired' } }))
    expect(other.headers.get('location')).toBe('https://rentral.example/sign-in')
    expect(mocks.authenticate).toHaveBeenCalledTimes(1)
  })
  function credentials() {
    const form = new FormData()
    form.set('email', 'renter@example.test')
    form.set('password', 'test-password')
    return form
  }
  it('does not label a local authentication outage as incorrect credentials', async () => {
    mocks.login.mockResolvedValue({ error: new AuthError(503, 'AUTH_UNAVAILABLE', 'Database unavailable') })
    expect(await login(credentials())).toEqual({ error: 'Unable to reach the sign-in service. Please try again shortly.' })
    expect(mocks.capture).not.toHaveBeenCalled()
  })
  it('does not report successful login without a verified user', async () => {
    mocks.login.mockResolvedValue({ error: null })
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } })
    expect(await login(credentials())).toMatchObject({ error: expect.any(String) })
    expect(mocks.capture).not.toHaveBeenCalled()
  })
  it('routes a verified login to the marketplace', async () => {
    mocks.login.mockResolvedValue({ error: null })
    expect(await login(credentials())).toEqual({ success: true, redirectTo: '/marketplace' })
  })
  it('routes a new account directly to the marketplace', async () => {
    mocks.login.mockResolvedValue({ error: null })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', app_metadata: {} } }, error: null })
    expect(await login(credentials())).toEqual({ success: true, redirectTo: '/marketplace' })
  })
  it('does not call signup for invalid credentials', async () => {
    expect(await signup(new FormData())).toMatchObject({ error: expect.any(String) })
    expect(mocks.signup).not.toHaveBeenCalled()
  })
  it('routes a newly registered local session directly to the marketplace', async () => {
    mocks.signup.mockResolvedValue({ data: { user: completeUser, session: { user: completeUser } }, error: null })
    const form = new FormData()
    form.set('email', 'renter@example.test')
    form.set('password', 'test-password')
    expect(await signup(form)).toMatchObject({ success: true, redirectTo: '/marketplace' })
    expect(mocks.signup).toHaveBeenCalledWith(expect.objectContaining({ email: 'renter@example.test', password: 'test-password' }))
  })
  it('does not redirect a signed-in user off-site', async () => {
    const response = await GET(new Request('https://rentral.example/auth/callback?code=valid&next=https://evil.example'))
    expect(response.headers.get('location')).toBe('https://rentral.example/sign-in')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.exchangeCode).not.toHaveBeenCalled()
  })
  it('retires legacy provider recovery callbacks without exchanging their code', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', app_metadata: {} } } })
    const response = await GET(new Request('https://rentral.example/auth/callback?code=valid&next=/reset-password'))
    expect(response.headers.get('location')).toBe('https://rentral.example/sign-in')
    expect(mocks.exchangeCode).not.toHaveBeenCalled()
  })
  it('preserves refreshed cookies without sending a new account to onboarding', async () => {
    mocks.authenticate.mockRejectedValue(new AuthError(401, 'UNAUTHORIZED', 'Expired'))
    mocks.refresh.mockResolvedValue({ user: { id: 'user-1', app_metadata: {} }, access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 900 })
    const response = await updateSession(new NextRequest('https://rentral.example/marketplace', { headers: { cookie: 'rentral_access=expired; rentral_refresh=old-refresh' } }))
    expect(response.headers.get('location')).toBeNull()
    expect(response.cookies.get('rentral_access')?.value).toBe('fresh-access')
    expect(response.cookies.get('rentral_refresh')?.value).toBe('fresh-refresh')
  })
})

describe('account access without KYC onboarding', () => {
  it('retires identity initiation without contacting a provider or changing identity', async () => {
    const response = await retiredVerification()
    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ success: false, code: 'VERIFICATION_REMOVED' })
    expect(mocks.upsertUser).not.toHaveBeenCalled()
    expect(mocks.syncMetadata).not.toHaveBeenCalled()
  })
  it('allows existing signed-in accounts without identity, username or profile completion', async () => {
    mocks.findUser.mockResolvedValue({ id: 'user-1', kyc_verified: false, username: null, account_type: null })
    expect(await requireVerifiedUserId()).toBe('user-1')
    expect(mocks.updateDbUser).not.toHaveBeenCalled()
    expect(mocks.syncMetadata).not.toHaveBeenCalled()
  })
  it('still rejects missing accounts and anonymous sessions', async () => {
    mocks.findUser.mockResolvedValue(null)
    expect(await requireVerifiedUserId()).toBeNull()
    mocks.findUser.mockClear()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'anonymous', is_anonymous: true } }, error: null })
    expect(await requireVerifiedUserId()).toBeNull()
    expect(mocks.findUser).not.toHaveBeenCalled()
  })
  it('requires a valid one-use reset code before password updates', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const input = new FormData()
    input.set('password', 'new-password')
    input.set('confirmPassword', 'new-password')
    input.set('token', 'expired-code')
    mocks.resetWithCode.mockRejectedValue(new AuthError(400, 'INVALID_RESET', 'Expired'))
    expect(await updatePassword(input)).toMatchObject({ success: false })
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.resetWithCode).toHaveBeenCalledWith({ token: 'expired-code', password: 'new-password' })
  })
})
