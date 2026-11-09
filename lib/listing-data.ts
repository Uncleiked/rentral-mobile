import prisma from '@/lib/db'
import { muxEnabled } from '@/lib/media/config'
import { listingMediaStatuses } from '@/lib/media/status'
import { listingMediaUrl, originalNameFromPath } from '@/lib/storage'
import { requireUserId } from '@/lib/action-helpers'
import { LISTING_STATUS, PUBLIC_LISTING_STATUSES } from '@/lib/listing-status'
import {
  capitalizeCategory,
  deriveListingTitle,
  formatListingPrice,
  listingPriceDenomination,
  type ListingMetadataJson,
} from '@/lib/profile-data'
import {
  DRAFT_WIZARD_STEPS,
  LISTING_CATEGORIES,
  type DraftPayload,
  type ListingCategory,
} from '@/store/useRentralStore'

// Private location is stored separately. Resume only selects the relation's id,
// so the coordinates cannot enter the serialized draft accidentally.
export async function getDraftForOwner(draftId: string): Promise<DraftPayload | null> {
  const userId = await requireUserId()
  if (!userId) return null

  const row = await prisma.listing.findFirst({ where: { id: draftId, lister_id: userId, listing_status: LISTING_STATUS.DRAFT }, select: {
    id: true, category: true, text_address: true, base_rent_amount: true, asset_metadata: true,
    wizard_step: true, video_path: true, poster_path: true, document_path: true,
    privateLocation: { select: { id: true } },
  } })
  if (!row || !LISTING_CATEGORIES.includes(row.category as ListingCategory)) return null

  const wizardStep = (DRAFT_WIZARD_STEPS as readonly string[]).includes(row.wizard_step ?? '')
    ? (row.wizard_step as DraftPayload['wizardStep'])
    : null

  return {
    id: row.id,
    category: row.category as ListingCategory,
    address: row.text_address ?? '',
    basePrice: row.base_rent_amount ? String(Number(row.base_rent_amount)) : '',
    metadata: (row.asset_metadata ?? null) as Record<string, unknown> | null,
    wizardStep,
    videoPath: row.video_path,
    posterPath: row.poster_path,
    documentPath: row.document_path,
    documentName: originalNameFromPath(row.document_path),
    hasCoords: Boolean(row.privateLocation),
  }
}

export type FeedListing = {
  id: string
  title: string
  price: string
  priceDenomination: string
  category: 'House' | 'Car' | 'Boat'
  videoUrl: string
  useMux: boolean
  posterUrl: string | null
  badges: string[]
  username: string
  avatarUrl: string | null
  isVerified: boolean
  trustScore: string | null
}

function feedBadges(category: string, metadata: ListingMetadataJson, status: string): string[] {
  const badges: string[] = []
  if (status === LISTING_STATUS.PENDING_VERIFICATION) badges.push('Pending Verification')
  if (category === 'house') {
    if (metadata.bedrooms) badges.push(`${metadata.bedrooms} Beds`)
    if (metadata.bathrooms) badges.push(`${metadata.bathrooms} Baths`)
  } else if (category === 'car') {
    if (metadata.transmission) badges.push(capitalizeCategory(String(metadata.transmission)))
    if (metadata.seats) badges.push(`${metadata.seats} Seats`)
  } else if (category === 'boat') {
    if (metadata.capacityPersons) badges.push(`${metadata.capacityPersons} Persons`)
    if (metadata.hasCaptain) badges.push('Captain Included')
  }
  return badges
}

export async function getMarketplaceFeed(): Promise<FeedListing[]> {
  const rows = await prisma.listing.findMany({
    // `in` (not `not: draft`) so this hot-path query can use the
    // (listing_status, createdAt) index instead of a full scan + sort.
    where: { listing_status: { in: PUBLIC_LISTING_STATUSES } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      category: true,
      base_rent_amount: true,
      asset_metadata: true,
      video_path: true,
      poster_path: true,
      listing_status: true,
      lister: { select: { username: true, avatar_url: true, kyc_verified: true } },
    },
  })

  const useMux = muxEnabled()
  const media = await listingMediaStatuses(rows.map(row => row.id))
  return rows.flatMap((row) => {
    // Posted rows need usable media and a public handle. Account helpers fill
    // missing handles before listing mutations; no identity wizard is required.
    const videoUrl = useMux ? '' : row.video_path ? listingMediaUrl(row.id, 'video') : null
    if ((!useMux && !videoUrl) || !row.lister.username || (useMux && media.get(row.id)?.status !== 'ready')) return []

    const metadata = (row.asset_metadata ?? {}) as ListingMetadataJson
    return [
      {
        id: row.id,
        title: deriveListingTitle(row.category, metadata),
        price: formatListingPrice(row.base_rent_amount),
        priceDenomination: listingPriceDenomination(row.category, true),
        category: capitalizeCategory(row.category) as FeedListing['category'],
        videoUrl: videoUrl ?? '',
        useMux,
        posterUrl: !useMux && row.poster_path ? listingMediaUrl(row.id, 'poster') : null,
        badges: feedBadges(row.category, metadata, row.listing_status),
        username: row.lister.username,
        avatarUrl: row.lister.avatar_url,
        isVerified: row.lister.kyc_verified,
        // No reputation system yet — render nothing rather than a fake score.
        trustScore: null,
      },
    ]
  })
}
