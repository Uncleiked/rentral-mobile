import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const locks = vi.hoisted(() => ({ active: vi.fn() }))
vi.mock('@/lib/database/revision-lock', () => ({ lockActiveAccount: locks.active }))
import { accountIsActive, assertActiveAccounts } from '@/lib/accounts/availability'
beforeEach(() => vi.resetAllMocks())

describe('account availability serialization', () => {
  it('treats legacy missing closure dates as active and rejects missing or closed users', () => {
    expect(accountIsActive({ closed_at: null })).toBe(true)
    expect(accountIsActive({ closed_at: undefined } as unknown as { closed_at: Date | null })).toBe(true)
    expect(accountIsActive(null)).toBe(false)
    expect(accountIsActive({ closed_at: new Date() })).toBe(false)
  })
  it('sorts and deduplicates participant locks across competing operations', async () => {
    const tx = {} as Prisma.TransactionClient
    locks.active.mockResolvedValue(true)
    await assertActiveAccounts(tx, ['b', 'a', 'b'])
    expect(locks.active.mock.calls).toEqual([[tx, 'a'], [tx, 'b']])
  })
  it('stops before further participant work when the conditional lock finds no active account', async () => {
    locks.active.mockResolvedValueOnce(false)
    await expect(assertActiveAccounts({} as Prisma.TransactionClient, ['a', 'b'])).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
    expect(locks.active).toHaveBeenCalledTimes(1)
  })
})
