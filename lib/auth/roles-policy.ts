export const STAFF_ROLES = ['owner', 'admin', 'moderator', 'finance', 'analyst'] as const
export type StaffRole = typeof STAFF_ROLES[number]
export type StaffPermission =
  | 'staff:workspace' | 'staff:manage' | 'listing:review' | 'dispute:review'
  | 'safety:review' | 'renewal:review' | 'termination:review'
  | 'finance:review' | 'settlement:approve' | 'insights:view' | 'operations:read' | 'operations:manage' | 'ad:review'
  | 'user:manage' | 'gallery:manage' | 'listing:waive' | 'inspection:review' | 'owner:transfer'

const permissions: Record<StaffRole, readonly StaffPermission[]> = {
  owner: ['staff:workspace', 'staff:manage', 'listing:review', 'dispute:review', 'safety:review', 'renewal:review', 'termination:review', 'finance:review', 'settlement:approve', 'insights:view', 'operations:read', 'operations:manage', 'ad:review', 'user:manage', 'gallery:manage', 'listing:waive', 'inspection:review', 'owner:transfer'],
  admin: ['staff:workspace', 'staff:manage', 'listing:review', 'dispute:review', 'safety:review', 'renewal:review', 'termination:review', 'finance:review', 'settlement:approve', 'insights:view', 'operations:read', 'operations:manage', 'ad:review', 'user:manage', 'gallery:manage', 'listing:waive', 'inspection:review'],
  moderator: ['staff:workspace', 'listing:review', 'dispute:review', 'safety:review', 'renewal:review', 'termination:review', 'operations:read', 'operations:manage', 'ad:review', 'inspection:review'],
  finance: ['staff:workspace', 'finance:review', 'settlement:approve', 'operations:read'],
  analyst: ['insights:view'],
}

export function staffRole(value: unknown): StaffRole | null {
  return typeof value === 'string' && STAFF_ROLES.some(role => role === value) ? value as StaffRole : null
}

export function permissionsForRole(value: unknown): readonly StaffPermission[] {
  const role = staffRole(value)
  return role ? permissions[role] : []
}

export function roleAllows(value: unknown, permission: StaffPermission): boolean {
  return permissionsForRole(value).includes(permission)
}
