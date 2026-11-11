import type { AdminDashboard, AdminListing, AdminUser } from '@/lib/contracts/admin'

export type AdminTab = 'listings' | 'members' | 'organizations' | 'inspections' | 'audit' | 'tools'
export type AdminSelection = { kind: 'listing'; value: AdminListing } | { kind: 'user'; value: AdminUser } | { kind: 'inspection'; value: AdminDashboard['inspections'][number] }
export type AdminDecision = { value: string; label: string }

export function decisionsFor(selection: AdminSelection, permissions: readonly string[], actorId: string, owner: boolean): AdminDecision[] {
  const can = (permission: string) => permissions.includes(permission)
  if (selection.kind === 'inspection') return can('inspection:review') ? [{ value: 'approve', label: 'Approve manual inspection evidence' }, { value: 'reject', label: 'Reject manual inspection evidence' }] : []
  if (selection.kind === 'listing') return [
    ...(can('listing:review') ? [{ value: 'approve_document', label: 'Approve current document' }, { value: 'reject_document', label: 'Reject document' }, { value: 'publish', label: 'Publish listing' }, { value: 'suspend_listing', label: 'Remove listing from discovery' }] : []),
    ...(can('listing:waive') ? [{ value: 'waive_fee', label: 'Waive publication fee' }, { value: 'revoke_fee_waiver', label: 'Revoke fee waiver' }] : []),
  ]
  if (selection.value.closed) return []
  if (selection.value.id === actorId || selection.value.role === 'owner') return selection.value.id === actorId && owner && can('gallery:manage') ? [{ value: 'set_gallery_permission', label: 'Gallery upload permission' }] : []
  return [
    ...(can('gallery:manage') && !selection.value.suspended ? [{ value: 'set_gallery_permission', label: 'Gallery upload permission' }] : []),
    ...(can('staff:manage') && !selection.value.suspended ? [{ value: 'change_role', label: 'Change staff role' }] : []),
    ...(can('user:manage') ? [{ value: selection.value.suspended ? 'restore_user' : 'suspend_user', label: selection.value.suspended ? 'Restore suspended account' : 'Suspend account' }] : []),
    ...(can('owner:transfer') && !selection.value.suspended ? [{ value: 'transfer_ownership', label: 'Transfer platform ownership to this account' }] : []),
  ]
}

export function adminTabs(permissions: readonly string[]): { id: AdminTab; label: string }[] {
  return [
    ...(permissions.includes('listing:review') || permissions.includes('listing:waive') ? [{ id: 'listings' as const, label: 'Listings' }] : []),
    ...(permissions.some(permission => ['user:manage', 'staff:manage', 'gallery:manage'].includes(permission)) ? [{ id: 'members' as const, label: 'Members & permissions' }] : []),
    ...(permissions.includes('user:manage') ? [{ id: 'organizations' as const, label: 'Organizations' }] : []),
    ...(permissions.includes('inspection:review') ? [{ id: 'inspections' as const, label: 'Inspections' }] : []),
    ...(permissions.includes('operations:read') ? [{ id: 'audit' as const, label: 'Audit trail' }] : []),
    { id: 'tools' as const, label: 'More workspaces' },
  ]
}