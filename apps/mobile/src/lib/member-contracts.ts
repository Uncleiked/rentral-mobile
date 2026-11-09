import { z } from 'zod'
import { nativeMediaUrl } from './media-url'

export const memberIdSchema = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const handle = z.string().regex(/^[a-z0-9_]{3,24}$/)
export const memberProfileSchema = z.object({ id: memberIdSchema, email: z.string().email(), username: handle.nullable(), bio: z.string().max(280).nullable(),
  avatarUrl: z.string().max(1500).nullable(), accountType: z.string().max(40).nullable(), memberSince: timestamp, platformAvailable: z.boolean().default(false) })
export const publicMemberSchema = z.object({ username: handle, displayName: z.string().min(1).max(200), accountType: z.enum(['individual', 'organization']),
  identityVerified: z.boolean(), memberSince: timestamp, bio: z.string().max(280).nullable(), avatarUrl: z.string().max(1500).nullable(),
  reviewCount: z.number().int().nonnegative(), averageRating: z.number().min(1).max(5).nullable(), listingIds: z.array(memberIdSchema).max(50),
  safetyNotice: z.object({ active: z.boolean(), text: z.string().max(1000).nullable() }),
}).superRefine((member, context) => {
  if ((member.reviewCount === 0) !== (member.averageRating === null)) context.addIssue({ code: 'custom', message: 'Review totals could not be confirmed.' })
})
const reviewSchema = z.object({ id: memberIdSchema, rating: z.number().int().min(1).max(5), comment: z.string().min(10).max(2000), author: z.object({ username: handle.nullable() }), createdAt: timestamp })
export const notificationSchema = z.object({ id: memberIdSchema, kind: z.string().min(1).max(80), title: z.string().min(1).max(200), body: z.string().max(4000), href: z.string().max(1000).nullable(), readAt: timestamp.nullable(), createdAt: timestamp })
export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item).max(50), nextCursor: z.string().max(500).nullable(), limit: z.number().int().min(1).max(50) })
}
export const reviewPageSchema = cursorPageSchema(reviewSchema)
export const notificationPageSchema = cursorPageSchema(notificationSchema)
export const readNotificationSchema = z.object({ id: memberIdSchema, readAt: timestamp })
export const analyticsPrivacySchema = z.object({ allowed: z.boolean(), updatedAt: timestamp.nullable(), collectionEnabled: z.boolean(), retentionDays: z.literal(90) })
export const submittedSchema = z.object({ submitted: z.literal(true) })
export const withdrawnHistorySchema = z.object({ removed: z.literal(true), allowed: z.literal(false) })
export const bookingFeedbackSchema = z.object({ reviewSubmitted: z.boolean(), openReport: z.boolean() })
export const publicListingSchema = z.object({ id: memberIdSchema, title: z.string().max(200), category: z.enum(['house', 'car', 'boat']), location: z.string().max(200),
  price: z.string().max(100), pricePeriod: z.string().max(20), intent: z.string().max(40), posterUrl: z.string().nullable(), videoUrl: z.string().nullable(), useMux: z.boolean(),
  badges: z.array(z.string().max(200)).max(30), saved: z.boolean(), savingAvailable: z.boolean(), holdUntil: timestamp.nullable(),
  host: z.object({ username: handle, avatarUrl: z.string().nullable(), identityVerified: z.boolean() }) })
export const profileListingsSchema = cursorPageSchema(publicListingSchema)
const safetyAppealSchema = z.object({ statement: z.string().min(30).max(4000), status: z.enum(['pending', 'upheld', 'removed']),
  decisionReason: z.string().max(2000).nullable(), decidedAt: timestamp.nullable(), createdAt: timestamp })
export const safetyNoticeSchema = z.object({ id: memberIdSchema, category: z.enum(['misrepresentation', 'unexpected_fees', 'unsafe_conduct', 'other']), reason: z.string().max(2000),
  status: z.enum(['active', 'removed']), createdAt: timestamp, removedAt: timestamp.nullable(), appeal: safetyAppealSchema.nullable() })
