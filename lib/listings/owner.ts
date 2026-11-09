import prisma from '@/lib/db'
import { deriveListingTitle, formatListingPrice, listingPriceDenomination, type ListingMetadataJson } from '@/lib/profile-data'

export const OWNER_LISTING_LIMIT = 100

/** Owner-only inventory. Storage paths, exact location and documents never leave this projection. */
export async function getOwnListingSummaries(userId: string) {
  const rows = await prisma.listing.findMany({
    where: { lister_id: userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: OWNER_LISTING_LIMIT,
    select: {
      id: true, category: true, listing_status: true, base_rent_amount: true,
      asset_metadata: true, video_path: true, document_path: true, createdAt: true,
    },
  })
  return rows.map(row => {
    const metadata = (row.asset_metadata && typeof row.asset_metadata === 'object' && !Array.isArray(row.asset_metadata)
      ? row.asset_metadata : {}) as ListingMetadataJson
    const period = metadata.pricePeriod
    return {
      id: row.id,
      title: typeof metadata.listingTitle === 'string' && metadata.listingTitle.trim()
        ? metadata.listingTitle.trim() : deriveListingTitle(row.category, metadata),
      category: row.category, status: row.listing_status,
      price: row.base_rent_amount === null ? '' : formatListingPrice(row.base_rent_amount),
      pricePeriod: typeof period === 'string' && ['year', 'month', 'day', 'trip'].includes(period)
        ? period : listingPriceDenomination(row.category),
      createdAt: row.createdAt.toISOString(),
      hasVideo: Boolean(row.video_path), hasDocument: Boolean(row.document_path),
    }
  })
}
