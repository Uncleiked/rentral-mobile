import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ user: vi.fn(), lock: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn(), accounts: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: mocks.user, findMany: mocks.accounts } } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work),
  lockRecord: async (_tx: unknown, _model: string, id: string) => { mocks.lock(id); return true } }))
import { changeStaffRole, getStaffAccounts } from '@/lib/auth/staff-service'
import { permissionsForRole, roleAllows } from '@/lib/auth/roles-policy'

const actor = '11111111-1111-4111-8111-111111111111'
const target = '22222222-2222-4222-8222-222222222222'
const input = { userId: target, role: 'moderator', reason: 'Approved moderator for asset and safety reviews.' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockImplementation(async ({ where }: { where: { id: string } }) => ({ staff_role: where.id === actor ? 'admin' : null }))
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({
    user: { findUnique: mocks.user, findUniqueOrThrow: mocks.user, update: mocks.update }, adminAudit: { create: mocks.audit },
  }))
})

describe('audited staff role changes', () => {
  it('rechecks the administrator and updates access alongside its audit', async () => {
    await changeStaffRole(actor, input)
    expect(mocks.lock.mock.calls).toEqual([[actor], [target]])
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: target }, data: { staff_role: 'moderator' } })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actor_id: actor,
      action: 'change_staff_role', target_id: target, metadata: { previousRole: null, role: 'moderator', source: 'staff_workspace' } }) }))
  })
  it('denies non-administrators even when invoking the domain service directly', async () => {
    for (const role of ['moderator', 'finance', 'analyst', 'owner', null]) {
      mocks.user.mockResolvedValue({ staff_role: role })
      await expect(changeStaffRole(actor, input)).rejects.toThrow('Staff access')
    }
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('prevents self-demotion and rejects forged request fields before any transaction', async () => {
    await expect(changeStaffRole(actor, { ...input, userId: actor, role: 'member' })).rejects.toThrow('another administrator')
    await expect(changeStaffRole(actor, { ...input, is_admin: true })).rejects.toThrow()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('removes access explicitly and records the previous role', async () => {
    mocks.user.mockResolvedValueOnce({ staff_role: 'admin' }).mockResolvedValue({ staff_role: 'finance' })
    await changeStaffRole(actor, { ...input, role: 'member' })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: target }, data: { staff_role: null } })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: { previousRole: 'finance', role: null, source: 'staff_workspace' } }) }))
  })
  it('does not disclose the staff directory to moderators or members', async () => {
    mocks.user.mockResolvedValue({ staff_role: 'moderator' })
    await expect(getStaffAccounts(actor)).rejects.toThrow('Staff access')
    expect(mocks.accounts).not.toHaveBeenCalled()
  })
  it('denies unknown roles while separating moderation, finance and Insights powers', () => {
    expect(permissionsForRole('superadmin')).toEqual([])
    expect(roleAllows('moderator', 'listing:review')).toBe(true)
    expect(roleAllows('moderator', 'finance:review')).toBe(false)
    expect(roleAllows('finance', 'dispute:review')).toBe(false)
    expect(roleAllows('analyst', 'insights:view')).toBe(true)
    expect(roleAllows('analyst', 'staff:manage')).toBe(false)
  })
})
