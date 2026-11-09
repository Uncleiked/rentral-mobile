import { beforeEach, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixtures.request, ApiError: class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
} }))
import { ApiError } from '../apps/mobile/src/lib/api'
import { markNotificationRead, removeMemberAnalyticsHistory, saveMemberProfile, setMemberAnalyticsConsent, submitBookingFeedback, submitSafetyAppeal } from '../apps/mobile/src/lib/member-api'
import { analyticsPrivacySchema, bookingFeedbackSchema, memberAvatarUrl, notificationDestination, notificationPageSchema, ownSafetyNoticesSchema, publicMemberSchema, reviewPageSchema } from '../apps/mobile/src/lib/member-contracts'

const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const origin = 'http://192.168.1.10:3000'
const date = '2030-01-01T10:00:00.000Z'
const profile = { id, email: 'member@example.test', username: null, bio: 'My profile', avatarUrl: null, accountType: 'individual', memberSince: date, platformAvailable: true }
const publicProfile = { username: 'host_member', displayName: 'Host member', accountType: 'individual', identityVerified: false, memberSince: date, bio: null,
  avatarUrl: null, reviewCount: 0, averageRating: null, listingIds: [], safetyNotice: { active: false, text: null } }
beforeEach(() => { fixtures.request.mockReset() })

