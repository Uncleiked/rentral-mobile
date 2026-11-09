'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireVerifiedUserId } from '@/lib/action-helpers'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { processListingMedia } from '@/lib/media/processing'

export async function retryListingMedia(listingId: unknown): Promise<{ success: true } | { success: false; error: string }> {
  if (!muxEnabled() || !muxConfigured()) return { success: false, error: 'Video processing is unavailable.' }
  const id = z.string().uuid().safeParse(listingId)
  if (!id.success) return { success: false, error: 'Listing not found.' }
  try {
    const userId = await requireVerifiedUserId()
    if (!userId) return { success: false, error: 'Sign in to retry.' }
    await processListingMedia(id.data, userId)
    revalidatePath('/marketplace/listing')
    return { success: true }
  } catch {
    return { success: false, error: 'Processing could not be started. Please try again later.' }
  }
}
