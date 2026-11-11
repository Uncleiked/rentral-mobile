import { requireSessionUserId } from '@/lib/action-helpers'
import { currentStaffRole, hasStaffPermission } from '@/lib/auth/roles'
import type { StaffPermission } from '@/lib/auth/roles-policy'

/** Legacy name retained for callers; persisted roles are the sole authority. */
export async function isAdminId(id: string): Promise<boolean> {
  return ['owner', 'admin'].includes(await currentStaffRole(id) ?? '')
}

export async function requireStaffId(permission: StaffPermission = 'staff:workspace'): Promise<string | null> {
  const id = await requireSessionUserId()
  return id && await hasStaffPermission(id, permission) ? id : null
}

export async function requireAdminId(): Promise<string | null> {
  return requireStaffId('staff:manage')
}

export async function requireInsightsId(): Promise<string | null> {
  return requireStaffId('insights:view')
}
