import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), notifications: vi.fn(), mark: vi.fn(), notification: vi.fn(), user: vi.fn(),
  ratings: vi.fn(), listings: vi.fn(), reviews: vi.fn(), participant: vi.fn(), submitReview: vi.fn(), openReport: vi.fn(), revalidate: vi.fn(),
  safety: vi.fn(), ownSafety: vi.fn(), safetyEnabled: vi.fn(), appeal: vi.fn(), hostListings: vi.fn(), feedbackReview: vi.fn(), feedbackReport: vi.fn(), TrustError: class extends Error {} }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/db', () => ({ default: { notification: { findMany: mocks.notifications, updateMany: mocks.mark, findFirst: mocks.notification },
  user: { findUnique: mocks.user }, review: { aggregate: mocks.ratings, findMany: mocks.reviews, findFirst: mocks.feedbackReview },
  dispute: { findFirst: mocks.feedbackReport }, listing: { findMany: mocks.listings } } }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/bookings/service', () => ({ getBookingForParticipant: mocks.participant }))
vi.mock('@/lib/trust/service', () => ({ submitBookingReview: mocks.submitReview, openBookingReport: mocks.openReport, TrustError: mocks.TrustError }))
vi.mock('@/lib/trust/safety', () => ({ hasActiveSafetyNotice: mocks.safety, getOwnSafetyNotices: mocks.ownSafety, safetyEnabled: mocks.safetyEnabled, appealSafetyNotice: mocks.appeal }))
vi.mock('@/lib/discovery', () => ({ getPublicHostListings: mocks.hostListings }))
import { ApiError } from '@/lib/api/http'
import { GET as notifications } from '@/app/api/v1/notifications/route'
import { PATCH as markRead } from '@/app/api/v1/notifications/[id]/read/route'
import { GET as profile } from '@/app/api/v1/profiles/[username]/route'
import { GET as reviews } from '@/app/api/v1/profiles/[username]/reviews/route'
import { POST as review } from '@/app/api/v1/bookings/[id]/review/route'
import { POST as report } from '@/app/api/v1/bookings/[id]/reports/route'
import { GET as hostListings } from '@/app/api/v1/profiles/[username]/listings/route'
import { GET as ownSafety } from '@/app/api/v1/safety/notices/route'
import { POST as appeal } from '@/app/api/v1/safety/notices/[id]/appeal/route'
import { GET as feedback } from '@/app/api/v1/bookings/[id]/feedback/route'
import { notificationHref } from '@/lib/api/notifications'

