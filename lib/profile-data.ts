import prisma from '@/lib/db'
import { createClient } from '@/lib/server'
import { listingMediaUrl, listingPhotoUrl } from '@/lib/storage'
import { galleryIsPublic, galleryPhotoPaths, galleryListingSelect, galleryUserSelect } from '@/lib/listings/gallery'
import { requireSessionUserId } from '@/lib/action-helpers'
import { ensureAccountHandle } from '@/lib/accounts/bootstrap'
import { LISTING_STATUS, PUBLIC_LISTING_STATUSES } from '@/lib/listing-status'
import type { User, IndividualProfile, OrganizationProfile } from '@prisma/client'
import { muxEnabled } from '@/lib/media/config'
import { listingMediaStatuses, type MediaSummary } from '@/lib/media/status'
import { accountIsActive, activeAccountWhere } from '@/lib/accounts/availability'

export type ProfileRecord = {
  id: string
  username: string
  displayName: string
  accountType: 'individual' | 'organization'
  kycVerified: boolean
  verificationStatus: string
  memberSince: Date
  bio: string | null
  avatarUrl: string | null
}

// Own-profile-only fields. Never merge these into ProfileRecord — that type
// is also returned for visitor views, and email/DOB/phone/address are PII
// that must not leak to a public profile fetch (see architecture.md's
// "Absolute Privacy" invariant).
export type OwnProfileDetails = ProfileRecord & {
  email: string
  pendingEmail: string | null
  dateOfBirth: string | null
  phoneNumber: string | null
  country: string | null
  address: string | null
}

export type ListingSummary = {
  id: string
  title: string
  price: string
  priceDenomination: string
  posterUrl: string | null
  videoUrl: string | null
  useMux: boolean
  media: MediaSummary | null
  mediaSource?: 'recorded' | 'approved_gallery'
  galleryPhotoUrls?: string[]
  badges: string[]
  status: string
  archivedAt?: string | null
}

const LISTING_STATUS_BADGES: Record<string, string> = {
  [LISTING_STATUS.DRAFT]: 'Draft',
  [LISTING_STATUS.PENDING_VERIFICATION]: 'Pending Verification',
  [LISTING_STATUS.ACTIVE]: 'Active',
}

export type ListingMetadataJson = Record<string, string | number | boolean | null>

export function capitalizeCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

export function deriveListingTitle(category: string, metadata: ListingMetadataJson): string {
  if (typeof metadata.listingTitle === 'string' && metadata.listingTitle.trim()) return metadata.listingTitle.trim()
  if (category === 'house' && metadata.bedrooms !== undefined && metadata.bedrooms !== null && metadata.bedrooms !== '') {
    return `${metadata.bedrooms} Bed House${metadata.sizeSqm ? ` \u2022 ${metadata.sizeSqm} sqm` : ''}`
  }
  if (category === 'car' && metadata.fuelType) return `${metadata.fuelType} Car${metadata.seats ? ` \u2022 ${metadata.seats} Seats` : ''}`
  if (category === 'boat' && metadata.vesselType) return `${metadata.vesselType}`
  return `${capitalizeCategory(category)} Listing`
}

// Shared by getListingsForProfile and getMarketplaceFeed so money formatting
// and the per-category denomination rule can't drift between the two feeds.
export function formatListingPrice(amount: unknown): string {
  return amount ? Number(amount).toLocaleString('en-NG') : '—'
}

export function listingPriceDenomination(category: string, uppercase = false): string {
  const denomination = category === 'house' ? 'year' : 'day'
  return uppercase ? denomination.toUpperCase() : denomination
}

