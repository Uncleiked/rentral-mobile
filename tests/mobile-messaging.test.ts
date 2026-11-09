import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn(), values: new Map<string, string>() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixture.request, ApiError: class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
} }))
vi.mock('../apps/mobile/src/lib/session-storage', () => ({ sessionStorage: { getItem: fixture.get, setItem: fixture.set, removeItem: fixture.remove } }))
import { ApiError } from '../apps/mobile/src/lib/api'
import { activityPost } from '../apps/mobile/src/lib/conversation-activity'
import { mergeLatestThread, mergeOlderThread } from '../apps/mobile/src/lib/conversation-window'
import { clearThreadActivity, loadThread, loadThreadActivity, markThreadRead, messageCommandSchema, publishThreadActivity, type NativeMessage, type NativeThread } from '../apps/mobile/src/lib/messaging-api'
import { dismissPendingMessage, loadPendingMessage, submitPendingMessage } from '../apps/mobile/src/lib/message-pending-store'
const actor = '11111111-1111-4111-8111-111111111111', conversation = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333', listing = '44444444-4444-4444-8444-444444444444', clientId = '55555555-5555-4555-8555-555555555555'
const messageId = '66666666-6666-4666-8666-666666666666', key = `rentral.message.pending.${actor}.${conversation}`
const command = { clientId, body: 'Is this car available tomorrow?', sharedListingId: listing }
const msg = (number: number): NativeMessage => ({ id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`, body: `Message ${number}`, senderId: actor, sentAt: new Date(Date.UTC(2030, 0, 1) + number * 1000).toISOString(), sharedListing: null })
const thread = (messages: NativeMessage[], hasMore = false): NativeThread => ({ id: conversation, userId: actor, listingId: listing, otherName: 'Other member', otherReadAt: null, hasMore, messages })
const failure = () => new ApiError('Unknown result', 'NETWORK_ERROR', 0)
beforeEach(() => {
  vi.resetAllMocks(); fixture.values.clear()
  fixture.get.mockImplementation(async key => fixture.values.get(key) ?? null)
  fixture.set.mockImplementation(async (key, value) => { fixture.values.set(key, value) })
  fixture.remove.mockImplementation(async key => { fixture.values.delete(key) })
  fixture.request.mockResolvedValue({ id: messageId })
})
it('supports a shared listing without invented message text and rejects an empty unshared message', () => {
  expect(messageCommandSchema.parse({ ...command, body: '' }).body).toBe('')
  expect(messageCommandSchema.safeParse({ clientId, body: '  ' }).success).toBe(false)
})
it('writes private actor/conversation/nonce/content before the single network send', async () => {
  fixture.request.mockImplementation(async () => {
    expect(JSON.parse(fixture.values.get(key)!)).toEqual({ version: 1, actorId: actor, conversationId: conversation, command })
    expect([...fixture.values.values()].join('')).not.toMatch(/access_token|refresh_token|Authorization/)
    return { id: messageId }
  })
  expect(await submitPendingMessage(actor, conversation, command)).toEqual({ id: messageId, cleanupPending: false })
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith(`/messages/${conversation}`, { method: 'POST', body: command, expectedUserId: actor })
  expect(await loadPendingMessage(actor, conversation)).toBeNull()
})
it('restores unknown content without replay and isolates actor and conversation namespaces', async () => {
  fixture.request.mockRejectedValueOnce(failure())
  await expect(submitPendingMessage(actor, conversation, command)).rejects.toMatchObject({ status: 0 })
  expect(await loadPendingMessage(actor, conversation)).toEqual({ command })
  expect(await loadPendingMessage(other, conversation)).toBeNull()
  expect(await loadPendingMessage(actor, other)).toBeNull()
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('retries exactly the same message and listing nonce after explicit recovery', async () => {
  fixture.request.mockRejectedValueOnce(failure())
  await expect(submitPendingMessage(actor, conversation, command)).rejects.toMatchObject({ status: 0 })
  await submitPendingMessage(actor, conversation, (await loadPendingMessage(actor, conversation))!.command)
  expect(fixture.request.mock.calls[0]).toEqual(fixture.request.mock.calls[1])
})
it.each([{ clientId: other }, { body: 'Different text' }, { sharedListingId: other }])('does not change an uncertain message nonce or instructions %j', async patch => {
  fixture.request.mockRejectedValueOnce(failure())
  await expect(submitPendingMessage(actor, conversation, command)).rejects.toMatchObject({ status: 0 })
  await expect(submitPendingMessage(actor, conversation, { ...command, ...patch })).rejects.toThrow('saved message still needs confirmation')
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('cannot send if encrypted persistence is unavailable', async () => {
  fixture.set.mockRejectedValueOnce(new Error('Keychain unavailable'))
  await expect(submitPendingMessage(actor, conversation, command)).rejects.toThrow('Keychain unavailable')
  expect(fixture.request).not.toHaveBeenCalled()
})
it('remembers valid acknowledgment and never resends when local cleanup failed', async () => {
  fixture.remove.mockRejectedValueOnce(new Error('Keychain unavailable'))
  expect((await submitPendingMessage(actor, conversation, command)).cleanupPending).toBe(true)
  expect((await loadPendingMessage(actor, conversation))?.confirmedId).toBe(messageId)
  await submitPendingMessage(actor, conversation, command)
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('keeps a malformed success uncertain instead of announcing delivery', async () => {
  fixture.request.mockResolvedValueOnce({ delivered: true })
  await expect(submitPendingMessage(actor, conversation, command)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(await loadPendingMessage(actor, conversation)).toEqual({ command })
})
it('clears a definite first rejection but preserves a previously uncertain request after a rejection', async () => {
  fixture.request.mockRejectedValueOnce(new ApiError('Not allowed', 'FORBIDDEN', 403))
  await expect(submitPendingMessage(actor, conversation, command)).rejects.toMatchObject({ status: 403 })
  expect(await loadPendingMessage(actor, conversation)).toBeNull()
  fixture.request.mockRejectedValueOnce(failure()).mockRejectedValueOnce(new ApiError('Not allowed', 'FORBIDDEN', 403))
  await expect(submitPendingMessage(actor, conversation, command)).rejects.toMatchObject({ status: 0 })
  await expect(submitPendingMessage(actor, conversation, command)).rejects.toMatchObject({ status: 403 })
  expect(await loadPendingMessage(actor, conversation)).not.toBeNull()
})
it('requires deliberate recovery for missing chunks instead of generating another message nonce', async () => {
  fixture.values.set(`${key}.present`, '1')
  await expect(loadPendingMessage(actor, conversation)).rejects.toThrow('incomplete')
  await expect(submitPendingMessage(actor, conversation, command)).rejects.toThrow('incomplete')
  expect(fixture.request).not.toHaveBeenCalled()
  await dismissPendingMessage(actor, conversation)
  expect(await loadPendingMessage(actor, conversation)).toBeNull()
})
it('keeps exhausted older history only when latest messages overlap the continuous known window', () => {
  const previous = thread([1, 2, 3, 4].map(msg))
  const next = thread([3, 4, 5, 6].map(msg), true)
  const result = mergeLatestThread(previous, next)
  expect(result.thread.messages.map(item => item.body)).toEqual([1, 2, 3, 4, 5, 6].map(n => `Message ${n}`))
  expect(result.thread.hasMore).toBe(false)
  expect(result.gap).toBe(false)
})
it('resets to the latest contiguous window if more than a page arrived while backgrounded', () => {
  const previous = thread([1, 2, 3].map(msg))
  const next = thread(Array.from({ length: 60 }, (_, n) => msg(100 + n)), true)
  const result = mergeLatestThread(previous, next)
  expect(result).toEqual({ thread: next, gap: true })
  const earlier = thread(Array.from({ length: 60 }, (_, n) => msg(40 + n)), true)
  const recovered = mergeOlderThread(result.thread, earlier, next.messages[0].id)
  expect(recovered?.messages).toHaveLength(120)
  expect(recovered?.messages[59].body).toBe('Message 99')
  expect(recovered?.messages[60].body).toBe('Message 100')
})
it('ignores an older-page response belonging to a discarded archive anchor', () => {
  const previous = thread([100, 101].map(msg), true)
  expect(mergeOlderThread(previous, thread([0, 1].map(msg)), msg(2).id)).toBe(previous)
})
it('does not preserve content after the server returns an empty authoritative window or another actor', () => {
  const old = thread([1, 2].map(msg))
  expect(mergeLatestThread(old, thread([])).thread.messages).toEqual([])
  expect(mergeLatestThread(old, { ...thread([3].map(msg)), userId: other }).thread.messages).toEqual([msg(3)])
})
it('checks actual thread/actor identity and preserves participant denial without another request', async () => {
  fixture.request.mockResolvedValueOnce({ ...thread([msg(1)]), userId: other })
  await expect(loadThread(conversation, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  fixture.request.mockRejectedValueOnce(new ApiError('Unavailable', 'NOT_FOUND', 404))
  await expect(loadThread(conversation, actor)).rejects.toMatchObject({ status: 404 })
  expect(fixture.request).toHaveBeenCalledTimes(2)
})
it('validates coarse activity and scopes activity/read commands without exposing exact last-seen data', async () => {
  fixture.request.mockResolvedValueOnce({ otherOnline: true, otherTyping: true, otherReadAt: null, latestMessageId: messageId })
    .mockResolvedValueOnce({ recorded: true }).mockResolvedValueOnce({ read: true }).mockResolvedValueOnce({ cleared: true })
  expect((await loadThreadActivity(conversation, actor)).otherTyping).toBe(true)
  await publishThreadActivity(conversation, actor, true)
  await markThreadRead(conversation, actor, messageId)
  await clearThreadActivity(conversation, actor)
  expect(fixture.request.mock.calls[2]).toEqual([`/messages/${conversation}/read`, { method: 'POST', body: { messageId }, expectedUserId: actor }])
  fixture.request.mockResolvedValueOnce({ otherOnline: true, otherTyping: false, otherReadAt: null, latestMessageId: null, lastSeenAt: 'private' })
  await expect(loadThreadActivity(conversation, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('throttles typing to five seconds, expires idle typing and uses the same heartbeat after twenty seconds', () => {
  expect(activityPost(100000, 99000, false, 100000)).toEqual({ due: false, typing: true })
  expect(activityPost(104000, 99000, true, 104000)).toEqual({ due: true, typing: true })
  expect(activityPost(110000, 104000, true, 104000)).toEqual({ due: true, typing: false })
  expect(activityPost(125000, 110000, false, 0)).toEqual({ due: false, typing: false })
  expect(activityPost(130000, 110000, false, 0)).toEqual({ due: true, typing: false })
})
