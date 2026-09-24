import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), exchangeCode: vi.fn(), updateUser: vi.fn(), resetPassword: vi.fn(), signup: vi.fn(), login: vi.fn(),
  findUser: vi.fn(), upsertUser: vi.fn(), updateDbUser: vi.fn(),
  upsertProfile: vi.fn(), syncMetadata: vi.fn(), capture: vi.fn(),
}))
vi.mock('@/lib/server', () => ({ createClient: async () => ({ auth: {
  getUser: mocks.getUser, exchangeCodeForSession: mocks.exchangeCode,
  updateUser: mocks.updateUser, resetPasswordForEmail: mocks.resetPassword,
  signUp: mocks.signup, signInWithPassword: mocks.login,
} }) }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ auth: { admin: { updateUserById: mocks.syncMetadata } } }) }))
vi.mock('@/lib/db', () => ({ default: {
  user: { findUnique: mocks.findUser, upsert: mocks.upsertUser, update: mocks.updateDbUser },
  individualProfile: { upsert: mocks.upsertProfile }, organizationProfile: { upsert: mocks.upsertProfile },
} }))
vi.mock('@/lib/posthog', () => ({ captureServerEvent: mocks.capture }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: (_url: string, _key: string, options: {
  cookies: { setAll: (cookies: { name: string; value: string }[]) => void }
}) => {
  options.cookies.setAll([{ name: 'refreshed-session', value: 'test-cookie' }])
  return { auth: { getUser: mocks.getUser } }
} }))

import { GET } from '@/app/auth/callback/route'
import { getOnboardingState } from '@/app/onboarding/actions'
import { submitProfile } from '@/app/actions/profile'
import { updateSession } from '@/lib/proxy'
import { requireVerifiedUserId } from '@/lib/action-helpers'
import { updatePassword } from '@/app/(auth)/reset-password/actions'
import { login, signup } from '@/app/(auth)/sign-in/actions'

const completeUser = { id: 'user-1', app_metadata: { kyc_verified: true, profile_completed: true, username: 'renter' } }
const profileData = { full_name: 'Test Renter', date_of_birth: '1990-01-01', country: 'Nigeria', state: 'Lagos', address: 'Test address', phone_number: '+2348000000000' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: completeUser }, error: null })
  mocks.exchangeCode.mockResolvedValue({ error: null })
  mocks.syncMetadata.mockResolvedValue({ error: null })
  mocks.findUser.mockResolvedValue({ ...completeUser, kyc_verified: true, account_type: 'individual' })
})

describe('callback and proxy', () => {
  it('leaves only the exact media worker route to its bearer authorization', async () => {
    const response = await updateSession(new NextRequest('https://rentral.example/api/internal/media-worker'))
    expect(response.headers.get('location')).toBeNull()
    expect(mocks.getUser).not.toHaveBeenCalled()
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const other = await updateSession(new NextRequest('https://rentral.example/api/internal/media-worker-other'))
    expect(other.headers.get('location')).toBe('https://rentral.example/sign-in')
    expect(mocks.getUser).toHaveBeenCalledTimes(1)
  })
  function credentials() {
    const form = new FormData()
    form.set('email', 'renter@example.test')
    form.set('password', 'test-password')
    return form
  }
  it('does not label a Supabase outage as incorrect credentials', async () => {
    mocks.login.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0 } })
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
  it('routes an incomplete login to onboarding', async () => {
    mocks.login.mockResolvedValue({ error: null })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', app_metadata: {} } }, error: null })
    expect(await login(credentials())).toEqual({ success: true, redirectTo: '/onboarding' })
  })
  it('does not call signup for invalid credentials', async () => {
    expect(await signup(new FormData())).toMatchObject({ error: expect.any(String) })
    expect(mocks.signup).not.toHaveBeenCalled()
  })
  it('routes signup confirmation through the server callback', async () => {
    mocks.signup.mockResolvedValue({ data: { user: null, session: null }, error: null })
    const form = new FormData()
    form.set('email', 'renter@example.test')
    form.set('password', 'test-password')
    expect(await signup(form)).toMatchObject({ success: true, redirectTo: '/sign-in' })
    expect(mocks.signup).toHaveBeenCalledWith(expect.objectContaining({
      options: { emailRedirectTo: expect.stringMatching(/\/auth\/callback$/) },
    }))
  })
  it('does not redirect a signed-in user off-site', async () => {
    const response = await GET(new Request('https://rentral.example/auth/callback?code=valid&next=https://evil.example'))
    expect(response.headers.get('location')).toBe('https://rentral.example/marketplace')
  })
  it('routes an incomplete account to password recovery', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', app_metadata: {} } } })
    const response = await GET(new Request('https://rentral.example/auth/callback?code=valid&next=/reset-password'))
    expect(response.headers.get('location')).toBe('https://rentral.example/reset-password')
  })
  it('preserves refreshed cookies when sending a user to onboarding', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', app_metadata: {} } } })
    const response = await updateSession(new NextRequest('https://rentral.example/marketplace'))
    expect(response.headers.get('location')).toBe('https://rentral.example/onboarding')
    expect(response.cookies.get('refreshed-session')?.value).toBe('test-cookie')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})

describe('verification remains authoritative', () => {
  it('never restores revoked KYC based on a username', async () => {
    mocks.upsertUser.mockResolvedValue({ username: 'renter', kyc_verified: false, verification_status: 'declined' })
    expect(await getOnboardingState()).toMatchObject({ kycVerified: false, verificationStatus: 'declined' })
    expect(mocks.updateDbUser).not.toHaveBeenCalled()
    expect(mocks.syncMetadata).not.toHaveBeenCalled()
  })
  it('rejects direct profile mutations before KYC approval', async () => {
    mocks.findUser.mockResolvedValue({ kyc_verified: false, account_type: 'individual' })
    expect(await submitProfile(profileData)).toMatchObject({ success: false })
    expect(mocks.upsertProfile).not.toHaveBeenCalled()
  })
  it('reports metadata-sync failures instead of claiming setup completed', async () => {
    mocks.syncMetadata.mockResolvedValue({ error: { code: 'unavailable' } })
    expect(await submitProfile(profileData)).toMatchObject({ success: false })
    expect(mocks.capture).not.toHaveBeenCalled()
  })
  it('rejects invalid profile input without writes', async () => {
    expect(await submitProfile({ country: 'Nigeria' })).toMatchObject({ success: false })
    expect(mocks.upsertProfile).not.toHaveBeenCalled()
  })
  it('completes validated profile submission', async () => {
    expect(await submitProfile(profileData)).toEqual({ success: true })
    expect(mocks.syncMetadata).toHaveBeenCalledWith('user-1', expect.objectContaining({ app_metadata: expect.objectContaining({ profile_completed: true }) }))
  })
  it('rejects listing writes when database KYC was revoked despite stale trusted claims', async () => {
    mocks.findUser.mockResolvedValue({ kyc_verified: false, username: 'renter', account_type: 'individual', individualProfile: { id: 'profile-1' } })
    expect(await requireVerifiedUserId()).toBeNull()
  })
  it('requires the profile for the selected account type', async () => {
    mocks.findUser.mockResolvedValue({ kyc_verified: true, username: 'renter', account_type: 'organization', individualProfile: { id: 'profile-1' } })
    expect(await requireVerifiedUserId()).toBeNull()
  })
  it('requires a valid session before password updates', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const input = new FormData()
    input.set('password', 'new-password')
    input.set('confirmPassword', 'new-password')
    expect(await updatePassword(input)).toMatchObject({ success: false })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
})
