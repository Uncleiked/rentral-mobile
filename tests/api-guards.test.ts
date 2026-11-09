import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn() }))
vi.mock('@/lib/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: mocks.profile } } }))
import { requireApiIdentity } from '@/lib/api/auth'
import { ApiError, apiFailure, readApiJson } from '@/lib/api/http'
import { apiBearer, cookieMutationOriginAllowed } from '@/lib/api/policy'
import { ApiRateLimiter } from '@/lib/api/rate-limit'
import { authRedirect } from '@/lib/auth-policy'

const appUrl = 'https://rentral.example'
let identityNumber = 0
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl)
  vi.stubEnv('NODE_ENV', 'test')
  identityNumber += 1
  mocks.getUser.mockResolvedValue({ data: { user: { id: `api-user-${identityNumber}`, is_anonymous: false, user_metadata: { kyc_verified: true } } }, error: null })
  mocks.profile.mockResolvedValue({ kyc_verified: true, username: 'member', account_type: 'individual', individualProfile: { id: 'profile' }, organizationProfile: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('API identity and authorization', () => {
  it('gates new-table domains before touching auth or the database', async () => {
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
    await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/bookings`), { platform: true })).rejects.toMatchObject({ status: 503 })
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.profile).not.toHaveBeenCalled()
  })

  it('validates bearer credentials through the live JWT session adapter', async () => {
    const request = new Request(`${appUrl}/api/v1/bookings`, { method: 'POST', headers: { authorization: 'Bearer opaque.valid-token' } })
    await expect(requireApiIdentity(request, { mutation: true, verified: true })).resolves.toMatchObject({ mode: 'bearer' })
    expect(mocks.getUser).toHaveBeenCalledWith('opaque.valid-token')
    expect(mocks.profile).toHaveBeenCalledWith(expect.objectContaining({ where: { id: `api-user-${identityNumber}` } }))
  })

  it('rejects malformed authorization rather than falling back to cookies', async () => {
    await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/listings`, { headers: { authorization: 'Basic arbitrary' } }))).rejects.toMatchObject({ status: 401 })
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(apiBearer('Bearer token with spaces')).toBeNull()
  })

  it('requires a matching Origin for cookie-authenticated mutations', async () => {
    for (const origin of [undefined, 'https://attacker.example', 'null']) {
      const headers = origin ? { origin } : undefined
      await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/bookings`, { method: 'POST', headers }), { mutation: true })).rejects.toMatchObject({ status: 403 })
    }
    expect(mocks.getUser).not.toHaveBeenCalled()
    await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/bookings`, { method: 'POST', headers: { origin: appUrl } }), { mutation: true })).resolves.toMatchObject({ mode: 'cookie' })
    expect(mocks.getUser).toHaveBeenCalledWith()
  })

  it('allows an authenticated account with no KYC, username or completed profile', async () => {
    mocks.profile.mockResolvedValue({ id: 'member', kyc_verified: false, username: null, account_type: null, individualProfile: null, organizationProfile: null })
    await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/bookings`, { headers: { authorization: 'Bearer token' } }), { verified: true })).resolves.toMatchObject({ mode: 'bearer' })
    expect(mocks.profile).toHaveBeenCalledWith({ where: { id: `api-user-${identityNumber}` }, select: { id: true } })
  })

  it('still rejects a missing account before a protected mutation', async () => {
    mocks.profile.mockResolvedValue(null)
    await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/bookings`, { headers: { authorization: 'Bearer token' } }), { verified: true })).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_REQUIRED' })
  })

  it('rejects expired credentials and anonymous accounts', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'sensitive provider detail' } })
    await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/listings`))).rejects.toMatchObject({ status: 401 })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'anonymous', is_anonymous: true } }, error: null })
    await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/listings`))).rejects.toMatchObject({ status: 401 })
  })

  it('returns private JSON errors without exposing provider diagnostics', async () => {
    const response = apiFailure(new ApiError(401, 'UNAUTHORIZED', 'A valid sign-in is required.'), 'test')
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toEqual({ success: false, error: 'A valid sign-in is required.', code: 'UNAUTHORIZED' })
  })
  it.each(['cookie', 'bearer'])('denies a stale %s form after the signed-in account changes and accepts only a matching restriction', async mode => {
    const auth: Record<string, string> = mode === 'bearer' ? { authorization: 'Bearer valid-token' } : {}
    for (const expected of ['another-account', '']) {
      await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/financial/operations`, { method: 'POST', headers: { ...auth, origin: appUrl, 'X-Rentral-Account': expected } }), { mutation: true, verified: true }))
        .rejects.toMatchObject({ status: 409, code: 'ACCOUNT_CHANGED' })
    }
    expect(mocks.profile).not.toHaveBeenCalled()
    await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/financial/operations`, { method: 'POST', headers: { ...auth, origin: appUrl, 'X-Rentral-Account': `api-user-${identityNumber}` } }), { mutation: true, verified: true }))
      .resolves.toMatchObject({ userId: `api-user-${identityNumber}` })
  })
  it('never treats an expected-account header as authentication', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(requireApiIdentity(new Request(`${appUrl}/api/v1/auth/account`, { headers: { 'X-Rentral-Account': 'forged-account' } }))).rejects.toMatchObject({ status: 401 })
  })
})