const userId = '55bfc098-ff33-4fdd-b7ae-68d810a74050'
const otherId = '52db23e2-fb48-4cf7-9dfc-06e3c96c301f'
const id = 'c7af3d50-a016-475d-8e51-23fd04989436'
const nextId = '2ca8c61b-ffac-4200-bcba-a7387d0324ac'
const at = new Date('2030-01-01T10:00:00.000Z')
const idContext = { params: Promise.resolve({ id }) }, profileContext = { params: Promise.resolve({ username: 'host' }) }
function request(path: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost:3000/api/v1${path}`, { method,
    headers: { authorization: 'Bearer test-session', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.identity.mockResolvedValue({ userId, mode: 'bearer' })
  mocks.notifications.mockResolvedValue([{ id, kind: 'booking_requested', title: 'Booking request', body: 'Review the dates.', href: `/marketplace/bookings/${id}`, read_at: null, createdAt: at }])
  mocks.mark.mockResolvedValue({ count: 1 }); mocks.notification.mockResolvedValue({ id, read_at: at })
  mocks.user.mockResolvedValue({ id: otherId, username: 'host', account_type: 'individual', kyc_verified: false,
    createdAt: at, bio: 'Hello', avatar_url: `/api/v1/files/profile-avatars/${otherId}/avatar.png`, individualProfile: { full_name: 'Host Name' }, organizationProfile: null })
  mocks.ratings.mockResolvedValue({ _count: { _all: 0 }, _avg: { rating: null } }); mocks.listings.mockResolvedValue([{ id }])
  mocks.reviews.mockResolvedValue([{ id, rating: 5, comment: 'A helpful and reliable host.', createdAt: at, author: { username: 'member' } }])
  mocks.participant.mockResolvedValue({ id, seeker_id: userId, lister_id: otherId })
  mocks.submitReview.mockResolvedValue(undefined); mocks.openReport.mockResolvedValue(undefined)
  mocks.safety.mockResolvedValue(false); mocks.safetyEnabled.mockReturnValue(true)
  mocks.ownSafety.mockResolvedValue([{ id, category: 'misrepresentation', private_reason: 'A reviewed private reason only for the affected member.', status: 'active', createdAt: at, removed_at: null, appeal: null }])
  mocks.appeal.mockResolvedValue(undefined); mocks.hostListings.mockResolvedValue({ listings: [], nextCursor: null })
  mocks.feedbackReview.mockResolvedValue({ id }); mocks.feedbackReport.mockResolvedValue(null)
})

it('requires authentication before any member projection or trust mutation', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  const responses = await Promise.all([notifications(request('/notifications')), markRead(request(`/notifications/${id}/read`, 'PATCH'), idContext),
    profile(request('/profiles/host'), profileContext), reviews(request('/profiles/host/reviews'), profileContext),
    review(request(`/bookings/${id}/review`, 'POST', { rating: 5, comment: 'A completed review.' }), idContext),
    report(request(`/bookings/${id}/reports`, 'POST', { reason: 'A report with sufficient explanation.' }), idContext)])
  for (const response of responses) expect(response.status).toBe(401)
  for (const operation of [mocks.notifications, mocks.mark, mocks.user, mocks.submitReview, mocks.openReport]) expect(operation).not.toHaveBeenCalled()
})

it('pages only this actor notifications with deterministic date/id cursors and an allowlisted payload', async () => {
  mocks.notifications.mockResolvedValue([{ id, kind: 'booking_requested', title: 'Request', body: 'Check dates', href: '/marketplace/bookings', read_at: null, createdAt: at },
    { id: nextId, kind: 'message', title: 'Message', body: 'Check inbox', href: null, read_at: at, createdAt: at }])
  const response = await notifications(request('/notifications?limit=1'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, data: { items: [{ id, kind: 'booking_requested', title: 'Request', body: 'Check dates', href: '/marketplace/bookings', readAt: null, createdAt: at.toISOString() }], nextCursor: `${at.toISOString()}~${id}`, limit: 1 } })
  expect(mocks.notifications).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { user_id: userId }, take: 2, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }))
  await notifications(request(`/notifications?cursor=${encodeURIComponent(`${at.toISOString()}~${id}`)}&limit=20`))
  expect(mocks.notifications).toHaveBeenLastCalledWith(expect.objectContaining({ where: { user_id: userId,
    OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }] } }))
})

it.each(['?limit=51', '?limit=1&limit=2', '?cursor=invalid', `?userId=${otherId}`])('rejects malformed/oversized/spoofed notification queries %s', async query => {
  expect((await notifications(request(`/notifications${query}`))).status).toBe(400)
  expect(mocks.notifications).not.toHaveBeenCalled()
})

it.each(['https://evil.example', '//evil.example', '/api/v1/files/compliance-docs/private', '/marketplace/../../private', '/marketplace\\evil'])('does not expose an unsafe notification destination: %s', href => {
  expect(notificationHref(href)).toBeNull()
})

it('marks only an own notification and includes missing Mongo optional fields in its one-time CAS', async () => {
  const response = await markRead(request(`/notifications/${id}/read`, 'PATCH'), idContext)
  expect(await response.json()).toEqual({ success: true, data: { id, readAt: at.toISOString() } })
  expect(mocks.mark).toHaveBeenCalledExactlyOnceWith({ where: { id, user_id: userId, OR: [{ read_at: null }, { read_at: { isSet: false } }] }, data: { read_at: expect.any(Date) } })
  expect(mocks.notification).toHaveBeenCalledWith({ where: { id, user_id: userId }, select: { id: true, read_at: true } })
  expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { platform: true, mutation: true, verified: true })
})

it('hides foreign notifications and rejects actor/content fields before marking', async () => {
  mocks.notification.mockResolvedValue(null)
  expect((await markRead(request(`/notifications/${id}/read`, 'PATCH'), idContext)).status).toBe(404)
  expect((await markRead(request(`/notifications/${id}/read`, 'PATCH', { userId: otherId }), idContext)).status).toBe(400)
  expect(mocks.mark).toHaveBeenCalledTimes(1)
})

it('returns a strictly public host projection without email, private identity evidence or draft listings', async () => {
  const privateDigest = 'd'.repeat(64), privateObjectId = 'c'.repeat(64)
  mocks.listings.mockResolvedValueOnce([{ id, media_source: 'recorded', gallery_permission_revision: 9,
    gallery_media: { photos: [{ path: 'PRIVATE_GALLERY_PATH', objectId: privateObjectId, digest: privateDigest }], video: null },
    lister: { gallery_upload_allowed: true, gallery_permission_revision: 9 },
    privateLocation: { geometry: { type: 'Point', coordinates: [3.456789, 6.987654] } },
  }])
  const response = await profile(request('/profiles/host'), profileContext)
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body).toEqual({ success: true, data: { username: 'host', displayName: 'Host Name', accountType: 'individual', identityVerified: false,
    memberSince: at.toISOString(), bio: 'Hello', avatarUrl: `/api/v1/files/profile-avatars/${otherId}/avatar.png`, reviewCount: 0, averageRating: null, listingIds: [id], safetyNotice: { active: false, text: null } } })
  const select = mocks.user.mock.calls[0][0].select
  for (const field of ['email', 'password_hash', 'verifiedDocument', 'didit_decision', 'analytics_subjects']) expect(select).not.toHaveProperty(field)
  expect(select.individualProfile).toEqual({ select: { full_name: true } })
  expect(mocks.listings).toHaveBeenCalledWith(expect.objectContaining({ where: { lister_id: otherId, listing_status: 'active' }, take: 50,
    select: { id: true, media_source: true, gallery_media: true, gallery_permission_revision: true,
      lister: { select: { gallery_upload_allowed: true, gallery_permission_revision: true } } },
  }))
  expect(body.data).not.toHaveProperty('id')
  expect(JSON.stringify(body)).not.toMatch(/gallery_media|gallery_permission_revision|gallery_upload_allowed|privateLocation|geometry|coordinates|PRIVATE_GALLERY_PATH|objectId|digest|3\.456789|6\.987654/)
  expect(JSON.stringify(body)).not.toContain(privateDigest)
  expect(JSON.stringify(body)).not.toContain(privateObjectId)
})

it('preserves historical identity truth without requiring it and suppresses private or external avatar URLs', async () => {
  const user = await mocks.user()
  mocks.user.mockResolvedValue({ ...user, kyc_verified: true, avatar_url: `/api/v1/files/compliance-docs/${otherId}/deed.pdf?token=private` })
  expect((await (await profile(request('/profiles/host'), profileContext)).json()).data).toMatchObject({ identityVerified: true, avatarUrl: null })
  mocks.user.mockResolvedValue({ ...user, avatar_url: 'https://external.example/track.png' })
  expect((await (await profile(request('/profiles/host'), profileContext)).json()).data.avatarUrl).toBeNull()
})

it('pages received booking reviews without booking IDs, private authors or payment/evidence fields', async () => {
  const response = await reviews(request('/profiles/host/reviews?limit=10'), profileContext)
  expect(await response.json()).toEqual({ success: true, data: { items: [{ id, rating: 5, comment: 'A helpful and reliable host.', author: { username: 'member' }, createdAt: at.toISOString() }], nextCursor: null, limit: 10 } })
  expect(mocks.reviews).toHaveBeenCalledWith(expect.objectContaining({ where: { subject_id: otherId, booking: { status: 'completed' } }, take: 11,
    select: { id: true, rating: true, comment: true, createdAt: true, author: { select: { username: true } } } }))
})

it('uses shared discovery serialization for an active-only host listing archive with actor saved-state', async () => {
  expect(await (await hostListings(request('/profiles/host/listings?limit=5'), profileContext)).json()).toEqual({ success: true, data: { items: [], nextCursor: null, limit: 5 } })
  expect(mocks.hostListings).toHaveBeenCalledExactlyOnceWith(otherId, userId, null, 5)
})

it('returns private notice/appeal details only from the actor-scoped service and exposes fixed public safety text', async () => {
  const response = await ownSafety(request('/safety/notices'))
  expect(response.status).toBe(200)
  expect((await response.json()).data.items[0]).toMatchObject({ id, reason: 'A reviewed private reason only for the affected member.', appeal: null })
  expect(mocks.ownSafety).toHaveBeenCalledWith(userId)
  mocks.safety.mockResolvedValue(true)
  const publicResponse = await profile(request('/profiles/host'), profileContext)
  const publicData = (await publicResponse.json()).data
  expect(publicData.safetyNotice.active).toBe(true)
  expect(publicData.safetyNotice.text).toContain('Rentral reviewed')
  expect(JSON.stringify(publicData)).not.toContain('private reason')
})

it('submits only an own active unappealed notice through the shared appeal service', async () => {
  const statement = 'I would like an independent review of this decision.'
  expect((await appeal(request(`/safety/notices/${id}/appeal`, 'POST', { statement }), idContext)).status).toBe(201)
  expect(mocks.appeal).toHaveBeenCalledExactlyOnceWith(userId, { noticeId: id, statement })
  expect((await appeal(request(`/safety/notices/${id}/appeal`, 'POST', { statement, appellantId: otherId }), idContext)).status).toBe(400)
  mocks.ownSafety.mockResolvedValue([])
  expect((await appeal(request(`/safety/notices/${id}/appeal`, 'POST', { statement }), idContext)).status).toBe(404)
  expect(mocks.appeal).toHaveBeenCalledTimes(1)
})

it('fails closed for malformed profile/review aggregates and hides missing handles', async () => {
  mocks.ratings.mockResolvedValueOnce({ _count: { _all: 1 }, _avg: { rating: 6 } })
  expect((await profile(request('/profiles/host'), profileContext)).status).toBe(503)
  mocks.reviews.mockResolvedValueOnce([{ id, rating: 8, comment: 'Malformed review data', createdAt: at, author: { username: 'member' } }])
  expect((await reviews(request('/profiles/host/reviews'), profileContext)).status).toBe(503)
  mocks.user.mockResolvedValue(null)
  expect((await profile(request('/profiles/host'), profileContext)).status).toBe(404)
})

it('creates feedback through the shared service with the authenticated actor and route booking only', async () => {
  expect((await review(request(`/bookings/${id}/review`, 'POST', { rating: 5, comment: '  A completed review.  ' }), idContext)).status).toBe(201)
  expect(mocks.submitReview).toHaveBeenCalledExactlyOnceWith(userId, { bookingId: id, rating: 5, comment: 'A completed review.' })
  expect((await report(request(`/bookings/${id}/reports`, 'POST', { reason: '  A report with sufficient explanation.  ' }), idContext)).status).toBe(201)
  expect(mocks.openReport).toHaveBeenCalledExactlyOnceWith(userId, { bookingId: id, reason: 'A report with sufficient explanation.' })
  expect(mocks.identity).toHaveBeenLastCalledWith(expect.any(Request), { platform: true, mutation: true, verified: true })
})

it('rejects spoofed review subjects and report openers, then denies foreign booking participants', async () => {
  expect((await review(request(`/bookings/${id}/review`, 'POST', { rating: 5, comment: 'A completed review.', subject_id: otherId }), idContext)).status).toBe(400)
  expect((await report(request(`/bookings/${id}/reports`, 'POST', { reason: 'A report with sufficient explanation.', opened_by: otherId }), idContext)).status).toBe(400)
  mocks.participant.mockResolvedValue(null)
  expect((await review(request(`/bookings/${id}/review`, 'POST', { rating: 5, comment: 'A completed review.' }), idContext)).status).toBe(404)
  expect(mocks.submitReview).not.toHaveBeenCalled(); expect(mocks.openReport).not.toHaveBeenCalled()
})

it('distinguishes duplicate feedback from an unconfirmed mutation without a second write', async () => {
  mocks.submitReview.mockRejectedValueOnce({ code: 'P2002' }).mockRejectedValueOnce(new Error('Private database diagnostics'))
  const duplicate = await review(request(`/bookings/${id}/review`, 'POST', { rating: 5, comment: 'A completed review.' }), idContext)
  expect(duplicate.status).toBe(409); expect(await duplicate.json()).toMatchObject({ code: 'ALREADY_SUBMITTED' })
  const uncertain = await review(request(`/bookings/${id}/review`, 'POST', { rating: 5, comment: 'A completed review.' }), idContext)
  expect(uncertain.status).toBe(503); expect(await uncertain.json()).toMatchObject({ code: 'FEEDBACK_UNCONFIRMED' })
  expect(mocks.submitReview).toHaveBeenCalledTimes(2)
})

it('reads back only this participant own feedback to recover an uncertain submission', async () => {
  expect(await (await feedback(request(`/bookings/${id}/feedback`), idContext)).json()).toEqual({ success: true, data: { reviewSubmitted: true, openReport: false } })
  expect(mocks.feedbackReview).toHaveBeenCalledExactlyOnceWith({ where: { booking_id: id, author_id: userId }, select: { id: true } })
  expect(mocks.feedbackReport).toHaveBeenCalledExactlyOnceWith({ where: { booking_id: id, opened_by: userId, status: 'open' }, select: { id: true } })
  mocks.participant.mockResolvedValue(null)
  expect((await feedback(request(`/bookings/${id}/feedback`), idContext)).status).toBe(404)
  expect(mocks.feedbackReview).toHaveBeenCalledTimes(1)
})
