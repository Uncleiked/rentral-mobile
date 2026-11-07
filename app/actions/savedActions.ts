'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import prisma from '@/lib/db'
import { requireUserId } from '@/lib/action-helpers'
import { platformEnabled, PLATFORM_UNAVAILABLE, type ActionResult } from '@/lib/platform'

const saveSchema = z.object({ listingId: z.uuid(), saved: z.boolean() })

export async function setListingSaved(input: unknown): Promise<ActionResult<{ saved: boolean }>> {
  try {
    if (!platformEnabled()) return { success: false, error: PLATFORM_UNAVAILABLE }
    const parsed = saveSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: 'Choose a valid listing.' }
    const userId = await requireUserId()
    if (!userId) return { success: false, error: 'Please sign in to save a listing.' }
    const { listingId, saved } = parsed.data
    if (saved) {
      const listing = await prisma.listing.findFirst({ where: { id: listingId, listing_status: 'active' }, select: { id: true } })
      if (!listing) return { success: false, error: 'This listing is no longer available.' }
      await prisma.savedListing.upsert({ where: { user_id_listing_id: { user_id: userId, listing_id: listingId } }, create: { user_id: userId, listing_id: listingId }, update: {} })
    } else {
      await prisma.savedListing.deleteMany({ where: { user_id: userId, listing_id: listingId } })
    }
    revalidatePath('/marketplace/saved')
    revalidatePath('/marketplace')
    revalidatePath(`/marketplace/listing/${listingId}`)
    return { success: true, data: { saved } }
  } catch {
    console.error('[actions/savedActions] Could not update saved listing')
    return { success: false, error: 'We could not update your saved listings. Please try again.' }
  }
}
