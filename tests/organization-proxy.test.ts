import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), refresh: vi.fn(), admitted: vi.fn() }))
vi.mock('@/lib/auth/service', () => ({ authenticateAccess: mocks.authenticate }))
vi.mock('@/lib/auth/web-refresh', () => ({ refreshWebSession: mocks.refresh }))
vi.mock('@/lib/organizations/access', () => ({ organizationMarketplaceAllowed: mocks.admitted, organizationPageExempt: () => false }))
import { updateSession } from '@/lib/proxy'
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies'

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'organization@fixture.invalid', is_anonymous: false as const, app_metadata: {}, user_metadata: {} }
const replacement = { access_token: 'winning-access-token', refresh_token: 'winning-one-use-refresh-token', expires_in: 900, expires_at: 9999999999, token_type: 'bearer' as const, user }
beforeEach(() => { vi.resetAllMocks(); mocks.refresh.mockResolvedValue(replacement); mocks.admitted.mockResolvedValue(false) })
it('preserves a winning refresh rotation if organization readiness subsequently fails', async () => {
  mocks.admitted.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED'))
  const request = new NextRequest('http://localhost:3000/marketplace', { headers: { cookie: REFRESH_COOKIE + '=consumed-original-refresh' } })
  const response = await updateSession(request)
  expect(response.status).toBe(503)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.cookies.get(ACCESS_COOKIE)?.value).toBe(replacement.access_token)
  expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe(replacement.refresh_token)
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith('consumed-original-refresh')
  expect(mocks.admitted).toHaveBeenCalledExactlyOnceWith(user.id)
})
it('keeps refreshed cookies when an organization is redirected to its pending application', async () => {
  const response = await updateSession(new NextRequest('http://localhost:3000/marketplace/listing/create', { headers: { cookie: REFRESH_COOKIE + '=consumed-original-refresh' } }))
  expect(response.status).toBe(307)
  expect(new URL(response.headers.get('location')!).pathname).toBe('/onboarding/organization')
  expect(response.cookies.get(REFRESH_COOKIE)?.value).toBe(replacement.refresh_token)
})
it('does not turn anonymous visitors into organization applicants', async () => {
  const response = await updateSession(new NextRequest('http://localhost:3000/marketplace'))
  expect(response.status).toBe(307)
  expect(new URL(response.headers.get('location')!).pathname).toBe('/sign-in')
  expect(mocks.admitted).not.toHaveBeenCalled()
})
