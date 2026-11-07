'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { platformEnabled, PLATFORM_UNAVAILABLE, type ActionResult } from '@/lib/platform'
import { requireAdminId } from '@/lib/operations/access'
import { moderateListing, resolveDispute } from '@/lib/operations/service'
import { verifyListingAddress } from '@/lib/listings/spatial'
import { analyzeListingDocument } from '@/lib/documents/analyze'
import prisma from '@/lib/db'

const adminInput = z.object({ id: z.uuid(), operation: z.enum(['approve_document', 'reject_document', 'publish', 'suspend', 'resolve_dispute', 'check_address', 'analyze_document']), reason: z.string().trim().min(15).max(2000) }).strict()

export async function adminOperationAction(input: unknown): Promise<ActionResult> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const actor = await requireAdminId()
    if (!actor) return { success: false, error: 'Staff access required.' }
    const data = adminInput.safeParse(input)
    if (!data.success) return { success: false, error: 'Choose an action and provide a reason of at least 15 characters.' }
    const { id, operation, reason } = data.data
    if (operation === 'resolve_dispute') await resolveDispute(actor, id, reason)
    else if (operation === 'check_address' || operation === 'analyze_document') {
      const listing = await prisma.listing.findUnique({ where: { id }, select: { lister_id: true, listing_status: true } })
      if (!listing || listing.lister_id === actor || listing.listing_status === 'draft') return { success: false, error: 'Staff can only review another member’s submitted listing.' }
      // Provider work deliberately stays outside transactions; record privileged attempts.
      await prisma.adminAudit.create({ data: { actor_id: actor, action: operation, target_type: 'listing', target_id: id, reason } })
      if (operation === 'check_address') {
        const result = await verifyListingAddress(id)
        if (result !== 'matched') return { success: false, error: result === 'mismatch' ? 'The typed address does not match the recording location.' : 'The address could not be matched confidently. Check the address and geocoding configuration.' }
      } else await analyzeListingDocument(id)
    } else await moderateListing(actor, id, operation, reason)
    revalidatePath('/marketplace/admin'); revalidatePath('/marketplace'); revalidatePath('/marketplace/listing')
    revalidatePath(`/marketplace/listing/${id}`)
    return { success: true, data: undefined }
  } catch (error) {
    const known = error instanceof Error && error.message.startsWith('Publication requires') ? error.message : 'Action could not be completed. Check the review requirements and service configuration.'
    return { success: false, error: known }
  }
}
