import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), upsert: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: mocks.find, updateMany: mocks.update, upsert: mocks.upsert } } }))
import { defaultAccountHandle, ensureAccount, ensureAccountHandle } from '@/lib/accounts/bootstrap'
import { accountPatchSchema, publicAccount } from '@/lib/api/account'
import { activeAccountWhere } from '@/lib/accounts/availability'

const id = '55bfc098-ff33-4fdd-b7ae-68d810a74050'
const account = { id, email: 'member@example.com', username: null, account_type: null, bio: null, avatar_url: null, createdAt: new Date('2026-01-01T00:00:00Z') }
beforeEach(() => vi.resetAllMocks())

it('bootstraps only a missing public handle without fabricating identity evidence', async () => {
  const username = defaultAccountHandle(id)
  expect(username).toMatch(/^[a-z0-9_]{3,24}$/)
  expect(username).not.toContain(account.email)
  mocks.find.mockResolvedValueOnce(account).mockResolvedValueOnce({ ...account, username, account_type: 'individual' })
  mocks.update.mockResolvedValue({ count: 1 })
  expect(await ensureAccountHandle(id)).toMatchObject({ username })
  expect(mocks.update).toHaveBeenCalledWith({ where: { id, username: null, ...activeAccountWhere }, data: { username, account_type: 'individual' } })
  expect(JSON.stringify(mocks.update.mock.calls)).not.toMatch(/kyc_verified|verifiedDocument|individualProfile|verification_status/)
})

it('preserves existing handles and tolerates concurrent handle initialization', async () => {
  mocks.find.mockResolvedValueOnce({ ...account, username: 'existing_host' })
  expect(await ensureAccountHandle(id)).toMatchObject({ username: 'existing_host' })
  expect(mocks.update).not.toHaveBeenCalled()
  mocks.find.mockResolvedValueOnce(account).mockResolvedValueOnce({ ...account, username: 'chosen_concurrently' })
  mocks.update.mockResolvedValue({ count: 0 })
  expect(await ensureAccountHandle(id)).toMatchObject({ username: 'chosen_concurrently' })
})

it('tries a different generated handle on a unique collision but propagates database outages', async () => {
  mocks.find.mockResolvedValueOnce(account).mockResolvedValueOnce({ ...account, username: defaultAccountHandle(id, 1) })
  mocks.update.mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce({ count: 1 })
  expect(await ensureAccountHandle(id)).toMatchObject({ username: defaultAccountHandle(id, 1) })
  expect(mocks.update).toHaveBeenCalledTimes(2)
  mocks.find.mockResolvedValueOnce(account)
  mocks.update.mockRejectedValueOnce(new Error('offline'))
  await expect(ensureAccountHandle(id)).rejects.toThrow('offline')
})

it('does not manufacture an account for an identity lacking a verified auth email', async () => {
  mocks.find.mockResolvedValue(null)
  expect(await ensureAccount({ id })).toBeNull()
  expect(mocks.upsert).not.toHaveBeenCalled()
})

it('reconciles a missing signup row using only the verified user id and email', async () => {
  mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...account, username: 'ready' })
  mocks.upsert.mockResolvedValue({ id })
  expect(await ensureAccount({ id, email: account.email })).toMatchObject({ username: 'ready' })
  expect(mocks.upsert).toHaveBeenCalledWith({ where: { id }, create: { id, email: account.email }, update: {}, select: { id: true } })
})

it('accepts optional profile edits and rejects privilege fields, reserved names and oversized bios', () => {
  expect(accountPatchSchema.parse({ username: ' New_User ' })).toEqual({ username: 'new_user' })
  expect(accountPatchSchema.parse({ bio: null })).toEqual({ bio: null })
  for (const input of [{}, { kyc_verified: true }, { username: 'admin' }, { bio: 'x'.repeat(281) }, { accountType: 'organization' }]) {
    expect(accountPatchSchema.safeParse(input).success).toBe(false)
  }
})

it('returns only account fields needed by the signed-in user', () => {
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
  const result = publicAccount({ ...account, username: 'member' })
  expect(result).toEqual({ id, email: account.email, username: 'member', bio: null, avatarUrl: null, accountType: 'individual', memberSince: account.createdAt.toISOString(), platformAvailable: false })
  vi.unstubAllEnvs()
})
