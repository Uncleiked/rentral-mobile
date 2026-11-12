import { beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/http'
const state = vi.hoisted(() => ({ identity: vi.fn(), media: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: state.identity }))
vi.mock('@/lib/operations/admin-media', () => ({ getAdminListingMedia: state.media }))
import { GET } from '@/app/api/v1/admin/listings/[id]/media/route'
const actor = '11111111-1111-4111-8111-111111111111', id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
beforeEach(() => { state.identity.mockReset().mockResolvedValue({ userId: actor }); state.media.mockReset().mockResolvedValue({ items: [], source: 'recorded' }) })
it('validates awaited route params and authenticates the current staff actor', async () => {
  const response = await GET(new Request(`https://rentral.invalid/api/v1/admin/listings/${id}/media`), { params: Promise.resolve({ id }) })
  expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toContain('no-store')
  expect(response.headers.get('Vary')).toBe('Authorization, Cookie'); expect(state.media).toHaveBeenCalledWith(actor, id)
  expect(state.identity).toHaveBeenCalledWith(expect.any(Request), { admission: false, platform: true })
})
it('rejects malformed IDs before the media service', async () => {
  const response = await GET(new Request('https://rentral.invalid/api/v1/admin/listings/bad/media'), { params: Promise.resolve({ id: 'bad' }) })
  expect(response.status).toBe(400); expect(state.media).not.toHaveBeenCalled()
})
it('does not return any preview on authentication or permission failure', async () => {
  state.identity.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'Sign in first.'))
  const request = () => GET(new Request(`https://rentral.invalid/api/v1/admin/listings/${id}/media`), { params: Promise.resolve({ id }) })
  expect((await request()).status).toBe(401); expect(state.media).not.toHaveBeenCalled()
  state.media.mockRejectedValue(new ApiError(403, 'STAFF_REQUIRED', 'Current permission is required.'))
  const response = await request()
  expect(response.status).toBe(403); expect(await response.text()).not.toContain('token=')
})