describe('origin and route boundaries', () => {
  it('allows same-origin cookie writes and confines port exceptions to local development', () => {
    expect(cookieMutationOriginAllowed(new Request(`${appUrl}/api/v1/bookings`, { headers: { origin: appUrl } }), appUrl, 'production')).toBe(true)
    expect(cookieMutationOriginAllowed(new Request(`${appUrl}/api/v1/bookings`, { headers: { origin: 'https://rentral.example/forged-path' } }), appUrl, 'production')).toBe(false)
    const local = new Request('http://localhost:3001/api/v1/bookings', { headers: { origin: 'http://localhost:3001' } })
    expect(cookieMutationOriginAllowed(local, 'http://localhost:3000', 'development')).toBe(true)
    expect(cookieMutationOriginAllowed(local, 'http://localhost:3000', 'production')).toBe(false)
  })

  it('bypasses browser redirects only for the exact versioned API family and public pages', () => {
    for (const path of ['/api/v1', '/api/v1/listings', '/api/v1/messages/thread', '/help', '/terms', '/privacy', '/insights']) expect(authRedirect(path, null)).toBeNull()
    for (const path of ['/api/v1-evil', '/api/v10/listings', '/help-evil', '/marketplace/admin']) expect(authRedirect(path, null)).toBe('/sign-in')
  })
})

describe('bounded transport and rate limits', () => {
  it('counts bytes from the actual body, including a false small Content-Length', async () => {
    const request = new Request(`${appUrl}/api/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1' }, body: JSON.stringify({ body: 'x'.repeat(200) }) })
    await expect(readApiJson(request, 100)).rejects.toMatchObject({ status: 413 })
    await expect(readApiJson(new Request(`${appUrl}/api/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' }))).rejects.toMatchObject({ status: 400 })
    await expect(readApiJson(new Request(`${appUrl}/api/v1/messages`, { method: 'POST', body: '{}' }))).rejects.toMatchObject({ status: 415 })
  })

  it('limits a user per time window and keeps independent identities separate', () => {
    const limiter = new ApiRateLimiter(2)
    expect(limiter.allow('one:write', 2, 1000)).toBe(true)
    expect(limiter.allow('one:write', 2, 1000)).toBe(true)
    expect(limiter.allow('one:write', 2, 1000)).toBe(false)
    expect(limiter.allow('two:write', 2, 1000)).toBe(true)
    expect(limiter.allow('one:write', 2, 61000)).toBe(true)
  })
})
