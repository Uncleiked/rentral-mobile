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