export const ownSafetyNoticesSchema = z.object({ enabled: z.boolean(), items: z.array(safetyNoticeSchema).max(100), limit: z.literal(100) })
export type PublicMember = z.infer<typeof publicMemberSchema>
export type MemberProfile = z.infer<typeof memberProfileSchema>
export type MemberReview = z.infer<typeof reviewSchema>
export type MemberNotification = z.infer<typeof notificationSchema>
export type OwnSafetyNotice = z.infer<typeof safetyNoticeSchema>
export type ProfileListing = z.infer<typeof publicListingSchema>
export type CursorPage<T> = { items: T[]; nextCursor: string | null; limit: number }

/** Avatars never introduce third-party requests or private signed-file URLs. */
export function memberAvatarUrl(value: string | null, apiOrigin: string): string | null {
  const resolved = nativeMediaUrl(value, apiOrigin)
  if (!resolved) return null
  try {
    const url = new URL(resolved)
    return url.origin === new URL(apiOrigin).origin && !url.search && !url.hash
      && /^\/api\/v1\/files\/profile-avatars\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(?:jpe?g|png|webp)$/i.test(url.pathname) ? url.toString() : null
  } catch { return null }
}

export type NotificationDestination = { pathname: '/booking/[id]' | '/conversation/[id]' | '/listing/[id]' | '/match/[id]'; params: { id: string } }
  | { pathname: '/profile/[username]'; params: { username: string } }
  | { pathname: '/matching-history'; params: { tab: 'reports' | 'blocks' } }
  | { pathname: '/(tabs)/profile' | '/(tabs)/messages' | '/(tabs)/bookings' | '/(tabs)/saved' | '/my-listings' | '/appeals' | '/notifications' | '/privacy' | '/squat-mates' | '/dashboard' }

export function notificationDestination(value: string | null): NotificationDestination | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\%\u0000-\u001f]/.test(value)) return null
  try {
    const url = new URL(value, 'https://rentral.invalid')
    const booking = /^\/marketplace\/bookings\/([^/]+)$/.exec(url.pathname)
    const listing = /^\/marketplace\/listing\/([^/]+)$/.exec(url.pathname)
    const profile = /^\/marketplace\/profile\/([^/]+)$/.exec(url.pathname)
    const match = /^\/marketplace\/squat-mates\/connections\/([^/]+)$/.exec(url.pathname)
    if (booking && memberIdSchema.safeParse(booking[1]).success) return { pathname: '/booking/[id]', params: { id: booking[1] } }
    if (listing && memberIdSchema.safeParse(listing[1]).success) return { pathname: '/listing/[id]', params: { id: listing[1] } }
    if (profile && handle.safeParse(profile[1]).success) return { pathname: '/profile/[username]', params: { username: profile[1] } }
    if (match && memberIdSchema.safeParse(match[1]).success) return { pathname: '/match/[id]', params: { id: match[1] } }
    if (url.pathname === '/marketplace/squat-mates/reports' || url.pathname === '/marketplace/squat-mates/blocks') return { pathname: '/matching-history', params: { tab: url.pathname.endsWith('/reports') ? 'reports' : 'blocks' } }
    if (url.pathname === '/marketplace/messages') {
      const conversation = url.searchParams.get('id')
      return conversation && memberIdSchema.safeParse(conversation).success ? { pathname: '/conversation/[id]', params: { id: conversation } } : { pathname: '/(tabs)/messages' }
    }
    const destinations = { '/marketplace/profile': '/(tabs)/profile', '/marketplace/bookings': '/(tabs)/bookings', '/marketplace/saved': '/(tabs)/saved',
      '/marketplace/listing': '/my-listings', '/marketplace/appeals': '/appeals', '/marketplace/notifications': '/notifications', '/marketplace/squat-mates': '/squat-mates', '/marketplace/dashboard': '/dashboard' } as const
    const pathname = destinations[url.pathname as keyof typeof destinations]
    return pathname ? { pathname } : null
  } catch { return null }
}
