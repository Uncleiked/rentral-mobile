import prisma from '@/lib/db'
import { createClient } from '@/lib/server'
import { listingsMediaPublicUrl } from '@/lib/storage'
import { requireUserId } from '@/lib/action-helpers'
import { LISTING_STATUS, PUBLIC_LISTING_STATUSES } from '@/lib/listing-status'
import type { User, IndividualProfile, OrganizationProfile } from '@prisma/client'

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

export type TrustSummary = {
  // Computed metrics with no backing system yet (reputation scoring,
  // messaging, handshake check-ins). null means "not available", not zero —
  // render as a placeholder, never fabricate a number.
  trustScore: string | null
  topPercentLabel: string | null
  avgResponseMinutes: number | null
  showUpRatePercent: number | null
  // Real counts. Legitimately zero for every user until listings, handshakes,
  // and bookings exist — same as a brand-new account showing "0 followers".
  ghostListings: number
  listingsCount: number
  followersCount: number
  handshakesCount: number
  rentalsCompleted: number
  onTimePayments: number
  verifiedSinceYear: number
}

export type ListingSummary = {
  id: string
  title: string
  price: string
  priceDenomination: string
  posterUrl: string | null
  videoUrl: string | null
  badges: string[]
  status: string
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
  if (category === 'house' && metadata.bedrooms) return `${metadata.bedrooms} Bed House • ${metadata.sizeSqm} sqm`
  if (category === 'car' && metadata.fuelType) return `${metadata.fuelType} Car • ${metadata.seats} Seats`
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
      // Drafts are private to their owner — only the "Your Listings" hub asks
      // for them; visitor profiles never see them. `in` (not `not: draft`)
      // so the query can use the (listing_status, createdAt) index.
      ...(options?.includeDrafts ? {} : { listing_status: { in: PUBLIC_LISTING_STATUSES } }),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      category: true,
      base_rent_amount: true,
      asset_metadata: true,
      poster_path: true,
      video_path: true,
      listing_status: true,
    },
  })

  return rows.map((row) => {
    const metadata = (row.asset_metadata ?? {}) as ListingMetadataJson
    const isDraft = row.listing_status === LISTING_STATUS.DRAFT
    const statusBadge = LISTING_STATUS_BADGES[row.listing_status] ?? row.listing_status
    return {
      id: row.id,
      title: isDraft
        ? `${capitalizeCategory(row.category)} — Draft`
        : deriveListingTitle(row.category, metadata),
      price: formatListingPrice(row.base_rent_amount),
      priceDenomination: listingPriceDenomination(row.category),
      posterUrl: listingsMediaPublicUrl(row.poster_path),
      videoUrl: listingsMediaPublicUrl(row.video_path),
      badges: [statusBadge, capitalizeCategory(row.category)],
      status: row.listing_status,
    }
  })
}

export function getTrustSummary(profile: ProfileRecord): TrustSummary {
  return {
    trustScore: null,
    topPercentLabel: null,
    avgResponseMinutes: null,
    showUpRatePercent: null,
    ghostListings: 0,
    listingsCount: 0,
    followersCount: 0,
    handshakesCount: 0,
    rentalsCompleted: 0,
    onTimePayments: 0,
    verifiedSinceYear: profile.memberSince.getFullYear(),
  }
}

type UserWithProfiles = User & {
  individualProfile: IndividualProfile | null
  organizationProfile: OrganizationProfile | null
}

function toProfileRecord(dbUser: UserWithProfiles): ProfileRecord | null {
  // A profile isn't publicly resolvable until onboarding assigns a username.
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
  const userId = await requireUserId()
  if (!userId) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { individualProfile: true, organizationProfile: true },
  })

  if (!dbUser) return null

  return toProfileRecord(dbUser)
}

export async function getOwnProfileDetails(): Promise<OwnProfileDetails | null> {
  // Needs the full Supabase user (for pendingEmail), not just the id, so this
  // one keeps its own auth call rather than requireUserId() + a second round-trip.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { individualProfile: true, organizationProfile: true },
  })

  if (!dbUser) return null

  const base = toProfileRecord(dbUser)
  if (!base) return null

  return {
    ...base,
    email: dbUser.email,
    pendingEmail: user.new_email ?? null,
    dateOfBirth: dbUser.individualProfile?.date_of_birth ?? null,
    phoneNumber: dbUser.individualProfile?.phone_number ?? dbUser.organizationProfile?.phone_number ?? null,
    country: dbUser.individualProfile?.country ?? dbUser.organizationProfile?.country ?? null,
    address: dbUser.individualProfile?.address ?? dbUser.organizationProfile?.address ?? null,
  }
}

export async function getProfileByUsername(username: string): Promise<ProfileRecord | null> {
  const dbUser = await prisma.user.findUnique({
    where: { username },
    include: { individualProfile: true, organizationProfile: true },
  })

  if (!dbUser) return null

  return toProfileRecord(dbUser)
}