export async function getListingsForProfile(
  listerId: string,
  options?: { includeDrafts?: boolean }
): Promise<ListingSummary[]> {
  // Explicit select: hardware_coordinates must never travel to any client
  // (architecture.md's spatial privacy invariant). Prisma already omits the
  // Unsupported geography column from results; the select is defense in depth.
  const rows = await prisma.listing.findMany({
    where: {
      lister_id: listerId,
      lister: { is: activeAccountWhere },
      // Drafts are private to their owner — only the "Your Listings" hub asks
      // for them; visitor profiles never see them. `in` (not `not: draft`)
      // so the query can use the (listing_status, createdAt) index.
      ...(options?.includeDrafts ? {} : { listing_status: { in: PUBLIC_LISTING_STATUSES } }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      category: true,
      base_rent_amount: true,
      asset_metadata: true,
      poster_path: true,
      video_path: true,
      listing_status: true,
      archived_at: true,
      ...galleryListingSelect,
      lister: { select: galleryUserSelect },
    },
  })

  const mediaByListing = await listingMediaStatuses(rows.map(row => row.id))
  return rows.filter(row => options?.includeDrafts || galleryIsPublic(row)).map((row) => {
    const metadata = (row.asset_metadata ?? {}) as ListingMetadataJson
    const isDraft = row.listing_status === LISTING_STATUS.DRAFT
    const statusBadge = LISTING_STATUS_BADGES[row.listing_status] ?? row.listing_status
    const media = mediaByListing.get(row.id) ?? null
    const useMux = muxEnabled() && !isDraft && Boolean(row.video_path)
    return {
      id: row.id,
      title: deriveListingTitle(row.category, metadata),
      price: formatListingPrice(row.base_rent_amount),
      priceDenomination: typeof metadata.pricePeriod === 'string' && metadata.pricePeriod ? metadata.pricePeriod : listingPriceDenomination(row.category),
      posterUrl: row.poster_path && (!useMux || row.media_source === 'approved_gallery') ? listingMediaUrl(row.id, 'poster') : galleryPhotoPaths(row).length ? listingPhotoUrl(row.id, 0) : null,
      videoUrl: !useMux && row.video_path ? listingMediaUrl(row.id, 'video') : null,
      useMux: useMux && media?.status === 'ready',
      media,
      mediaSource: row.media_source === 'approved_gallery' ? 'approved_gallery' : 'recorded',
      galleryPhotoUrls: galleryPhotoPaths(row).map((_path, index) => listingPhotoUrl(row.id, index)),
      badges: [statusBadge, capitalizeCategory(row.category), ...(row.media_source === 'approved_gallery' ? ['Admin-approved gallery'] : [])],
      status: row.listing_status,
      ...(options?.includeDrafts ? { archivedAt: row.archived_at?.toISOString() ?? null } : {}),
    }
  })
}

type UserWithProfiles = User & {
  individualProfile: IndividualProfile | null
  organizationProfile: OrganizationProfile | null
}

function toProfileRecord(dbUser: UserWithProfiles): ProfileRecord | null {
  // Public profiles need a handle; own-profile reads fill missing handles
  // without requiring a profile wizard or changing identity decisions.
  if (!dbUser.username) return null

  const isOrganization = dbUser.account_type === 'organization'
  const displayName = isOrganization
    ? dbUser.organizationProfile?.organization_name ?? dbUser.username
    : dbUser.individualProfile?.full_name ?? dbUser.username

  return {
    id: dbUser.id,
    username: dbUser.username,
    displayName,
    accountType: isOrganization ? 'organization' : 'individual',
    kycVerified: dbUser.kyc_verified,
    verificationStatus: dbUser.verification_status,
    memberSince: dbUser.createdAt,
    bio: dbUser.bio,
    avatarUrl: dbUser.avatar_url,
  }
}

export async function getOwnProfile(): Promise<ProfileRecord | null> {
  const userId = await requireSessionUserId()
  if (!userId) return null
  if (!await ensureAccountHandle(userId)) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: userId, ...activeAccountWhere },
    include: { individualProfile: true, organizationProfile: true },
  })

  if (!dbUser || !accountIsActive(dbUser)) return null

  return toProfileRecord(dbUser)
}

export async function getOwnProfileDetails(): Promise<OwnProfileDetails | null> {
  const client = await createClient()
  const {
    data: { user }, error,
  } = await client.auth.getUser()
  if (error || !user || user.is_anonymous) return null
  if (!await ensureAccountHandle(user.id)) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id, ...activeAccountWhere },
    include: { individualProfile: true, organizationProfile: true },
  })

  if (!dbUser || !accountIsActive(dbUser)) return null

  const base = toProfileRecord(dbUser)
  if (!base) return null

  return {
    ...base,
    email: dbUser.email,
    pendingEmail: null,
    dateOfBirth: dbUser.individualProfile?.date_of_birth ?? null,
    phoneNumber: dbUser.individualProfile?.phone_number ?? dbUser.organizationProfile?.phone_number ?? null,
    country: dbUser.individualProfile?.country ?? dbUser.organizationProfile?.country ?? null,
    address: dbUser.individualProfile?.address ?? dbUser.organizationProfile?.address ?? null,
  }
}

export async function getProfileByUsername(username: string): Promise<ProfileRecord | null> {
  const dbUser = await prisma.user.findUnique({
    where: { username, ...activeAccountWhere },
    include: { individualProfile: true, organizationProfile: true },
  })

  if (!dbUser || !accountIsActive(dbUser)) return null

  return toProfileRecord(dbUser)
}
