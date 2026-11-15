import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ identity: vi.fn(), read: vi.fn(), write: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: {} }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/social/service', () => ({ getOwnBlockState: mocks.read, setBlocked: mocks.write }))
import { GET, POST } from '@/app/api/v1/people/[id]/block/route'
import { ApiError } from '@/lib/api/http'
import { blockStateSchema } from '@/lib/contracts/social'
const actor = '11111111-1111-4111-8111-111111111111', target = '22222222-2222-4222-8222-222222222222', clientId = '33333333-3333-4333-8333-333333333333'
const context = { params: Promise.resolve({ id: target }) }
const request = (body?: unknown) => new Request('http://localhost:3000/api/v1/people/' + target + '/block', body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => { vi.resetAllMocks(); mocks.identity.mockResolvedValue({ userId: actor }); mocks.read.mockResolvedValue({ personId: target, blocked: true }); mocks.write.mockResolvedValue({ personId: target, blocked: false }) })
describe('own block-state HTTP privacy', () => {
 it('authenticates own-state reads and mutations before domain access', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  expect((await GET(request(), context)).status).toBe(401); expect((await POST(request({ clientId, blocked: false }), context)).status).toBe(401); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled()
 })
 it('returns only the actor own state without public profile data', async () => {
  const response = await GET(request(), context), payload = await response.json()
  expect(payload).toEqual({ success: true, data: { personId: target, blocked: true } }); blockStateSchema.parse(payload.data)
  expect(mocks.read).toHaveBeenCalledWith(actor, target); expect(response.headers.get('cache-control')).toContain('no-store')
 })
 it('acknowledges an unblock with the minimal bound target identity', async () => {
  expect(await (await POST(request({ clientId, blocked: false }), context)).json()).toEqual({ success: true, data: { personId: target, blocked: false } })
  expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { platform: true, mutation: true }); expect(mocks.write).toHaveBeenCalledWith(actor, target, { clientId, blocked: false })
 })
 it('does not mistake unavailable storage for an absent or removed block', async () => { mocks.read.mockRejectedValue(new ApiError(503, 'DATABASE_UNAVAILABLE', 'Unavailable.')); expect((await GET(request(), context)).status).toBe(503) })
})
