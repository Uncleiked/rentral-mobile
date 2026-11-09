import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ ready: vi.fn(), thread: vi.fn(), find: vi.fn(), upsert: vi.fn(), remove: vi.fn(), active: vi.fn(), identity: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { conversation: { findFirst: mocks.thread }, conversationActivity: { findUnique: mocks.find, upsert: mocks.upsert, deleteMany: mocks.remove } } }))
vi.mock('@/lib/database/readiness', () => ({ assertMessagingActivityReady: mocks.ready }))
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: mocks.active }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ conversation: { findFirst: mocks.thread }, conversationActivity: { upsert: mocks.upsert } }) }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
import { getConversationActivity, setConversationActivity, clearConversationActivity } from '@/lib/messaging/activity'
import { GET, POST, DELETE } from '@/app/api/v1/messages/[id]/activity/route'
import { ApiError } from '@/lib/api/http'
import { conversationActivitySchema } from '@/lib/contracts/messaging'
const id = '11111111-1111-4111-8111-111111111111', messageId = '22222222-2222-4222-8222-222222222222'
const context = { params: Promise.resolve({ id }) }
const now = new Date('2026-11-09T20:00:00Z')
const thread = { seeker_id: 'seeker', lister_id: 'host', seeker_read_at: null, lister_read_at: now,
  seeker: { closed_at: null }, lister: { closed_at: null }, messages: [{ id: messageId }] }
const request = (method = 'GET', body?: unknown) => new Request('http://localhost:3000/api/v1/messages/' + id + '/activity', { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); mocks.thread.mockResolvedValue(thread)
  mocks.find.mockResolvedValue({ last_seen_at: now, typing_until: new Date(now.getTime() + 8000) }); mocks.identity.mockResolvedValue({ userId: 'seeker' })
})
afterEach(() => vi.useRealTimers())
describe('conversation-scoped presence and typing', () => {
  it('returns only coarse participant activity and the latest durable message ID', async () => {
    const result = await getConversationActivity('seeker', id)
    expect(result).toEqual({ otherOnline: true, otherTyping: true, otherReadAt: now.toISOString(), latestMessageId: messageId })
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ where: { conversation_id_user_id: { conversation_id: id, user_id: 'host' } } }))
    expect(conversationActivitySchema.parse(result)).not.toHaveProperty('last_seen_at')
  })
  it('denies a nonparticipant before looking up activity', async () => {
    mocks.thread.mockResolvedValue(null); expect(await getConversationActivity('outsider', id)).toBeNull(); expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.thread).toHaveBeenCalledWith(expect.objectContaining({ where: { id, OR: [{ seeker_id: 'outsider' }, { lister_id: 'outsider' }] } }))
  })
  it.each([-45000, -90000, 1000])('enforces freshness without waiting for TTL deletion (%s)', async offset => {
    mocks.find.mockResolvedValue({ last_seen_at: new Date(now.getTime() + offset), typing_until: new Date(now.getTime() + 8000) })
    expect(await getConversationActivity('seeker', id)).toMatchObject({ otherOnline: false, otherTyping: false })
  })
  it('expires typing independently while keeping recent presence', async () => {
    vi.advanceTimersByTime(8000); expect(await getConversationActivity('seeker', id)).toMatchObject({ otherOnline: true, otherTyping: false })
  })
  it('does not expose closed-account presence', async () => {
    mocks.thread.mockResolvedValue({ ...thread, lister: { closed_at: now } })
    expect(await getConversationActivity('seeker', id)).toMatchObject({ otherOnline: false, otherTyping: false }); expect(mocks.find).not.toHaveBeenCalled()
  })
  it('serializes both active participants before heartbeat and bounds typing to eight seconds', async () => {
    await setConversationActivity('seeker', id, true)
    expect(mocks.active).toHaveBeenCalledWith(expect.anything(), ['seeker', 'host'])
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { conversation_id: id, user_id: 'seeker', last_seen_at: now, typing_until: new Date(now.getTime() + 8000) } }))
    await setConversationActivity('seeker', id, false)
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: { last_seen_at: now, typing_until: null } }))
  })
  it('does not create a heartbeat for outsiders or unavailable accounts', async () => {
    mocks.thread.mockResolvedValue(null); await expect(setConversationActivity('outsider', id, true)).rejects.toThrow('FORBIDDEN')
    mocks.thread.mockResolvedValue(thread); mocks.active.mockRejectedValue(new Error('ACCOUNT_UNAVAILABLE'))
    await expect(setConversationActivity('seeker', id, true)).rejects.toThrow('ACCOUNT_UNAVAILABLE'); expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('clears only the actor’s ephemeral row and fails closed without preparation', async () => {
    await clearConversationActivity('seeker', id); expect(mocks.remove).toHaveBeenCalledWith({ where: { conversation_id: id, user_id: 'seeker' } })
    mocks.ready.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED')); await expect(setConversationActivity('seeker', id, false)).rejects.toThrow('DATABASE_SETUP_REQUIRED')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
describe('activity API boundaries', () => {
  it('authenticates every verb before body or domain access', async () => {
    mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
    for (const [verb, handler] of [['GET', GET], ['POST', POST], ['DELETE', DELETE]] as const) expect((await handler(request(verb), context)).status).toBe(401)
    expect(mocks.ready).not.toHaveBeenCalled()
  })
  it('validates strict small heartbeat payloads and preserves private cache headers', async () => {
    expect((await POST(request('POST', { typing: true, userId: 'host' }), context)).status).toBe(400)
    const response = await POST(request('POST', { typing: true }), context)
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.identity).toHaveBeenLastCalledWith(expect.any(Request), { platform: true, mutation: true })
  })
  it('returns authenticated activity and indistinguishable clear results', async () => {
    expect((await GET(request(), context)).status).toBe(200)
    expect(await (await DELETE(request('DELETE'), context)).json()).toEqual({ success: true, data: { cleared: true } })
    mocks.thread.mockResolvedValue(null); expect((await GET(request(), context)).status).toBe(404)
  })
})
