import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), own: vi.fn(), save: vi.fn(), withdraw: vi.fn(), candidates: vi.fn(), contacts: vi.fn(), contact: vi.fn(), request: vi.fn(),
  decide: vi.fn(), messages: vi.fn(), send: vi.fn(), read: vi.fn(), blocks: vi.fn(), block: vi.fn(), reports: vi.fn(), report: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/database/readiness', () => ({ MongoReadinessError: class extends Error {} }))
vi.mock('@/lib/matching/profiles', () => ({ getOwnMatchingProfile: mocks.own, updateMatchingProfile: mocks.save, withdrawMatchingProfile: mocks.withdraw, matchingCandidates: mocks.candidates }))
vi.mock('@/lib/matching/views', () => ({ matchingConnections: mocks.contacts, matchingConnection: mocks.contact }))
vi.mock('@/lib/matching/connections', () => ({ requestMatchingConnection: mocks.request, decideMatchingConnection: mocks.decide }))
vi.mock('@/lib/matching/messages', () => ({ matchingMessages: mocks.messages, persistMatchingMessage: mocks.send, markMatchingRead: mocks.read }))
vi.mock('@/lib/matching/blocks', () => ({ ownMatchingBlocks: mocks.blocks, setMatchingBlock: mocks.block }))
vi.mock('@/lib/matching/reports', () => ({ openMatchingReport: mocks.report, ownMatchingReports: mocks.reports }))
import { ApiError } from '@/lib/api/http'
import { MatchingError } from '@/lib/matching/policy'
import { GET as profile, PUT as save, DELETE as withdraw } from '@/app/api/v1/squat-mates/profile/route'
import { GET as candidates } from '@/app/api/v1/squat-mates/route'
import { POST as requestContact } from '@/app/api/v1/squat-mates/connections/route'
import { GET as contact, PATCH as decide } from '@/app/api/v1/squat-mates/connections/[id]/route'
import { GET as messages, POST as send } from '@/app/api/v1/squat-mates/connections/[id]/messages/route'
import { POST as read } from '@/app/api/v1/squat-mates/connections/[id]/read/route'
import { PUT as block, DELETE as unblock } from '@/app/api/v1/squat-mates/blocks/[id]/route'
import { POST as report } from '@/app/api/v1/squat-mates/reports/route'

const actor = '11111111-1111-4111-8111-111111111111', id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', clientId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const at = '2030-01-01T10:00:00.000Z', context = { params: Promise.resolve({ id }) }
const preferences = { bio: 'A calm shared home.', neighborhoods: ['yaba'], monthlyMinKobo: '10000000', monthlyMaxKobo: '20000000',
  smoking: 'smoke_free', pets: 'pet_free', guests: 'occasional', quietHours: 'early', isVisible: true }
