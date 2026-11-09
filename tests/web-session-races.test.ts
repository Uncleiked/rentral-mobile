import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AuthError, type AuthSession } from '@/lib/auth/types'
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies'

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), refresh: vi.fn(), cookies: vi.fn(), revoke: vi.fn(), revokeProof: vi.fn(), revokeRefresh: vi.fn() }))
vi.mock('@/lib/auth/service', () => ({
  authenticateAccess: mocks.authenticate, refreshSession: mocks.refresh, revokeSession: mocks.revoke, revokeRefreshToken: mocks.revokeRefresh,
  revokeAccessToken: mocks.revokeProof,
  loginAccount: vi.fn(), registerAccount: vi.fn(), requestPasswordReset: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))

import { createClient } from '@/lib/server'
import { updateSession } from '@/lib/proxy'
import { refreshWebSession } from '@/lib/auth/web-refresh'
import { requireApiIdentity } from '@/lib/api/auth'
import { GET as getCookieSession } from '@/app/api/v1/auth/web-session/route'

const user = { id: 'f305fc41-73fd-4b8d-a685-b25f3bb8a58b', email: 'member@fixture.invalid', is_anonymous: false as const, app_metadata: {}, user_metadata: {} }
const session: AuthSession = { access_token: 'fresh-access', refresh_token: 'replacement-refresh', token_type: 'bearer', expires_in: 900, expires_at: 9999999999, user }
function request(refresh: string) {
  return new NextRequest('http://localhost:3000/marketplace', { headers: { cookie: `${ACCESS_COOKIE}=expired-access; ${REFRESH_COOKIE}=${refresh}` } })
}
function cookieStore(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial))
  return { get: (name: string) => values.has(name) ? { name, value: values.get(name)! } : undefined,
    set: vi.fn((cookie: { name: string; value: string }) => { values.set(cookie.name, cookie.value) }) }
}
function deferred() {
  let resolve!: (value: AuthSession) => void
  const promise = new Promise<AuthSession>(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.authenticate.mockImplementation(async (token: string) => {
    if (token === session.access_token) return { user, sessionId: 'owned-refreshed-session' }
    throw new AuthError(401, 'UNAUTHORIZED', 'Expired access')
  })
  mocks.refresh.mockResolvedValue(session)
})
afterEach(() => vi.unstubAllEnvs())

describe('local Expo web preflight', () => {
  it('permits the account restriction header on localhost OPTIONS without credentials or an authenticated identity', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const origin = 'http://localhost:8090'
    const response = await updateSession(new NextRequest('http://localhost:3000/api/v1/me', { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization, content-type, x-rentral-account',
    } }))
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase().split(',').map(value => value.trim())).toContain('x-rentral-account')
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(mocks.authenticate).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled()
    mocks.cookies.mockResolvedValue(cookieStore({}))
    await expect(requireApiIdentity(new Request('http://localhost:3000/api/v1/me', { headers: {
      Origin: origin, Authorization: 'Bearer invalid-bearer', 'X-Rentral-Account': user.id,
    } }))).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  })
  it.each(['production', 'untrusted-origin'])('keeps the local allowance closed for%s', async kind => {
    vi.stubEnv('NODE_ENV', kind === 'production' ? 'production' : 'development')
    const response = await updateSession(new NextRequest('http://localhost:3000/api/v1/me', { method: 'OPTIONS', headers: {
      Origin: kind === 'production' ? 'http://localhost:8090' : 'https://attacker.invalid',
      'Access-Control-Request-Headers': 'x-rentral-account',
    } }))
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull()
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })
})

