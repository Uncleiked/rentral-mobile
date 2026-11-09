import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixture.request, ApiError: class extends Error {} }))
import { recordSponsoredObservation, sponsoredApiPath, sponsoredPageSchema } from '../apps/mobile/src/lib/sponsored-api'
import { nativeAnalytics } from '../apps/mobile/src/lib/native-analytics'
import { emptyDiscoveryFilters } from '../apps/mobile/src/lib/discovery-input'
const actor = '11111111-1111-4111-8111-111111111111', campaign = '22222222-2222-4222-8222-222222222222'
beforeEach(() => { fixture.request.mockReset(); nativeAnalytics.permission(actor, true) })
it('uses the same discovery filters for separate sponsored retrieval without borrowing the organic cursor', () => {
  const path = new URL(sponsoredApiPath({ ...emptyDiscoveryFilters(), category: 'house', q: 'Yaba', bedrooms: '0', maxPrice: '1000000', cursor: { id: campaign, createdAt: '2030-01-01T00:00:00.000Z' } }), 'https://fixture.test')
  expect(path.pathname).toBe('/sponsored')
  expect(Object.fromEntries(path.searchParams)).toMatchObject({ category: 'house', q: 'Yaba', bedrooms: '0', maxPrice: '1000000' })
  expect(path.searchParams.has('cursor')).toBe(false)
})
it('requires explicit sponsor labels and environment, a public listing projection and at most three placements', () => {
  const listing = { id: campaign, title: 'Fixture home', category: 'house', location: 'Yaba', price: '1000', pricePeriod: 'year', intent: 'rent', posterUrl: null, videoUrl: null, useMux: false,
    mediaEndpoint: `/api/v1/listings/${campaign}/media`, badges: [], saved: false, savingAvailable: true, holdUntil: null, host: { username: 'fixture_host', avatarUrl: null, identityVerified: false } }
  const item = { campaignId: campaign, headline: 'Fixture sponsored home', adLabel: 'Sponsored', billingEnvironment: 'test', endsAt: '2030-01-01T00:00:00Z', listing }
  expect(sponsoredPageSchema.safeParse({ items: [item] }).success).toBe(true)
  for (const patch of [{ adLabel: undefined }, { adLabel: 'Recommended' }, { billingEnvironment: undefined }, { listing: { ...listing, hardware_coordinates: [3, 6] } }])
    expect(sponsoredPageSchema.safeParse({ items: [{ ...item, ...patch }] }).success).toBe(false)
  expect(sponsoredPageSchema.safeParse({ items: [item, item, item, item] }).success).toBe(false)
})
it.each([{ campaignId: '../private', event: 'click' }, { campaignId: campaign, event: 'purchase' }, { campaignId: campaign, event: 'click', query: 'private' }])('rejects malformed or private observation fields before any request %#', async input => {
  expect(await recordSponsoredObservation(actor, input)).toBe(false)
  expect(fixture.request).not.toHaveBeenCalled()
})
it('records only the validated campaign event after persisted consent and binds both requests to the captured account', async () => {
  fixture.request.mockResolvedValueOnce({ allowed: true, collectionEnabled: true, updatedAt: null, retentionDays: 90 }).mockResolvedValueOnce({ recorded: true })
  expect(await recordSponsoredObservation(actor, { campaignId: campaign, event: 'impression' })).toBe(true)
  expect(fixture.request.mock.calls).toEqual([
    ['/privacy/analytics', { expectedUserId: actor }], [`/sponsored/${campaign}/events`, { method: 'POST', body: { event: 'impression' }, expectedUserId: actor }],
  ])
  await recordSponsoredObservation(actor, { campaignId: campaign, event: 'impression' })
  expect(fixture.request).toHaveBeenCalledTimes(2)
})
it('never posts when opted out and does not replay a failed observation', async () => {
  fixture.request.mockResolvedValueOnce({ allowed: false, collectionEnabled: true, updatedAt: null, retentionDays: 90 })
  expect(await recordSponsoredObservation(actor, { campaignId: campaign, event: 'impression' })).toBe(false)
  expect(fixture.request).toHaveBeenCalledTimes(1)
  nativeAnalytics.permission(actor, true)
  fixture.request.mockResolvedValueOnce({ allowed: true, collectionEnabled: true, updatedAt: null, retentionDays: 90 }).mockRejectedValueOnce(new Error('offline'))
  expect(await recordSponsoredObservation(actor, { campaignId: campaign, event: 'click' })).toBe(false)
  expect(await recordSponsoredObservation(actor, { campaignId: campaign, event: 'click' })).toBe(false)
  expect(fixture.request).toHaveBeenCalledTimes(3)
})
it('cancels an in-flight placement consent read immediately after local opt-out intent', async () => {
  let finish!: (value: unknown) => void
  fixture.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const pending = recordSponsoredObservation(actor, { campaignId: campaign, event: 'impression' })
  nativeAnalytics.permission(actor, false)
  finish({ allowed: true, collectionEnabled: true, updatedAt: null, retentionDays: 90 })
  expect(await pending).toBe(false)
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
