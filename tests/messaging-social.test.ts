import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
const mocks = vi.hoisted(() => ({ ready: vi.fn(), prepared: vi.fn(), inboxRows: vi.fn(), active: vi.fn(), blocked: vi.fn(), allowed: vi.fn(), mutual: vi.fn(), thread: vi.fn(), count: vi.fn(), roomCreate: vi.fn(), update: vi.fn(), notify: vi.fn(), receipt: vi.fn(), receiptCreate: vi.fn(), user: vi.fn(), duplicate: vi.fn(), messageFirst: vi.fn(), messageCount: vi.fn(), messageCreate: vi.fn(), messages: vi.fn(), activityFind: vi.fn(), activityUpsert: vi.fn(), markRead: vi.fn() }))
const tx = vi.hoisted(() => ({}))
vi.mock('@/lib/db', () => ({ default: { conversation: { findFirst: mocks.thread, findMany: mocks.inboxRows }, message: { findMany: mocks.messages, findUnique: mocks.duplicate }, mutationReceipt: { findUnique: mocks.receipt }, conversationActivity: { findUnique: mocks.activityFind } } }))
vi.mock('@/lib/database/readiness', () => ({ assertSocialReady: mocks.ready, socialPrepared: mocks.prepared, assertMessagingActivityReady: mocks.ready }))
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: mocks.active }))
vi.mock('@/lib/social/relationships', () => ({ areSociallyBlocked: mocks.blocked, areUsersMutualFollowers: mocks.mutual, assertSocialInteractionAllowed: mocks.allowed }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: async (work: (value: unknown) => Promise<unknown>) => work(tx), lockRecord: vi.fn(async () => true) }))
import { conversationCapabilities } from '@/lib/messaging/access'
import { getConversationInboxPage, socialInboxPipeline } from '@/lib/messaging/inbox'
import { acceptDirectConversation, beginDirectConversation, directConversationId, readConversationAcceptance, readDirectStart } from '@/lib/messaging/direct'
import { getThread, markConversationRead, persistMessage, readMessageCommand } from '@/lib/messaging/service'
import { getConversationActivity, setConversationActivity } from '@/lib/messaging/activity'
import { ApiError } from '@/lib/api/http'
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', clientId = '33333333-3333-4333-8333-333333333333', room = '44444444-4444-4444-8444-444444444444', messageId = '55555555-5555-4555-8555-555555555555'
const direct = { id: room, kind: 'direct', listing_id: null, seeker_id: a, lister_id: b, initiated_by: a, accepted_at: null, accepted_by: null, updatedAt: new Date(), seeker_read_at: null, lister_read_at: new Date(), seeker: { username: 'first', closed_at: null, suspended_at: null }, lister: { username: 'second', closed_at: null, suspended_at: null }, messages: [{ id: messageId }] }
beforeEach(() => {
 vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
 Object.assign(tx, { conversation: { findUnique: mocks.thread, findFirst: mocks.thread, count: mocks.count, create: mocks.roomCreate, update: mocks.update, updateMany: mocks.markRead }, user: { findUnique: mocks.user }, notification: { create: mocks.notify }, mutationReceipt: { findUnique: mocks.receipt, create: mocks.receiptCreate }, message: { findUnique: mocks.duplicate, findFirst: mocks.messageFirst, count: mocks.messageCount, create: mocks.messageCreate }, conversationActivity: { upsert: mocks.activityUpsert } })
 mocks.prepared.mockResolvedValue(true); mocks.inboxRows.mockResolvedValue([]); mocks.thread.mockResolvedValue(direct); mocks.count.mockResolvedValue(0); mocks.receipt.mockResolvedValue(null); mocks.blocked.mockResolvedValue(false); mocks.mutual.mockResolvedValue(false); mocks.user.mockResolvedValue({ id: a }); mocks.duplicate.mockResolvedValue(null); mocks.messageFirst.mockResolvedValue(null); mocks.messageCount.mockResolvedValue(0); mocks.messageCreate.mockResolvedValue({ id: messageId }); mocks.messages.mockResolvedValue([])
})
describe('message folder and consent policy', () => {
 it('keeps listing conversations in Primary without requiring follows', () => { expect(conversationCapabilities(a, { seeker_id: a, lister_id: b }, false, true)).toMatchObject({ folder: 'primary', kind: 'listing', canSend: true, canAccept: false }) })
 it('puts the first outgoing invitation in Sent and the incoming message in Requests', () => {
  expect(conversationCapabilities(a, direct, false, false)).toMatchObject({ folder: 'sent', canSend: true, requestIncoming: false })
  expect(conversationCapabilities(a, direct, false, true).canSend).toBe(false)
  expect(conversationCapabilities(b, direct, false, true)).toMatchObject({ folder: 'requests', requestIncoming: true, canSend: false, canAccept: true })
 })
 it('uses Primary for mutual followers and preserves manual acceptance after an unfollow', () => {
  expect(conversationCapabilities(b, direct, true, true)).toMatchObject({ folder: 'primary', canSend: true, canAccept: false })
  expect(conversationCapabilities(a, { ...direct, accepted_at: new Date() }, false, true)).toMatchObject({ folder: 'primary', canSend: true })
 })
 it('classifies before pagination and excludes inactive edges and blocked direct rooms', () => {
  const pipeline = socialInboxPipeline(a, { folder: 'requests', limit: 20 })
  const folder = pipeline.findIndex(stage => JSON.stringify(stage).includes('"__folder":"requests"'))
  expect(folder).toBeGreaterThan(0); expect(folder).toBeLessThan(pipeline.findIndex(stage => '$limit' in stage))
  const lookups = pipeline.filter(stage => '$lookup' in stage).map(stage => JSON.stringify(stage))
  expect(lookups[0]).toContain('"active":true'); expect(lookups[1]).toContain('"active":true')
  expect(JSON.stringify(pipeline)).toContain('"__blocks"'); expect(JSON.stringify(pipeline)).toContain('"$ifNull":["$kind","listing"]')
 })
})
describe('direct conversation commands', () => {
 it('uses one valid, stable UUID for either direction', () => { const id = directConversationId(a, b); expect(z.uuid().parse(id)).toBe(id); expect(directConversationId(b, a)).toBe(id) })
 it('refuses self-chat and fails closed without reviewed database setup', async () => {
  await expect(beginDirectConversation(a, { recipientId: a, clientId })).rejects.toMatchObject({ code: 'SELF_CONVERSATION' }); expect(mocks.active).not.toHaveBeenCalled()
  mocks.ready.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED')); await expect(beginDirectConversation(a, { recipientId: b, clientId })).rejects.toThrow('DATABASE_SETUP_REQUIRED'); expect(mocks.roomCreate).not.toHaveBeenCalled()
 })
 it('serializes both accounts and commits the room and exact command receipt together', async () => {
  mocks.thread.mockResolvedValue(null)
  const id = await beginDirectConversation(a, { recipientId: b, clientId })
  expect(mocks.active).toHaveBeenCalledWith(tx, [a, b]); expect(mocks.allowed).toHaveBeenCalledWith(tx, a, b)
  expect(mocks.roomCreate).toHaveBeenCalledWith({ data: { id, kind: 'direct', listing_id: null, seeker_id: a, lister_id: b, initiated_by: a } })
  expect(mocks.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actor_id: a, resource_id: id, scope: 'direct_conversation_start', client_id: clientId }) }))
 })
 it('reuses an existing symmetric room and rate-limits new recipients', async () => {
  mocks.thread.mockResolvedValue({ ...direct, id: directConversationId(a, b) }); expect(await beginDirectConversation(b, { recipientId: a, clientId })).toBe(directConversationId(a, b)); expect(mocks.roomCreate).not.toHaveBeenCalled(); expect(mocks.count).not.toHaveBeenCalled()
  mocks.thread.mockResolvedValue(null); mocks.count.mockResolvedValue(20); await expect(beginDirectConversation(a, { recipientId: b, clientId })).rejects.toMatchObject({ code: 'REQUEST_LIMIT' }); expect(mocks.roomCreate).not.toHaveBeenCalled()
 })
 it('preserves mutual consent when a room is first created', async () => {
  mocks.thread.mockResolvedValue(null); mocks.mutual.mockResolvedValue(true); await beginDirectConversation(a, { recipientId: b, clientId })
  expect(mocks.roomCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accepted_at: expect.any(Date) }) }))
 })
 it('denies blocked pairs before creating a room or command receipt', async () => { mocks.allowed.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Unavailable.')); await expect(beginDirectConversation(a, { recipientId: b, clientId })).rejects.toMatchObject({ status: 404 }); expect(mocks.roomCreate).not.toHaveBeenCalled(); expect(mocks.receiptCreate).not.toHaveBeenCalled() })
 it('only lets the actual request recipient accept', async () => {
  await expect(acceptDirectConversation(a, room, { clientId })).rejects.toMatchObject({ code: 'RECIPIENT_REQUIRED' }); expect(mocks.update).not.toHaveBeenCalled()
  expect(await acceptDirectConversation(b, room, { clientId })).toBe(room)
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: room }, data: { accepted_at: expect.any(Date), accepted_by: b, updatedAt: direct.updatedAt } })
  expect(mocks.notify).toHaveBeenCalledTimes(1); expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ user_id: a, kind: 'message_request_accepted' }) }))
 })
 it('does not re-notify or rewrite a request already accepted through mutual following', async () => { mocks.thread.mockResolvedValue({ ...direct, accepted_at: new Date() }); await acceptDirectConversation(b, room, { clientId }); expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.receiptCreate).toHaveBeenCalledTimes(1) })
 it('readback does not turn absent or blocked commands into writes', async () => {
  expect(await readDirectStart(a, { recipientId: b, clientId })).toBeNull(); expect(await readConversationAcceptance(b, room, { clientId })).toBeNull()
  expect(mocks.roomCreate).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.receiptCreate).not.toHaveBeenCalled()
 })
})
describe('pending-request messaging and privacy', () => {
 const input = { conversationId: room, clientId, body: 'Hello, I am interested in your listings.' }
 it('allows one invitation and sends a request notification', async () => { expect(await persistMessage(a, input)).toBe(messageId); expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'message_request', user_id: b }) })) })
 it('stops a second invitation and prevents recipient replies before consent', async () => {
  mocks.messageFirst.mockResolvedValue({ id: messageId }); await expect(persistMessage(a, input)).rejects.toMatchObject({ code: 'REQUEST_PENDING' }); expect(mocks.messageCreate).not.toHaveBeenCalled()
  await expect(persistMessage(b, input)).rejects.toMatchObject({ code: 'REQUEST_PENDING' }); expect(mocks.messageCreate).not.toHaveBeenCalled()
 })
 it('returns an exact retry without duplicating requests or notifications', async () => { mocks.duplicate.mockResolvedValue({ id: messageId, conversation_id: room, body: input.body, shared_listing_id: null }); expect(await persistMessage(a, input)).toBe(messageId); expect(mocks.messageCreate).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled() })
 it('allows both participants to chat after acceptance', async () => { mocks.thread.mockResolvedValue({ ...direct, accepted_at: new Date() }); mocks.messageFirst.mockResolvedValue({ id: messageId }); expect(await persistMessage(b, input)).toBe(messageId); expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'message', user_id: a }) })) })
 it('suppresses read receipts and typing in an unaccepted request', async () => {
  expect(await markConversationRead(b, room)).toBe(false); expect(mocks.markRead).not.toHaveBeenCalled()
  expect(await getThread(a, room)).toMatchObject({ folder: 'sent', otherReadAt: null, canAccept: false })
  expect(await getConversationActivity(a, room)).toEqual({ otherOnline: false, otherTyping: false, otherReadAt: null, latestMessageId: messageId }); expect(mocks.activityFind).not.toHaveBeenCalled()
  await expect(setConversationActivity(a, room, true)).rejects.toMatchObject({ code: 'REQUEST_PENDING' }); expect(mocks.activityUpsert).not.toHaveBeenCalled()
 })
 it('keeps legacy listing history read-only before additive social setup without bypassing enabled blocks', async () => {
  mocks.prepared.mockResolvedValue(false)
  const legacy = { ...direct, kind: null, listing_id: messageId }
  mocks.thread.mockResolvedValue(legacy)
  mocks.inboxRows.mockResolvedValue([{ ...legacy, messages: [] }])
  expect(await getThread(a, room)).toMatchObject({ kind: 'listing', folder: 'primary', canSend: false, otherReadAt: null })
  expect((await getConversationInboxPage(a, { folder: 'primary', limit: 20 })).items[0]).toMatchObject({ id: room, kind: 'listing', canSend: false })
  expect(await getConversationActivity(a, room)).toMatchObject({ otherOnline: false, otherTyping: false, otherReadAt: null })
  expect(await markConversationRead(a, room)).toBe(false)
  expect(mocks.blocked).not.toHaveBeenCalled(); expect(mocks.activityFind).not.toHaveBeenCalled(); expect(mocks.markRead).not.toHaveBeenCalled()
  mocks.prepared.mockResolvedValue(true); mocks.blocked.mockResolvedValue(true)
  expect(await getThread(a, room)).toMatchObject({ canSend: false })
  expect(mocks.blocked).toHaveBeenCalledWith(a, b)
 })
 it('hides blocked direct threads and suppresses blocked listing activity', async () => {
  mocks.blocked.mockResolvedValue(true); expect(await getThread(a, room)).toBeNull(); expect(await getConversationActivity(a, room)).toBeNull()
  mocks.thread.mockResolvedValue({ ...direct, kind: null }); expect(await getConversationActivity(a, room)).toMatchObject({ otherOnline: false, otherTyping: false, otherReadAt: null }); expect(mocks.activityFind).not.toHaveBeenCalled()
 })
 it('reads a send receipt only for its participant, sender and conversation', async () => {
  mocks.duplicate.mockResolvedValue({ id: messageId, conversation_id: room }); expect(await readMessageCommand(a, room, clientId)).toBe(messageId)
  mocks.duplicate.mockResolvedValue({ id: messageId, conversation_id: clientId }); await expect(readMessageCommand(a, room, clientId)).rejects.toMatchObject({ code: 'INVALID_RETRY' })
  mocks.thread.mockResolvedValue(null); expect(await readMessageCommand(a, room, clientId)).toBeNull()
 })
})
