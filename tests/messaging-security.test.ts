import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), lock: vi.fn(), user: vi.fn(), thread: vi.fn(), duplicate: vi.fn(),
  count: vi.fn(), create: vi.fn(), update: vi.fn(), notify: vi.fn(), shared: vi.fn(), verified: vi.fn(), authenticated: vi.fn(), markRead: vi.fn(), messages: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction, conversation: { findFirst: mocks.thread, updateMany: mocks.markRead }, message: { findMany: mocks.messages } } }))
vi.mock('@/lib/action-helpers', () => ({ requireVerifiedUserId: mocks.verified, requireUserId: mocks.authenticated }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getThread, persistMessage } from '@/lib/messaging/service'
import { markThreadReadAction, sendMessageAction } from '@/app/actions/messageActions'

const threadId = '11111111-1111-4111-8111-111111111111', clientId = '22222222-2222-4222-8222-222222222222'
const input = { conversationId: threadId, clientId, body: 'Hello, is an inspection available?' }

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  mocks.user.mockResolvedValue({ kyc_verified: true }); mocks.thread.mockResolvedValue({ seeker_id: 'seeker', lister_id: 'host' })
  mocks.duplicate.mockResolvedValue(null); mocks.count.mockResolvedValue(0); mocks.create.mockResolvedValue({ id: 'message-1' })
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: mocks.lock,
    user: { findUnique: mocks.user }, conversation: { findUnique: mocks.thread, update: mocks.update },
    message: { findUnique: mocks.duplicate, count: mocks.count, create: mocks.create }, listing: { findFirst: mocks.shared }, notification: { create: mocks.notify } }))
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
  it('serializes sender work and rechecks revoked KYC inside the transaction', async () => {
    mocks.user.mockResolvedValue({ kyc_verified: false })
    await expect(persistMessage('seeker', input)).rejects.toThrow('FORBIDDEN')
    expect(mocks.lock.mock.calls[0][0].join('')).toContain('FOR UPDATE')
    expect(mocks.thread).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('returns the durable ID on a retry without extra messages or notifications', async () => {
    mocks.duplicate.mockResolvedValue({ id: 'already-saved', conversation_id: threadId })
    expect(await persistMessage('seeker', input)).toBe('already-saved')
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.count).not.toHaveBeenCalled()
  })
  it('rejects a retry key reused for a different conversation', async () => {
    mocks.duplicate.mockResolvedValue({ id: 'already-saved', conversation_id: 'another-thread' })
    await expect(persistMessage('seeker', input)).rejects.toThrow('INVALID_RETRY')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('does not share private or pending inventory and enforces bounded send rate', async () => {
    mocks.shared.mockResolvedValue(null)
    await expect(persistMessage('seeker', { ...input, sharedListingId: clientId })).rejects.toThrow('LISTING_UNAVAILABLE')
    mocks.count.mockResolvedValue(30)
    await expect(persistMessage('seeker', input)).rejects.toThrow('RATE_LIMITED')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('checks current verified identity at the action boundary', async () => {
    mocks.verified.mockResolvedValue(null)
    expect(await sendMessageAction(input)).toMatchObject({ success: false })
    expect(mocks.transaction).not.toHaveBeenCalled()
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
    mocks.verified.mockClear()
    expect(await sendMessageAction(input)).toMatchObject({ success: false })
    expect(mocks.verified).not.toHaveBeenCalled()
  })
  it('does not report a read receipt success for a nonparticipant', async () => {
    mocks.authenticated.mockResolvedValue('outsider'); mocks.markRead.mockResolvedValue({ count: 0 })
    mocks.transaction.mockResolvedValue([{ count: 0 }, { count: 0 }])
    expect(await markThreadReadAction(threadId)).toEqual({ success: false, error: 'Conversation unavailable.' })
  })
})
