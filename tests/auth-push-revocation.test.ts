import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ prepared: vi.fn(), revoke: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ pushPrepared: mocks.prepared }))
vi.mock('@/lib/push/devices', () => ({ closePushAccountInTransaction: mocks.revoke }))
vi.mock('@/lib/auth/email-delivery', () => ({ cancelAuthEmails: vi.fn() }))
import { revokeAccountPush } from '@/lib/auth/credential-state'
beforeEach(() => vi.resetAllMocks())
describe('credential-rotation device revocation', () => {
  it('fails closed on preparation errors and never touches an unprepared push collection', async () => {
    mocks.prepared.mockResolvedValue(false)
    await revokeAccountPush({} as Prisma.TransactionClient, 'actor')
    expect(mocks.revoke).not.toHaveBeenCalled()
    mocks.prepared.mockRejectedValueOnce(new Error('readiness unavailable'))
    await expect(revokeAccountPush({} as Prisma.TransactionClient, 'actor')).rejects.toThrow()
    expect(mocks.revoke).not.toHaveBeenCalled()
  })
  it('revokes inside the existing transaction even when sending is disabled', async () => {
    mocks.prepared.mockResolvedValue(true)
    const tx = {} as Prisma.TransactionClient
    await revokeAccountPush(tx, 'actor')
    expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith(tx, 'actor')
  })
})