function request(path: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost:3000/api/v1/squat-mates${path}`, { method, headers: { authorization: 'Bearer test-session', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.identity.mockResolvedValue({ userId: actor, mode: 'bearer' })
  mocks.own.mockResolvedValue(null); mocks.candidates.mockResolvedValue({ items: [], nextCursor: null, limit: 20 })
  mocks.save.mockResolvedValue({ ...preferences, id, username: 'member', avatarUrl: null, currency: 'NGN', moderationStatus: 'clear', moderationReason: null, createdAt: at, updatedAt: at })
  mocks.request.mockResolvedValue(id); mocks.send.mockResolvedValue(id); mocks.report.mockResolvedValue(id); mocks.read.mockResolvedValue(at); mocks.decide.mockResolvedValue('accepted')
  mocks.messages.mockResolvedValue({ items: [], nextCursor: null, limit: 20 })
})
it('authenticates all matching reads/writes before any domain method is reached', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  const responses = await Promise.all([profile(request('/profile')), save(request('/profile', 'PUT', {})), withdraw(request('/profile', 'DELETE')),
    candidates(request('')), requestContact(request('/connections', 'POST', { profileId: id })), contact(request(`/connections/${id}`), context),
    decide(request(`/connections/${id}`, 'PATCH', { decision: 'accept' }), context), messages(request(`/connections/${id}/messages`), context),
    send(request(`/connections/${id}/messages`, 'POST', { clientId, body: 'Hello' }), context), read(request(`/connections/${id}/read`, 'POST'), context),
    block(request(`/blocks/${id}`, 'PUT'), context), report(request('/reports', 'POST', {}))])
  for (const response of responses) { expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('private, no-store') }
  for (const method of [mocks.own, mocks.save, mocks.candidates, mocks.request, mocks.contact, mocks.decide, mocks.messages, mocks.send, mocks.read, mocks.block, mocks.report]) expect(method).not.toHaveBeenCalled()
})
it('leaves a missing matching profile opted out and persists only an explicit strict owner preference payload', async () => {
  expect(await (await profile(request('/profile'))).json()).toEqual({ success: true, data: { profile: null, canDiscover: false } })
  expect((await save(request('/profile', 'PUT', { ...preferences, moderationStatus: 'clear' }))).status).toBe(400)
  expect(mocks.save).not.toHaveBeenCalled()
  expect((await save(request('/profile', 'PUT', preferences))).status).toBe(200)
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(actor, preferences)
  expect(mocks.identity).toHaveBeenLastCalledWith(expect.any(Request), { platform: true, mutation: true, verified: true })
})
it('requires an explicitly empty withdrawal/block body and keeps privacy mutations actor-scoped', async () => {
  expect((await withdraw(request('/profile', 'DELETE', { user_id: 'victim' }))).status).toBe(400)
  expect(await (await withdraw(request('/profile', 'DELETE'))).json()).toEqual({ success: true, data: { withdrawn: true } })
  await block(request(`/blocks/${id}`, 'PUT'), context); await unblock(request(`/blocks/${id}`, 'DELETE', {}), context)
  expect(mocks.block.mock.calls).toEqual([[actor, id, true], [actor, id, false]])
})
it('rejects caller identities, arbitrary contact status and message evidence from another shape before mutations', async () => {
  expect((await requestContact(request('/connections', 'POST', { profileId: id, requested_by: 'victim' }))).status).toBe(400)
  expect((await decide(request(`/connections/${id}`, 'PATCH', { status: 'accepted' }), context)).status).toBe(400)
  expect((await send(request(`/connections/${id}/messages`, 'POST', { clientId, body: 'Hello', sender_id: 'victim' }), context)).status).toBe(400)
  expect((await report(request('/reports', 'POST', { profileId: id, messageId: id, reason: 'A detailed report about a message.' }))).status).toBe(400)
  for (const method of [mocks.request, mocks.decide, mocks.send, mocks.report]) expect(method).not.toHaveBeenCalled()
})
it('passes only authenticated actor and route connection to normalized durable message/read services', async () => {
  expect((await send(request(`/connections/${id}/messages`, 'POST', { clientId, body: '  Hello  ' }), context)).status).toBe(201)
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith(actor, id, { clientId, body: 'Hello' })
  expect(await (await read(request(`/connections/${id}/read`, 'POST'), context)).json()).toEqual({ success: true, data: { readAt: at } })
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(actor, id, undefined)
  mocks.read.mockClear()
  expect((await read(request(`/connections/${id}/read`, 'POST', { messageId: clientId }), context)).status).toBe(200)
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(actor, id, clientId)
})
it('validates critical acknowledgement IDs/status instead of emitting malformed successes', async () => {
  mocks.request.mockResolvedValue('invalid'); mocks.decide.mockResolvedValue('unreviewed-custom-state')
  expect((await requestContact(request('/connections', 'POST', { profileId: id }))).status).toBe(503)
  expect((await decide(request(`/connections/${id}`, 'PATCH', { decision: 'accept' }), context)).status).toBe(503)
})
it('preserves missing-contact denials and never repeats an uncertain message mutation', async () => {
  mocks.contact.mockRejectedValue(new MatchingError('This contact is unavailable.', 'NOT_FOUND', 404))
  expect((await contact(request(`/connections/${id}`), context)).status).toBe(404)
  mocks.send.mockRejectedValue(new Error('Lost acknowledgement after possible commit'))
  const response = await send(request(`/connections/${id}/messages`, 'POST', { clientId, body: 'Hello' }), context)
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: 'MATCH_UPDATE_UNCONFIRMED' })
  expect(mocks.send).toHaveBeenCalledTimes(1)
})
it('bounds archives, JSON streams and daily contact limits before extra work', async () => {
  expect((await candidates(request('?limit=51'))).status).toBe(400)
  expect((await candidates(request('?limit=1&limit=2'))).status).toBe(400)
  expect((await save(request('/profile', 'PUT', { ...preferences, bio: 'x'.repeat(8192) }))).status).toBe(413)
  mocks.request.mockRejectedValue(new MatchingError('Try another day.', 'CONTACT_RATE_LIMITED', 429))
  const response = await requestContact(request('/connections', 'POST', { profileId: id }))
  expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('86400')
})
