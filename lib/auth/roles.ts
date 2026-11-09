import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { lockRecord } from '@/lib/database/transactions'
import { permissionsForRole, roleAllows, staffRole, type StaffPermission, type StaffRole } from './roles-policy'

/** Each privileged request reads the current database role, never JWT metadata
 * or a legacy environment allowlist. Revocation therefore takes effect at once. */
export async function currentStaffRole(userId: string): Promise<StaffRole | null> {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { staff_role: true } })
  return staffRole(account?.staff_role)
}

export async function hasStaffPermission(userId: string, permission: StaffPermission): Promise<boolean> {
  return roleAllows(await currentStaffRole(userId), permission)
}

export async function staffPermissions(userId: string): Promise<readonly StaffPermission[]> {
  return permissionsForRole(await currentStaffRole(userId))
}

/** Serialize privileged mutations with role changes and recheck under that lock. */
export async function assertStaffPermission(tx: Prisma.TransactionClient, userId: string, permission: StaffPermission): Promise<void> {
  if (!await lockRecord(tx, 'user', userId)) throw new Error('Staff access required.')
  const account = await tx.user.findUnique({ where: { id: userId }, select: { staff_role: true } })
  if (!roleAllows(account?.staff_role, permission)) throw new Error('Staff access required.')
}