it.each([
  [`/marketplace/bookings/${id}`, { pathname: '/booking/[id]', params: { id } }],
  [`/marketplace/messages?id=${id}`, { pathname: '/conversation/[id]', params: { id } }],
  [`/marketplace/listing/${id}`, { pathname: '/listing/[id]', params: { id } }],
  ['/marketplace/profile/host_member', { pathname: '/profile/[username]', params: { username: 'host_member' } }],
  ['/marketplace/appeals', { pathname: '/appeals' }], ['/marketplace/profile', { pathname: '/(tabs)/profile' }],
  [`/marketplace/squat-mates/connections/${id}`, { pathname: '/match/[id]', params: { id } }],
  ['/marketplace/squat-mates/reports', { pathname: '/matching-history', params: { tab: 'reports' } }],
  ['/marketplace/squat-mates/blocks', { pathname: '/matching-history', params: { tab: 'blocks' } }],
  ['/marketplace/squat-mates', { pathname: '/squat-mates' }], ['/marketplace/dashboard', { pathname: '/dashboard' }],
])('maps safe notification destination%s to an actual native route', (href, destination) => {
  expect(notificationDestination(href)).toEqual(destination)
})
it.each(['https://attacker.example/marketplace/bookings/x', '//attacker.example/marketplace', '/\\attacker.example',
  '/marketplace/bookings/not-a-uuid', '/api/v1/files/compliance-docs/private?token=secret', '/marketplace/profile/%2fadmin', '/marketplace\n/messages'])('does not turn unsafe notification path%s into navigation', href => {
  expect(notificationDestination(href)).toBeNull()
})
it('opens owned public raster avatar URLs through the device-reachable API origin', () => {
  const path = `/api/v1/files/profile-avatars/${id}/photo.jpg`
  expect(memberAvatarUrl(path, origin)).toBe(`${origin}${path}`)
  expect(memberAvatarUrl(`http://localhost:3000${path}`, origin)).toBe(`${origin}${path}`)
})
it.each([`https://attacker.example/photo.jpg`, `/api/v1/files/compliance-docs/${id}/folder/proof.jpg?token=private`,
  `/api/v1/files/profile-avatars/${id}/photo.svg`, `/api/v1/files/profile-avatars/${id}/photo.jpg?token=private`,
  `/api/v1/files/profile-avatars/${id}/photo.jpg#private`, '/api/v1/files/profile-avatars/user/%2e%2e/private.jpg'])('does not load external or private avatar reference%s', value => {
  expect(memberAvatarUrl(value, origin)).toBeNull()
})
it('preserves no-review truth and rejects invented count/average combinations', () => {
  expect(publicMemberSchema.parse(publicProfile).averageRating).toBeNull()
  expect(publicMemberSchema.safeParse({ ...publicProfile, averageRating: 5 }).success).toBe(false)
  expect(publicMemberSchema.safeParse({ ...publicProfile, reviewCount: 3, averageRating: null }).success).toBe(false)
})
it('accepts truthful historical identity and an independent public safety finding without gating access', () => {
  expect(publicMemberSchema.parse({ ...publicProfile, identityVerified: false, safetyNotice: { active: true, text: 'Reviewed safety notice.' } }).safetyNotice.active).toBe(true)
})
it('rejects malformed archive items instead of showing empty or fabricated content', () => {
  expect(notificationPageSchema.safeParse({ items: [{ id: 'bad', title: 'Update' }], nextCursor: null, limit: 20 }).success).toBe(false)
  expect(reviewPageSchema.safeParse({ items: [{ id, rating: 6, comment: 'Completed booking review', author: { username: 'member' }, createdAt: date }], nextCursor: null, limit: 20 }).success).toBe(false)
})
it('marks only the selected notification read after a confirmed response', async () => {
  fixtures.request.mockResolvedValueOnce({ id, readAt: date }).mockResolvedValueOnce({ id: other, readAt: date })
  expect(await markNotificationRead(id)).toEqual({ id, readAt: date })
  await expect(markNotificationRead(id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(fixtures.request.mock.calls[0]).toEqual([`/notifications/${id}/read`, { method: 'PATCH', body: {} }])
})
it('allows a bio-only update without forcing a previously absent username', async () => {
  fixtures.request.mockResolvedValue(profile)
  expect((await saveMemberProfile({ bio: 'My profile' })).username).toBeNull()
  expect(fixtures.request).toHaveBeenCalledExactlyOnceWith('/me', { method: 'PATCH', body: { bio: 'My profile' } })
})
it('keeps avatar updates as owned file references without forwarding an actor or authority flag', async () => {
  const avatarUrl = `/api/v1/files/profile-avatars/${id}/photo.jpg`
  fixtures.request.mockResolvedValue({ ...profile, avatarUrl })
  expect((await saveMemberProfile({ avatarUrl })).avatarUrl).toBe(avatarUrl)
  expect(fixtures.request).toHaveBeenCalledExactlyOnceWith('/me', { method: 'PATCH', body: { avatarUrl } })
})
it('derives feedback subjects on the server and requires a confirmed submission result', async () => {
  fixtures.request.mockResolvedValueOnce({ submitted: true }).mockResolvedValueOnce({ submitted: false })
  await submitBookingFeedback(id, { rating: 5, comment: 'A helpful and clear completed booking.' })
  expect(fixtures.request.mock.calls[0]).toEqual([`/bookings/${id}/review`, { method: 'POST', body: { rating: 5, comment: 'A helpful and clear completed booking.' } }])
  await expect(submitBookingFeedback(id, { reason: 'The asset condition needs review.' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('keeps report and appeal drafts recoverable after uncertain failures without retrying automatically', async () => {
  fixtures.request.mockRejectedValue(new ApiError('Could not confirm submission.', 'FEEDBACK_UNCONFIRMED', 503))
  await expect(submitBookingFeedback(id, { reason: 'The listing and the asset do not match.' })).rejects.toMatchObject({ status: 503 })
  expect(fixtures.request).toHaveBeenCalledTimes(1)
  fixtures.request.mockReset().mockResolvedValue({ submitted: true })
  await submitSafetyAppeal(id, 'Please review the original documents and our messages.')
  expect(fixtures.request).toHaveBeenCalledExactlyOnceWith(`/safety/notices/${id}/appeal`, { method: 'POST', body: { statement: 'Please review the original documents and our messages.' } })
})
it('supports participant-scoped feedback readback and empty own-safety lists', () => {
  expect(bookingFeedbackSchema.parse({ reviewSubmitted: false, openReport: true }).openReport).toBe(true)
  expect(ownSafetyNoticesSchema.parse({ enabled: true, items: [], limit: 100 }).items).toEqual([])
})
it('does not imply analytics consent from missing, null or arbitrary client flags', () => {
  expect(analyticsPrivacySchema.safeParse({ collectionEnabled: true, updatedAt: null, retentionDays: 90 }).success).toBe(false)
  expect(analyticsPrivacySchema.safeParse({ allowed: 'yes', collectionEnabled: true, updatedAt: null, retentionDays: 90 }).success).toBe(false)
})
it('saves an explicit cross-device consent choice and confirms withdrawal/deletion separately', async () => {
  const consent = { allowed: true, updatedAt: date, collectionEnabled: true, retentionDays: 90 }
  fixtures.request.mockResolvedValueOnce(consent).mockResolvedValueOnce({ removed: true, allowed: false })
  expect(await setMemberAnalyticsConsent(true)).toEqual(consent)
  expect(await removeMemberAnalyticsHistory()).toEqual({ removed: true, allowed: false })
  expect(fixtures.request.mock.calls).toEqual([
    ['/privacy/analytics', { method: 'PATCH', body: { allowed: true } }], ['/privacy/analytics/history', { method: 'DELETE' }],
  ])
})
it('refuses to show deleted history when the server did not confirm both removal and opt-out', async () => {
  fixtures.request.mockResolvedValue({ removed: true, allowed: true })
  await expect(removeMemberAnalyticsHistory()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
