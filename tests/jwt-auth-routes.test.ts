import { beforeEach, expect, it, vi } from 'vitest'
import { AuthError } from '@/lib/auth/types'

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), revoke: vi.fn(), refreshRevoke: vi.fn() }))
vi.mock('@/lib/auth/service', () => ({ authenticateAccess: mocks.authenticate, revokeSession: mocks.revoke, revokeRefreshToken: mocks.refreshRevoke }))
vi.mock('@/lib/auth/api', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/auth/api')>()), authLimit: vi.fn() }))
import { POST } from '@/app/api/v1/auth/logout/route'

beforeEach(() => { vi.resetAllMocks() })
it('revokes the validated bearer session and ignores any other account capability in its body', async () => {
  mocks.authenticate.mockResolvedValue({ sessionId: 'own-session' })
  const result = await POST(new Request('http://localhost/api/v1/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer own-access', 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: 'b'.repeat(43) }) }))
  expect(result.status).toBe(200)
  expect(mocks.revoke).toHaveBeenCalledWith('own-session')
  expect(mocks.refreshRevoke).not.toHaveBeenCalled()
})
it('can revoke by the one-session refresh capability after access expiry', async () => {
  mocks.authenticate.mockRejectedValue(new AuthError(401, 'UNAUTHORIZED', 'Expired'))
  const token = 'a'.repeat(43)
  const result = await POST(new Request('http://localhost/api/v1/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer expired-access', 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) }))
  expect(result.status).toBe(200)
  expect(mocks.refreshRevoke).toHaveBeenCalledWith(token)
  expect(mocks.revoke).not.toHaveBeenCalled()
})
it('preserves outage errors and never treats malformed JSON as a database outage', async () => {
  mocks.authenticate.mockRejectedValue(new AuthError(503, 'AUTH_UNAVAILABLE', 'Try later'))
  expect((await POST(new Request('http://localhost/api/v1/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer own-access' } }))).status).toBe(503)
  expect((await POST(new Request('http://localhost/api/v1/auth/logout', { method: 'POST', body: 'not-json' }))).status).toBe(415)
})
