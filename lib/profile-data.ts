import prisma from '@/lib/db'
import { createClient } from '@/lib/server'
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
  posterUrl: string
  badges: string[]
}

// No Listing model exists yet (build-plan.md Phase 1 items 06-11: capture UI,
// spatial forms, media ingestion, listing editor). Returns real empty state
// instead of mock inventory — swap this for a Prisma query once listings ship.
export function getListingsForProfile(): ListingSummary[] {
  return []
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

  return toProfileRecord(dbUser)
}

export async function getOwnProfileDetails(): Promise<OwnProfileDetails | null> {
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
