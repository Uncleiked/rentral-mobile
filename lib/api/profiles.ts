import { z } from 'zod'
import prisma from '@/lib/db'
import { ApiError } from './http'
import { archiveBoundary, nextArchiveCursor, type ArchiveQuery } from './archive'
import { hasActiveSafetyNotice } from '@/lib/trust/safety'
import { PUBLIC_SAFETY_NOTICE } from '@/lib/trust/safety-policy'
import { getPublicHostListings } from '@/lib/discovery'
import { publicListing } from './projection'
import { publicAvatarReference } from '@/lib/accounts/avatar-reference'
import { activeAccountWhere } from '@/lib/accounts/availability'

export const profileHandleSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/)
const publicProfileSchema = z.object({
  username: profileHandleSchema, displayName: z.string().min(1).max(200), accountType: z.enum(['individual', 'organization']),
  identityVerified: z.boolean(), memberSince: z.string().datetime({ offset: true }), bio: z.string().max(280).nullable(), avatarUrl: z.string().max(1000).nullable(),
  safetyNotice: z.object({ active: z.boolean(), text: z.literal(PUBLIC_SAFETY_NOTICE).nullable() }).strict(),
  reviewCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), averageRating: z.number().min(1).max(5).nullable(), listingIds: z.array(z.uuid()).max(50),
}).strict()
const reviewPageSchema = z.object({ items: z.array(z.object({ id: z.uuid(), rating: z.number().int().min(1).max(5), comment: z.string().min(10).max(2000),
  author: z.object({ username: profileHandleSchema.nullable() }).strict(), createdAt: z.string().datetime({ offset: true }) }).strict()).max(50),
  nextCursor: z.string().nullable(), limit: z.number().int().min(1).max(50),
}).strict()

/** Legacy external/private avatar values never become public file capabilities. */
export function publicProfileAvatar(value: string | null, userId: string): string | null {
  return publicAvatarReference(value, userId)
}
export async function profileForApi(username: string) {
  const user = await prisma.user.findUnique({ where: { username, ...activeAccountWhere }, select: {
    id: true, username: true, account_type: true, kyc_verified: true, createdAt: true, bio: true, avatar_url: true,
    individualProfile: { select: { full_name: true } }, organizationProfile: { select: { organization_name: true } },
  } })
  if (!user?.username) throw new ApiError(404, 'NOT_FOUND', 'This profile is unavailable.')
  const [ratings, listings, safety] = await Promise.all([
    prisma.review.aggregate({ where: { subject_id: user.id, booking: { status: 'completed' } }, _avg: { rating: true }, _count: { _all: true } }),
    prisma.listing.findMany({ where: { lister_id: user.id, listing_status: 'active' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, select: { id: true } }),
    hasActiveSafetyNotice(user.id),
  ])
  const organization = user.account_type === 'organization'
  const result = publicProfileSchema.safeParse({ username: user.username,
    displayName: (organization ? user.organizationProfile?.organization_name : user.individualProfile?.full_name) || user.username,
    accountType: organization ? 'organization' : 'individual', identityVerified: user.kyc_verified,
    memberSince: user.createdAt.toISOString(), bio: user.bio, avatarUrl: publicProfileAvatar(user.avatar_url, user.id),
    safetyNotice: { active: safety, text: safety ? PUBLIC_SAFETY_NOTICE : null },
    reviewCount: ratings._count._all, averageRating: ratings._avg.rating, listingIds: listings.map(listing => listing.id),
  })
  if (!result.success) throw new ApiError(503, 'PROFILE_UNAVAILABLE', 'This profile could not be verified. Please refresh.')
  return result.data
}
export async function profileReviewsForApi(username: string, query: ArchiveQuery) {
  const user = await prisma.user.findUnique({ where: { username, ...activeAccountWhere }, select: { id: true } })
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'This profile is unavailable.')
  const rows = await prisma.review.findMany({ where: { subject_id: user.id, booking: { status: 'completed' }, ...archiveBoundary(query.cursor) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
    select: { id: true, rating: true, comment: true, createdAt: true, author: { select: { username: true } } } })
  const result = reviewPageSchema.safeParse({ items: rows.slice(0, query.limit).map(row => ({ id: row.id, rating: row.rating,
    comment: row.comment, author: { username: row.author.username }, createdAt: row.createdAt.toISOString() })),
    nextCursor: nextArchiveCursor(rows, query.limit), limit: query.limit })
  if (!result.success) throw new ApiError(503, 'REVIEWS_UNAVAILABLE', 'These reviews could not be verified. Please refresh.')
  return result.data
}

export async function profileListingsForApi(username: string, viewerId: string, query: ArchiveQuery) {
  const user = await prisma.user.findUnique({ where: { username, ...activeAccountWhere }, select: { id: true } })
  if (!user) throw new ApiError(404, 'NOT_FOUND', 'This profile is unavailable.')
  const page = await getPublicHostListings(user.id, viewerId, query.cursor ? { id: query.cursor.id, createdAt: query.cursor.createdAt.toISOString() } : null, query.limit)
  return { items: page.listings.map(listing => ({ ...publicListing(listing), host: { username: listing.username,
    avatarUrl: publicProfileAvatar(listing.avatarUrl, user.id), identityVerified: listing.isVerified } })),
    nextCursor: page.nextCursor ? `${page.nextCursor.createdAt}~${page.nextCursor.id}` : null, limit: query.limit }
}