describe('cookie refresh concurrency', () => {
  it('shares one pending rotation across proxy and server requests and writes the same replacement cookies', async () => {
    const pending = deferred()
    mocks.refresh.mockReturnValue(pending.promise)
    const store = cookieStore({ [ACCESS_COOKIE]: 'expired-access', [REFRESH_COOKIE]: 'shared-refresh' })
    mocks.cookies.mockResolvedValue(store)
    const client = await createClient()
    const first = updateSession(request('shared-refresh'))
    const second = updateSession(request('shared-refresh'))
    const third = client.auth.getUser()
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
    pending.resolve(session)
    const [firstResponse, secondResponse, authenticated] = await Promise.all([first, second, third])
    expect(authenticated).toEqual({ data: { user, sessionId: 'owned-refreshed-session' }, error: null })
    for (const response of [firstResponse, secondResponse]) {
      expect(response.headers.get('location')).toBeNull()
      expect(response.cookies.get(ACCESS_COOKIE)?.value).toBe(session.access_token)
      expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe(session.refresh_token)
    }
    expect(store.get(ACCESS_COOKIE)?.value).toBe(session.access_token)
    expect(store.get(REFRESH_COOKIE)?.value).toBe(session.refresh_token)
  })

  it('does not erase winning cookies when an old refresh token is rejected', async () => {
    mocks.refresh.mockRejectedValue(new AuthError(401, 'UNAUTHORIZED', 'Already rotated'))
    const response = await updateSession(request('rejected-refresh'))
    expect(response.headers.get('location')).toBe('http://localhost:3000/sign-in')
    expect(response.headers.get('set-cookie')).toBeNull()
    mocks.refresh.mockResolvedValue(session)
    expect((await updateSession(request('rejected-refresh'))).cookies.get(ACCESS_COOKIE)?.value).toBe(session.access_token)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('preserves cookies and avoids rotation during a session database outage', async () => {
    mocks.authenticate.mockRejectedValue(new AuthError(503, 'AUTH_UNAVAILABLE', 'Database unavailable'))
    const response = await updateSession(request('outage-refresh'))
    expect(response.headers.get('location')).toBe('http://localhost:3000/sign-in')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('refreshes legacy cookies that have no retained access proof', async () => {
    const store = cookieStore({ [REFRESH_COOKIE]: 'refresh-without-access' })
    mocks.cookies.mockResolvedValue(store)
    expect(await (await createClient()).auth.getUser()).toEqual({ data: { user, sessionId: 'owned-refreshed-session' }, error: null })
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(store.get(ACCESS_COOKIE)?.value).toBe(session.access_token)
  })

  it('never substitutes a cookie identity for an invalid explicit bearer token', async () => {
    const store = cookieStore({ [REFRESH_COOKIE]: 'valid-cookie-refresh' })
    mocks.cookies.mockResolvedValue(store)
    const result = await (await createClient()).auth.getUser('invalid-bearer')
    expect(result.data.user).toBeNull()
    expect(result.error).toMatchObject({ status: 401 })
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('attempts a refresh-only cookie once when that token has been revoked', async () => {
    const store = cookieStore({ [REFRESH_COOKIE]: 'revoked-cookie-refresh' })
    mocks.cookies.mockResolvedValue(store)
    mocks.refresh.mockRejectedValue(new AuthError(401, 'UNAUTHORIZED', 'Revoked'))
    const result = await (await createClient()).auth.getUser()
    expect(result.data.user).toBeNull()
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(store.set).not.toHaveBeenCalled()
  })

  it('reports a session database outage as503 instead of a successful signed-out response', async () => {
    mocks.cookies.mockResolvedValue(cookieStore({ [ACCESS_COOKIE]: 'known-access' }))
    mocks.authenticate.mockRejectedValue(new AuthError(503, 'AUTH_UNAVAILABLE', 'Database unavailable'))
    const response = await getCookieSession()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ success: false, code: 'AUTH_UNAVAILABLE' })
  })

  it('reports an ordinary signed-out browser without an auth error', async () => {
    mocks.cookies.mockResolvedValue(cookieStore({}))
    const response = await getCookieSession()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { user: null } })
  })

  it('bounds pending refreshes and drops settled promises instead of caching credentials', async () => {
    const pending = deferred()
    mocks.refresh.mockReturnValue(pending.promise)
    const work = Array.from({ length: 128 }, (_, index) => refreshWebSession(`capacity-${index}`))
    await expect(refreshWebSession('capacity-overflow')).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE', status: 503 })
    expect(mocks.refresh).toHaveBeenCalledTimes(128)
    pending.resolve(session)
    await Promise.all(work)
    mocks.refresh.mockResolvedValue(session)
    await expect(refreshWebSession('capacity-overflow')).resolves.toEqual(session)
  })
})

describe('cookie logout', () => {
  it('revokes a refresh-only session before expiring cookies', async () => {
    mocks.revokeRefresh.mockResolvedValue(true)
    const store = cookieStore({ [REFRESH_COOKIE]: 'remaining-refresh' })
    mocks.cookies.mockResolvedValue(store)
    expect(await (await createClient()).auth.signOut()).toEqual({ error: null })
    expect(mocks.revokeRefresh).toHaveBeenCalledWith('remaining-refresh')
    expect(store.set).toHaveBeenCalledWith(expect.objectContaining({ name: REFRESH_COOKIE, value: '', maxAge: 0 }))
  })

  it('retains cookies when revocation cannot reach the database', async () => {
    const store = cookieStore({ [ACCESS_COOKIE]: 'known-access', [REFRESH_COOKIE]: 'remaining-refresh' })
    mocks.cookies.mockResolvedValue(store)
    mocks.revokeProof.mockRejectedValue(new AuthError(503, 'AUTH_UNAVAILABLE', 'Database unavailable'))
    expect((await (await createClient()).auth.signOut()).error).toMatchObject({ status: 503 })
    expect(store.set).not.toHaveBeenCalled()
    expect(mocks.revokeRefresh).not.toHaveBeenCalled()
  })
  it('uses a signed expired access proof even when another request consumed the cookie refresh capability', async () => {
    const store = cookieStore({ [ACCESS_COOKIE]: 'signed-expired-proof', [REFRESH_COOKIE]: 'already-consumed-refresh' })
    mocks.cookies.mockResolvedValue(store); mocks.revokeProof.mockResolvedValue(true)
    expect(await (await createClient()).auth.signOut()).toEqual({ error: null })
    expect(mocks.revokeProof).toHaveBeenCalledWith('signed-expired-proof'); expect(mocks.revokeRefresh).not.toHaveBeenCalled()
    expect(store.set).toHaveBeenCalledWith(expect.objectContaining({ name: ACCESS_COOKIE, value: '', maxAge: 0 }))
  })
  it('retains legacy cookies and reports an explicit uncertain logout after refresh rotation', async () => {
    const store = cookieStore({ [REFRESH_COOKIE]: 'already-consumed-refresh' }); mocks.cookies.mockResolvedValue(store); mocks.revokeRefresh.mockResolvedValue(false)
    expect((await (await createClient()).auth.signOut()).error).toMatchObject({ status: 409, code: 'LOGOUT_UNCONFIRMED' })
    expect(store.set).not.toHaveBeenCalled()
  })
})
