import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ identity: vi.fn(), direct: vi.fn(), listing: vi.fn(), inbox: vi.fn(), legacy: vi.fn(), accept: vi.fn(), readStart: vi.fn(), readAccept: vi.fn(), readSend: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/messaging/direct', () => ({ beginDirectConversation: mocks.direct, acceptDirectConversation: mocks.accept, readDirectStart: mocks.readStart, readConversationAcceptance: mocks.readAccept }))
vi.mock('@/lib/messaging/service', () => ({ beginConversation: mocks.listing, getInbox: mocks.legacy, readMessageCommand: mocks.readSend }))
vi.mock('@/lib/messaging/inbox', () => ({ getConversationInboxPage: mocks.inbox }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: {} }))
import { GET, POST } from '@/app/api/v1/messages/route'
import { GET as readStart } from '@/app/api/v1/messages/start/route'
import { GET as readAccept, POST as accept } from '@/app/api/v1/messages/[id]/accept/route'
import { GET as readSend } from '@/app/api/v1/messages/[id]/send/route'
import { ApiError } from '@/lib/api/http'
import { MutationConflictError } from '@/lib/database/mutations'
const actor = '11111111-1111-4111-8111-111111111111', recipientId = '22222222-2222-4222-8222-222222222222', clientId = '33333333-3333-4333-8333-333333333333', id = '44444444-4444-4444-8444-444444444444'
const context = { params: Promise.resolve({ id }) }
const request = (path = '', body?: unknown) => new Request('http://localhost:3000/api/v1/messages' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => {
 vi.resetAllMocks(); mocks.identity.mockResolvedValue({ userId: actor }); mocks.direct.mockResolvedValue(id); mocks.listing.mockResolvedValue(id); mocks.accept.mockResolvedValue(id); mocks.legacy.mockResolvedValue([]); mocks.inbox.mockResolvedValue({ items: [], limit: 20, nextCursor: null }); mocks.readStart.mockResolvedValue(null); mocks.readAccept.mockResolvedValue(null); mocks.readSend.mockResolvedValue(null)
})
describe('social messaging HTTP boundaries', () => {
 it('authenticates mutations and readbacks before domain access', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  for (const response of [await POST(request('', { recipientId, clientId })), await GET(request('?folder=requests')), await accept(request('/' + id + '/accept', { clientId }), context), await readSend(request('/' + id + '/send?clientId=' + clientId), context)]) expect(response.status).toBe(401)
  expect(mocks.direct).not.toHaveBeenCalled(); expect(mocks.inbox).not.toHaveBeenCalled(); expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.readSend).not.toHaveBeenCalled()
 })
 it('starts a direct room using a strict exact command and keeps legacy listing starts', async () => {
  const result = await POST(request('', { recipientId, clientId })); expect(result.status).toBe(201); expect(await result.json()).toEqual({ success: true, data: { id } }); expect(mocks.direct).toHaveBeenCalledWith(actor, { recipientId, clientId }); expect(result.headers.get('cache-control')).toContain('no-store')
  expect((await POST(request('', { listingId: id }))).status).toBe(201); expect(mocks.listing).toHaveBeenCalledWith(actor, id)
  expect((await POST(request('', { recipientId, clientId, accepted: true }))).status).toBe(400)
 })
 it('requires a client command ID to start direct chat or accept a request', async () => { expect((await POST(request('', { recipientId }))).status).toBe(400); expect((await accept(request('/' + id + '/accept', {}), context)).status).toBe(400); expect(mocks.accept).not.toHaveBeenCalled() })
 it('uses categorized inbox pagination and rejects duplicate or unknown folders', async () => {
  expect((await GET(request('?folder=requests&limit=7'))).status).toBe(200); expect(mocks.inbox).toHaveBeenCalledWith(actor, { folder: 'requests', limit: 7 }); expect(mocks.legacy).not.toHaveBeenCalled()
  expect((await GET(request('?folder=requests&folder=primary'))).status).toBe(400); expect((await GET(request('?folder=unknown'))).status).toBe(400)
  expect((await GET(request())).status).toBe(200); expect(mocks.legacy).toHaveBeenCalledTimes(1)
 })
 it('accepts only through the authorized domain command and classifies conflict409', async () => {
  let response = await accept(request('/' + id + '/accept', { clientId }), context); expect(await response.json()).toEqual({ success: true, data: { id, accepted: true } }); expect(mocks.accept).toHaveBeenCalledWith(actor, id, { clientId })
  mocks.accept.mockRejectedValue(new MutationConflictError()); response = await accept(request('/' + id + '/accept', { clientId }), context); expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: 'INVALID_RETRY' })
 })
 it('distinguishes confirmed absence from unavailable database readbacks', async () => {
  const query = '?clientId=' + clientId
  expect((await readStart(request('/start' + query + '&recipientId=' + recipientId))).status).toBe(404)
  expect((await readAccept(request('/' + id + '/accept' + query), context)).status).toBe(404)
  expect((await readSend(request('/' + id + '/send' + query), context)).status).toBe(404)
  mocks.readSend.mockRejectedValue(new ApiError(503, 'DATABASE_UNAVAILABLE', 'Unavailable.')); expect((await readSend(request('/' + id + '/send' + query), context)).status).toBe(503)
 })
 it('returns durable acknowledgements through read-only receipt endpoints', async () => {
  mocks.readStart.mockResolvedValue(id); mocks.readAccept.mockResolvedValue(id); mocks.readSend.mockResolvedValue(id)
  expect(await (await readStart(request('/start?clientId=' + clientId + '&recipientId=' + recipientId))).json()).toEqual({ success: true, data: { id } })
  expect(await (await readAccept(request('/' + id + '/accept?clientId=' + clientId), context)).json()).toEqual({ success: true, data: { id, accepted: true } })
  expect(await (await readSend(request('/' + id + '/send?clientId=' + clientId), context)).json()).toEqual({ success: true, data: { id } })
  expect(mocks.direct).not.toHaveBeenCalled(); expect(mocks.accept).not.toHaveBeenCalled()
 })
})
