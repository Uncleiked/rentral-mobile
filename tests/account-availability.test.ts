import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { accountIsActive, activeAccountWhere, assertActiveAccounts } from '@/lib/accounts/availability'

describe('account availability serialization', () => {
  it('treats legacy missing closure dates as active and rejects missing or closed users', () => {
    expect(accountIsActive({ closed_at: null })).toBe(true)
    expect(accountIsActive({ closed_at: undefined } as unknown as { closed_at: Date | null })).toBe(true)
    expect(accountIsActive(null)).toBe(false)
    expect(accountIsActive({ closed_at: new Date() })).toBe(false)
  })
  it('sorts and deduplicates participant writes with the active predicate on the write itself', async () => {
    const write = vi.fn(async () => ({ count: 1 }))
    await assertActiveAccounts({ user: { updateMany: write } } as unknown as Prisma.TransactionClient, ['b', 'a', 'b'])
    expect(write.mock.calls).toEqual([
      [{ where: { id: 'a', ...activeAccountWhere }, data: { revision: { increment: 1 } } }],
      [{ where: { id: 'b', ...activeAccountWhere }, data: { revision: { increment: 1 } } }],
    ])
  })
  it('fails closed before further participant work when the active conditional write matches no account', async () => {
    const write = vi.fn().mockResolvedValueOnce({ count: 0 })
    await expect(assertActiveAccounts({ user: { updateMany: write } } as unknown as Prisma.TransactionClient, ['a', 'b'])).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
    expect(write).toHaveBeenCalledTimes(1)
  })
})
