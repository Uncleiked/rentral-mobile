import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ user: vi.fn(), updateUser: vi.fn(), lock: vi.fn(), verify: vi.fn(), booking: vi.fn(), report: vi.fn(), payment: vi.fn(), operation: vi.fn(), archive: vi.fn(), revoke: vi.fn(), invalidate: vi.fn(), analytics: vi.fn(), matching: vi.fn(), push: vi.fn(), recipients: vi.fn(), saved: vi.fn(), lifecycle: vi.fn(), financeReady: vi.fn(), messages: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: mocks.user }, message: { findMany: mocks.messages } } }))
vi.mock('@/lib/auth/password', () => ({ verifyPassword: mocks.verify }))
vi.mock('@/lib/auth/credential-state', () => ({ invalidateAccountChallenges: mocks.invalidate }))
vi.mock('@/lib/analytics/service', () => ({ withdrawAnalyticsHistoryInTransaction: mocks.analytics }))
vi.mock('@/lib/matching/profiles', () => ({ withdrawMatchingAccountInTransaction: mocks.matching }))
vi.mock('@/lib/push/devices', () => ({ closePushAccountInTransaction: mocks.push }))
vi.mock('@/lib/lifecycle/service', () => ({ lifecycleAccountClosureBlocked: mocks.lifecycle }))
vi.mock('@/lib/api/rate-limit', () => ({ apiRateLimiter: { allow: () => true } }))
vi.mock('@/lib/database/readiness', () => ({ authSecurityPrepared: async () => true, financialPrepared: mocks.financeReady, matchingPrepared: async () => true, lifecyclePrepared: async () => true, commercialPrepared: async () => false, pushPrepared: async () => true }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: async (work: (tx: unknown) => unknown) => work({
  user: { updateMany: mocks.lock, findUniqueOrThrow: mocks.user, update: mocks.updateUser }, booking: { findFirst: mocks.booking }, dispute: { findFirst: mocks.report }, paymentIntent: { findFirst: mocks.payment }, financialOperation: { findFirst: mocks.operation }, listing: { updateMany: mocks.archive }, authSession: { updateMany: mocks.revoke }, paymentRecipient: { updateMany: mocks.recipients }, savedListing: { deleteMany: mocks.saved },
}) }))
import { closeAccount } from '@/lib/accounts/lifecycle'
import { exportAccountPage } from '@/lib/accounts/export'

const id = randomUUID()
beforeEach(() => {
  vi.resetAllMocks(); mocks.user.mockResolvedValue({ id, email: 'owned@fixture.invalid', password_hash: 'private-hash', closed_at: null }); mocks.verify.mockResolvedValue(true); mocks.lock.mockResolvedValue({ count: 1 }); mocks.financeReady.mockResolvedValue(true)
  for (const fn of [mocks.booking, mocks.report, mocks.payment, mocks.operation]) fn.mockResolvedValue(null)
  mocks.lifecycle.mockResolvedValue(false)
})
describe('account closure boundary', () => {
  it('protects the current owner from account closure until ownership is transferred', async () => {
    mocks.user.mockResolvedValue({ id, email: 'owned@fixture.invalid', password_hash: 'private-hash', closed_at: null, staff_role: 'owner' })
    await expect(closeAccount(id, { currentPassword: 'proof' })).rejects.toMatchObject({ code: 'OWNER_TRANSFER_REQUIRED' })
    expect(mocks.archive).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it('checks current proof before transaction writes', async () => {
    mocks.verify.mockResolvedValue(false)
    await expect(closeAccount(id, { currentPassword: 'wrong' })).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' })
    expect(mocks.lock).not.toHaveBeenCalled()
  })
  it.each(['booking', 'report', 'payment', 'operation', 'lifecycle'] as const)('retains account activity when %s has an ongoing obligation', async kind => {
    mocks[kind].mockResolvedValue(kind === 'lifecycle' ? true : { id: randomUUID() })
    await expect(closeAccount(id, { currentPassword: 'proof' })).rejects.toMatchObject({ code: 'ACCOUNT_HAS_OBLIGATIONS' })
    expect(mocks.archive).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it('rejects a credential snapshot superseded before obtaining the write lock', async () => {
    mocks.user.mockResolvedValueOnce({ id, email: 'first@fixture.invalid', password_hash: 'old-hash', closed_at: null }).mockResolvedValueOnce({ email: 'changed@fixture.invalid', password_hash: 'new-hash' })
    await expect(closeAccount(id, { currentPassword: 'proof' })).rejects.toMatchObject({ code: 'CREDENTIALS_CHANGED' })
    expect(mocks.archive).not.toHaveBeenCalled()
  })
  it('suspends public assets and clears public identity while retaining immutable records', async () => {
    await closeAccount(id, { currentPassword: 'proof' })
    expect(mocks.archive).toHaveBeenCalledWith(expect.objectContaining({ where: { lister_id: id }, data: expect.objectContaining({ listing_status: 'suspended' }) }))
    expect(mocks.revoke).toHaveBeenCalled(); expect(mocks.invalidate).toHaveBeenCalledWith(expect.anything(), id, true)
    expect(mocks.analytics).toHaveBeenCalled(); expect(mocks.matching).toHaveBeenCalled(); expect(mocks.push).toHaveBeenCalled(); expect(mocks.recipients).toHaveBeenCalled()
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id }, data: { closed_at: expect.any(Date), username: null, bio: null, avatar_url: null, staff_role: null } })
  })
  it('does not query unprepared financial collections', async () => {
    mocks.financeReady.mockResolvedValue(false)
    await closeAccount(id, { currentPassword: 'proof' })
    expect(mocks.operation).not.toHaveBeenCalled(); expect(mocks.recipients).not.toHaveBeenCalled()
  })
})
describe('bounded account export', () => {
  it('strictly validates resources, cursors and page bounds before any export query', async () => {
    await expect(exportAccountPage(id, { resource: 'password_hash' })).rejects.toThrow()
    await expect(exportAccountPage(id, { resource: 'messages', limit: 101 })).rejects.toThrow()
    await expect(exportAccountPage(id, { resource: 'messages', cursor: 'untrusted' })).rejects.toThrow()
    expect(mocks.messages).not.toHaveBeenCalled()
  })
  it('returns only the requested bounded page and scopes authored message bodies to the actor', async () => {
    const first = randomUUID(), second = randomUUID(), date = new Date()
    mocks.messages.mockResolvedValue([{ id: first, body: 'own', createdAt: date }, { id: second, body: 'next', createdAt: date }])
    const page = await exportAccountPage(id, { resource: 'messages', limit: 1 })
    expect(page).toMatchObject({ resource: 'messages', items: [{ id: first, body: 'own', createdAt: date.toISOString() }], nextCursor: first })
    expect(mocks.messages).toHaveBeenCalledWith(expect.objectContaining({ where: { sender_id: id }, take: 2, select: { id: true, conversation_id: true, body: true, shared_listing_id: true, createdAt: true } }))
  })
})
