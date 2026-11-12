import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ identity: vi.fn(), legacy: vi.fn(), search: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/organizations/service', () => ({ organizationQueue: mocks.legacy, searchOrganizationQueue: mocks.search, reviewOrganization: vi.fn() }))
import { GET } from '@/app/api/v1/admin/organizations/route'
import { ApiError } from '@/lib/api/http'
beforeEach(() => { vi.resetAllMocks(); mocks.identity.mockResolvedValue({ userId: 'actor' }); mocks.legacy.mockResolvedValue({ items: [] }); mocks.search.mockResolvedValue({ items: [], total: 0, hasMore: false, nextCursor: null }) })
it('preserves legacy GET and routes explicit filters to bounded search', async () => {
  expect((await GET(new Request('http://localhost/api/v1/admin/organizations'))).status).toBe(200)
  expect(mocks.legacy).toHaveBeenCalledExactlyOnceWith('actor'); expect(mocks.search).not.toHaveBeenCalled()
  const response = await GET(new Request('http://localhost/api/v1/admin/organizations?status=pending&sort=oldest&limit=25&query=Yaba'))
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ data: { total: 0, hasMore: false } })
  expect(mocks.search).toHaveBeenCalledExactlyOnceWith('actor', { status: 'pending', sort: 'oldest', limit: '25', query: 'Yaba' })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
})
it('rejects unauthenticated callers before either read service', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  expect((await GET(new Request('http://localhost/api/v1/admin/organizations?status=pending'))).status).toBe(401)
  expect(mocks.search).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled()
})
