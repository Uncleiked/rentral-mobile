import prisma from '@/lib/db'
import { ApiError } from './http'
import { withTransaction } from '@/lib/database/transactions'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { assertGalleryListingCurrent } from '@/lib/listings/gallery'

/** Idempotent writes scoped to the authenticated actor, including removal of unavailable saves. */
export async function updateSavedListing(userId: string, listingId: string, saved: boolean): Promise<{ saved: boolean }> {
  if (saved) {
    await withTransaction(async tx => {
      const listing = await tx.listing.findFirst({ where: { id: listingId, listing_status: 'active' }, select: { id: true, lister_id: true, media_source: true, gallery_permission_revision: true } })
      if (!listing) throw new ApiError(404, 'NOT_FOUND', 'This listing is no longer available.')
      await assertActiveAccounts(tx, [userId, listing.lister_id])
      await assertGalleryListingCurrent(tx, listing)
      await tx.savedListing.upsert({ where: { user_id_listing_id: { user_id: userId, listing_id: listingId } },
        create: { user_id: userId, listing_id: listingId }, update: {} })
    })
  } else {
    await prisma.savedListing.deleteMany({ where: { user_id: userId, listing_id: listingId } })
  }
  return { saved }
}
