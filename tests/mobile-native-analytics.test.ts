import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixture.request, ApiError: class extends Error {} }))
import { createNativeAnalytics } from '../apps/mobile/src/lib/native-analytics-core'
import { checkoutObservation, listingObservation, searchObservation } from '../apps/mobile/src/lib/native-analytics'
import { emptyDiscoveryFilters } from '../apps/mobile/src/lib/discovery-input'

beforeEach(() => { fixture.request.mockReset() })
const event = { event: 'search', category: 'house', intent: 'rent', neighborhood: 'lekki', budgetBand: '1m-3m' } as const
it('builds coarse observations without query text, asset IDs, exact prices or coordinates', () => {
  const filters = { ...emptyDiscoveryFilters(), category: 'house' as const, q: 'Private address on Lekki Road', maxPrice: '1000000.50', bedrooms: '2' }
  expect(searchObservation(filters)).toEqual({ ...event, bedrooms: 2 })
  expect(listingObservation({ id: 'private-id', category: 'house', intent: 'rent', location: '12 Private Road, Ikoyi', price: '₦5,000,000', metadata: { bedrooms: '3', address: 'private', lat: 6 } }))
    .toEqual({ event: 'detail', category: 'house', intent: 'rent', neighborhood: 'ikoyi', budgetBand: '5m-plus', bedrooms: 3 })
  expect(searchObservation(emptyDiscoveryFilters())).toBeNull()
})
it('records checkout attempts without interpreting a holding or inspection amount as price or payment', () => {
  expect(checkoutObservation({ id: 'hidden', amountKobo: '500000', status: 'paid', listing: { category: 'car', location: 'Yaba' } }))
    .toEqual({ event: 'checkout', category: 'car', intent: 'rent', neighborhood: 'yaba', budgetBand: 'unspecified' })
})
it.each([null, {}, { listing: null }, { category: 'unknown' }, { category: 'house', metadata: null }])('ignores malformed optional sources without breaking the screen %#', source => {
  expect(() => listingObservation(source)).not.toThrow()
  expect(listingObservation(source)).toBeNull()
  expect(() => checkoutObservation(source)).not.toThrow()
})
it('checks persisted consent and the server collection gate before every eligible attempt', async () => {
  const consent = vi.fn().mockResolvedValueOnce({ allowed: false, collectionEnabled: true }).mockResolvedValueOnce({ allowed: true, collectionEnabled: false }), post = vi.fn()
  const tracker = createNativeAnalytics({ consent, post })
  expect(await tracker.record('actor-a', event)).toBe(false)
  expect(await tracker.record('actor-b', event)).toBe(false)
  expect(post).not.toHaveBeenCalled()
})
it('coalesces repeated focus observations by actor and coarse value without retaining raw query keys', async () => {
  let now = 0
  const consent = vi.fn().mockResolvedValue({ allowed: true, collectionEnabled: true }), post = vi.fn().mockResolvedValue(true)
  const tracker = createNativeAnalytics({ consent, post, now: () => now })
  expect(await Promise.all([tracker.record('actor-a', event), tracker.record('actor-a', event)])).toEqual([true, true])
  expect(post).toHaveBeenCalledTimes(1)
  await tracker.record('actor-b', event)
  expect(post).toHaveBeenLastCalledWith('actor-b', event)
  now = 60000
  await tracker.record('actor-a', event)
  expect(post).toHaveBeenCalledTimes(3)
})
it('honors opt-out while an earlier consent read is still pending', async () => {
  let finish!: (value: { allowed: boolean; collectionEnabled: boolean }) => void
  const post = vi.fn(), tracker = createNativeAnalytics({ consent: () => new Promise(resolve => { finish = resolve }), post })
  const pending = tracker.record('actor-a', event)
  tracker.permission('actor-a', false)
  finish({ allowed: true, collectionEnabled: true })
  expect(await pending).toBe(false)
  expect(await tracker.record('actor-a', { ...event, category: 'boat' })).toBe(false)
  expect(post).not.toHaveBeenCalled()
})
it('does not queue, retry or surface optional transport failures and rejects private fields', async () => {
  const consent = vi.fn().mockResolvedValue({ allowed: true, collectionEnabled: true }), post = vi.fn().mockRejectedValue(new Error('offline'))
  const tracker = createNativeAnalytics({ consent, post })
  expect(await tracker.record('actor-a', { ...event, query: 'private' })).toBe(false)
  expect(await tracker.record('actor-a', event)).toBe(false)
  expect(await tracker.record('actor-a', event)).toBe(false)
  expect(post).toHaveBeenCalledTimes(1)
})
