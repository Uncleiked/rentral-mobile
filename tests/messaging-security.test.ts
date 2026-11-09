import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: vi.fn(async () => undefined) }))

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), user: vi.fn(), thread: vi.fn(), duplicate: vi.fn(),
  count: vi.fn(), create: vi.fn(), update: vi.fn(), notify: vi.fn(), shared: vi.fn(), verified: vi.fn(), authenticated: vi.fn(), markRead: vi.fn(), messages: vi.fn(), latest: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction, conversation: { findFirst: mocks.thread, updateMany: mocks.markRead }, message: { findMany: mocks.messages } } }))
vi.mock('@/lib/action-helpers', () => ({ requireVerifiedUserId: mocks.verified, requireUserId: mocks.authenticated }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work), lockRecord: async (_tx: unknown, model: string, id: string) => { mocks.lock(model, id); return true } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getThread, persistMessage, markConversationRead } from '@/lib/messaging/service'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { markThreadReadAction, sendMessageAction } from '@/app/actions/messageActions'

const threadId = '11111111-1111-4111-8111-111111111111', clientId = '22222222-2222-4222-8222-222222222222'
const input = { conversationId: threadId, clientId, body: 'Hello, is an inspection available?' }

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  mocks.user.mockResolvedValue({ kyc_verified: true }); mocks.thread.mockResolvedValue({ seeker_id: 'seeker', lister_id: 'host' })
  mocks.duplicate.mockResolvedValue(null); mocks.count.mockResolvedValue(0); mocks.create.mockResolvedValue({ id: 'message-1' })
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: mocks.lock,
    user: { findUnique: mocks.user }, conversation: { findUnique: mocks.thread, findFirst: mocks.thread, update: mocks.update, updateMany: mocks.markRead },
    message: { findUnique: mocks.duplicate, findFirst: mocks.latest, count: mocks.count, create: mocks.create }, listing: { findFirst: mocks.shared }, notification: { create: mocks.notify } }))
})
afterEach(() => vi.unstubAllEnvs())

describe('messaging authorization and durable retries', () => {
  it('denies an outsider before reading or writing message content', async () => {
    await expect(persistMessage('outsider', input)).rejects.toThrow('FORBIDDEN')
    expect(mocks.duplicate).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
    mocks.thread.mockResolvedValue(null)
    expect(await getThread('outsider', threadId)).toBeNull()
    expect(mocks.messages).not.toHaveBeenCalled()
    expect(mocks.thread).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: threadId, OR: [{ seeker_id: 'outsider' }, { lister_id: 'outsider' }] } }))
  })
  it('serializes sender work and rejects a missing account inside the transaction', async () => {
    mocks.user.mockResolvedValue(null)
    await expect(persistMessage('seeker', input)).rejects.toThrow('FORBIDDEN')
    expect(assertActiveAccounts).toHaveBeenCalledWith(expect.anything(), ['seeker'])
    expect(mocks.thread).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('allows a participant without identity verification', async () => {
    mocks.user.mockResolvedValue({ id: 'seeker', kyc_verified: false })
    expect(await persistMessage('seeker', input)).toBe('message-1')
  })
  it('returns the durable ID on a retry without extra messages or notifications', async () => {
    mocks.duplicate.mockResolvedValue({ id: 'already-saved', conversation_id: threadId, body: input.body, shared_listing_id: null })
    expect(await persistMessage('seeker', input)).toBe('already-saved')
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.count).not.toHaveBeenCalled()
  })
  it('rejects a retry key reused for a different conversation', async () => {
    mocks.duplicate.mockResolvedValue({ id: 'already-saved', conversation_id: 'another-thread' })
    await expect(persistMessage('seeker', input)).rejects.toThrow('INVALID_RETRY')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it.each([{ body: 'Changed body' }, { shared_listing_id: clientId }])('rejects changed immutable retry content %j', async replacement => {
    mocks.duplicate.mockResolvedValue({ id: 'already-saved', conversation_id: threadId, body: input.body, shared_listing_id: null, ...replacement })
    await expect(persistMessage('seeker', input)).rejects.toThrow('INVALID_RETRY'); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('does not share private or pending inventory and enforces bounded send rate', async () => {
    mocks.shared.mockResolvedValue(null)
    await expect(persistMessage('seeker', { ...input, sharedListingId: clientId })).rejects.toThrow('LISTING_UNAVAILABLE')
    mocks.count.mockResolvedValue(30)
    await expect(persistMessage('seeker', input)).rejects.toThrow('RATE_LIMITED')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('checks authenticated account access at the action boundary', async () => {
    mocks.verified.mockResolvedValue(null)
    expect(await sendMessageAction(input)).toMatchObject({ success: false })
    expect(mocks.transaction).not.toHaveBeenCalled()
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
    mocks.verified.mockClear()
    expect(await sendMessageAction(input)).toMatchObject({ success: false })
    expect(mocks.verified).not.toHaveBeenCalled()
  })
  it('does not report a read receipt success for a nonparticipant', async () => {
    mocks.authenticated.mockResolvedValue('outsider'); mocks.thread.mockResolvedValue(null)
    expect(await markThreadReadAction(threadId)).toEqual({ success: false, error: 'Conversation unavailable.' })
  })
  it('does not reorder conversations when recording a displayed message', async () => {
    const updatedAt = new Date('2026-11-01T12:00:00Z'), readAt = new Date('2026-11-01T11:00:00Z')
    mocks.thread.mockResolvedValue({ id: threadId, seeker_id: 'seeker', updatedAt, seeker_read_at: null }); mocks.latest.mockResolvedValue({ createdAt: readAt }); mocks.markRead.mockResolvedValue({ count: 1 })
    expect(await markConversationRead('seeker', threadId, clientId)).toBe(true)
    expect(mocks.markRead).toHaveBeenCalledWith({ where: { id: threadId, updatedAt }, data: { seeker_read_at: readAt, updatedAt } })
  })
  it('never regresses read receipts or accepts a message from a different thread', async () => {
    mocks.thread.mockResolvedValue({ id: threadId, seeker_id: 'seeker', updatedAt: new Date(), seeker_read_at: new Date('2026-11-01T12:00:00Z') })
    mocks.latest.mockResolvedValue({ createdAt: new Date('2026-11-01T11:00:00Z') }); expect(await markConversationRead('seeker', threadId, clientId)).toBe(true)
    expect(mocks.markRead).not.toHaveBeenCalled(); mocks.latest.mockResolvedValue(null); expect(await markConversationRead('seeker', threadId, clientId)).toBe(false)
    expect(mocks.latest).toHaveBeenLastCalledWith(expect.objectContaining({ where: { conversation_id: threadId, id: clientId } }))
  })
})
