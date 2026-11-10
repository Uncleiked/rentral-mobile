'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { platformEnabled, PLATFORM_UNAVAILABLE, type ActionResult } from '@/lib/platform'
import { requireStaffId } from '@/lib/operations/access'
import { assertStaffPermission } from '@/lib/auth/roles'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { moderateListing, resolveDispute } from '@/lib/operations/service'
import { verifyListingAddress } from '@/lib/listings/spatial'

const adminInput = z.object({ id: z.uuid(), operation: z.enum(['approve_document', 'reject_document', 'publish', 'suspend', 'resolve_dispute', 'check_address']),
  reason: z.string().trim().min(15).max(2000), resolution: z.enum(['resume', 'complete', 'cancel']).optional(),
}).strict().superRefine((input, context) => {
  if (input.operation === 'resolve_dispute' && (!input.resolution || input.reason.length < 30)) context.addIssue({ code: 'custom', message: 'Choose an explicit booking outcome and detailed review reason.' })
  if (input.operation !== 'resolve_dispute' && input.resolution) context.addIssue({ code: 'custom', message: 'A booking outcome only applies to reports.' })
})

export async function adminOperationAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const data = adminInput.safeParse(input)
    if (!data.success) return { success: false, error: 'Choose an action and provide a reason of at least 15 characters.' }
    const { id, operation, reason, resolution } = data.data
    const actor = await requireStaffId(operation === 'resolve_dispute' ? 'dispute:review' : 'listing:review')
    if (!actor) return { success: false, error: 'Staff access required.' }
    if (operation === 'resolve_dispute') await resolveDispute(actor, id, reason, resolution)
    else if (operation === 'check_address') {
      await withTransaction(async tx => {
        await lockRecord(tx, 'listing', id)
        await assertStaffPermission(tx, actor, 'listing:review')
        const listing = await tx.listing.findUnique({ where: { id }, select: { lister_id: true, listing_status: true } })
        if (!listing || listing.lister_id === actor || listing.listing_status === 'draft') throw new Error('Choose another member’s submitted listing.')
        // Audit the authorized attempt before provider work outside this transaction.
        await tx.adminAudit.create({ data: { actor_id: actor, action: operation, target_type: 'listing', target_id: id, reason } })
      })
      const result = await verifyListingAddress(id)
      if (result !== 'matched') return { success: false, error: result === 'mismatch' ? 'The typed address does not match the recording location.' : 'The address could not be matched confidently. Check the address and geocoding configuration.' }
    } else await moderateListing(actor, id, operation, reason)
    revalidatePath('/marketplace/admin'); revalidatePath('/marketplace'); revalidatePath('/marketplace/listing')
    revalidatePath(`/marketplace/listing/${id}`)
    return { success: true, data: undefined }
  } catch (error) {
    const known = error instanceof Error && error.message.startsWith('Publication requires') ? error.message : 'Action could not be completed. Check the review requirements and service configuration.'
    return { success: false, error: known }
  }
}
