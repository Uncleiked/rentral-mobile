import type { AdminCommand, AdminUser } from '../../../../lib/contracts/admin'

export const nativeAdminOperationLabels: Record<AdminCommand['operation'], string> = { approve_document: 'Approve document', reject_document: 'Reject document', publish: 'Publish listing', suspend_listing: 'Suspend listing', waive_fee: 'Waive listing fee', revoke_fee_waiver: 'Revoke fee waiver', change_role: 'Change staff role', set_gallery_permission: 'Change gallery permission', set_free_posting_permission: 'Change free posting', set_direct_publish_permission: 'Change direct publishing', suspend_user: 'Suspend account', restore_user: 'Restore account', review_manual_inspection: 'Review manual inspection', transfer_ownership: 'Transfer ownership' }
type GrantOperation = 'set_gallery_permission' | 'set_free_posting_permission' | 'set_direct_publish_permission'
type GrantChoice = { operation: GrantOperation; label: string; current: boolean; ownerOverride: boolean; help: string }
/** Presentation only; server commands still recheck current role, revision and audit evidence. */
export function nativePublishingChoices(user: AdminUser, actorId: string, actorRole: string, permissions: readonly string[]): GrantChoice[] {
  if (user.closed || user.suspended || (user.role === 'owner' && user.id !== actorId) || (user.id === actorId && actorRole !== 'owner')) return []
  const choices: GrantChoice[] = []
  const ownerOverride = user.id === actorId
  if (permissions.includes('gallery:manage')) choices.push({ operation: 'set_gallery_permission', label: 'Gallery uploads', current: user.galleryAllowed, ownerOverride, help: 'Allows gallery media. This does not waive fees or bypass publication review.' })
  if (permissions.includes('listing:waive')) choices.push({ operation: 'set_free_posting_permission', label: 'Free posting', current: user.freePostingAllowed, ownerOverride, help: 'Applies to future submissions. Existing listing waivers remain separate.' })
  if (permissions.includes('gallery:manage')) choices.push({ operation: 'set_direct_publish_permission', label: 'Direct publishing', current: user.directPublishAllowed, ownerOverride, help: 'Bypasses human approval; valid documents, media and the publication fee or waiver are still required.' })
  return choices
}
