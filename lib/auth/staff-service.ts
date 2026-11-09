import { z } from 'zod'
import prisma from '@/lib/db'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertStaffPermission, hasStaffPermission } from './roles'
import { STAFF_ROLES } from './roles-policy'

export const changeStaffRoleSchema = z.object({
  userId: z.uuid(), role: z.enum([...STAFF_ROLES, 'member']),
  reason: z.string().trim().min(15).max(2000),
}).strict()

export async function changeStaffRole(actorId: string, input: unknown): Promise<void> {
  const data = changeStaffRoleSchema.parse(input)
  // Another administrator must review changes to your own privileged access.
  // This also prevents two independent self-demotions leaving no administrator.
  if (actorId === data.userId) throw new Error('Ask another administrator to change your role.')
  await withTransaction(async tx => {
    await assertStaffPermission(tx, actorId, 'staff:manage')
    if (!await lockRecord(tx, 'user', data.userId)) throw new Error('Member not found.')
    const target = await tx.user.findUniqueOrThrow({ where: { id: data.userId }, select: { staff_role: true } })
    const role = data.role === 'member' ? null : data.role
    if (role === target.staff_role) return
    await tx.user.update({ where: { id: data.userId }, data: { staff_role: role } })
    await tx.adminAudit.create({ data: { actor_id: actorId, action: 'change_staff_role', target_type: 'user', target_id: data.userId,
      reason: data.reason, metadata: { previousRole: target.staff_role, role, source: 'staff_workspace' } } })
  })
}

export async function getStaffAccounts(actorId: string) {
  // This service is also called by server components; do not rely on a page guard.
  if (!await hasStaffPermission(actorId, 'staff:manage')) throw new Error('Staff access required.')
  return prisma.user.findMany({ where: { staff_role: { in: [...STAFF_ROLES] } }, take: 100,
    orderBy: { createdAt: 'asc' }, select: { id: true, username: true, staff_role: true } })
}
