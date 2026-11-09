import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ request: vi.fn(), values: new Map<string, string>(), get: vi.fn(), set: vi.fn(), remove: vi.fn() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixture.request, ApiError: class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
} }))
vi.mock('../apps/mobile/src/lib/session-storage', () => ({ sessionStorage: { getItem: fixture.get, setItem: fixture.set, removeItem: fixture.remove } }))
import { ApiError } from '../apps/mobile/src/lib/api'
import { closeNativeAccount, exportAccountResource, loadAccountExportManifest } from '../apps/mobile/src/lib/account-lifecycle-api'
import { clearDeviceSavedSearches, deviceSearchDescription, loadDeviceSavedSearches, removeDeviceSavedSearch, saveDeviceSearch } from '../apps/mobile/src/lib/device-saved-searches'
import { emptyDiscoveryFilters } from '../apps/mobile/src/lib/discovery-input'
const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333', next = '44444444-4444-4444-8444-444444444444'
const page = { version: 1, resource: 'profile', generatedAt: '2030-01-01T10:00:00.000Z', items: [{ id: actor, username: 'fixture_member' }], nextCursor: null }
beforeEach(() => {
  vi.resetAllMocks(); fixture.values.clear()
  fixture.get.mockImplementation(async key => fixture.values.get(key) ?? null)
  fixture.set.mockImplementation(async (key, value) => { fixture.values.set(key, value) })
  fixture.remove.mockImplementation(async key => { fixture.values.delete(key) })
})
it('requires both confirmed closure flags and binds the password mutation to the actor', async () => {
  fixture.request.mockResolvedValueOnce({ closed: true, signInRequired: true }).mockResolvedValueOnce({ closed: true, signInRequired: false })
  expect(await closeNativeAccount('transient-fixture-password', actor)).toEqual({ closed: true, signInRequired: true })
  expect(fixture.request).toHaveBeenCalledWith('/account/close', { method: 'POST', body: { currentPassword: 'transient-fixture-password' }, expectedUserId: actor })
  await expect(closeNativeAccount('transient-fixture-password', actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(fixture.set).not.toHaveBeenCalled()
})
it('rejects an empty password locally and never retries an unknown closure', async () => {
  await expect(closeNativeAccount('', actor)).rejects.toMatchObject({ status: 400 })
  expect(fixture.request).not.toHaveBeenCalled()
  fixture.request.mockRejectedValueOnce(new ApiError('Unknown response', 'NETWORK_ERROR', 0))
  await expect(closeNativeAccount('transient-fixture-password', actor)).rejects.toMatchObject({ status: 0 })
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('keeps the explicit obligations conflict instead of claiming erasure or closure', async () => {
  fixture.request.mockRejectedValueOnce(new ApiError('Resolve ongoing bookings first.', 'ACCOUNT_HAS_OBLIGATIONS', 409))
  await expect(closeNativeAccount('transient-fixture-password', actor)).rejects.toMatchObject({ code: 'ACCOUNT_HAS_OBLIGATIONS', status: 409 })
})
it('accepts only the named export resource manifest without duplicate resources', async () => {
  fixture.request.mockResolvedValueOnce({ version: 1, resources: ['profile', 'messages'], description: 'Own account records only.' })
    .mockResolvedValueOnce({ version: 1, resources: ['credentials'], description: 'Invalid.' })
    .mockResolvedValueOnce({ version: 1, resources: ['profile', 'profile'], description: 'Invalid.' })
  expect((await loadAccountExportManifest(actor)).resources).toEqual(['profile', 'messages'])
  await expect(loadAccountExportManifest(actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  await expect(loadAccountExportManifest(actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('streams each bounded page in order and produces complete JSON without accumulating all records', async () => {
  fixture.request.mockResolvedValueOnce({ ...page, nextCursor: id }).mockResolvedValueOnce({ ...page, items: [{ id: other, username: 'second_fixture' }] })
  const parts: string[] = [], progress: unknown[] = []
  const totals = await exportAccountResource(actor, 'profile', { append: async text => { parts.push(text) } }, (items, pages) => progress.push({ items, pages }))
  expect(totals).toEqual({ resource: 'profile', items: 2, pages: 2 })
  expect(JSON.parse(parts.join('')).pages).toHaveLength(2)
  expect(progress).toEqual([{ items: 1, pages: 1 }, { items: 2, pages: 2 }])
  expect(fixture.request.mock.calls.map(([path]) => path)).toEqual(['/account/export?resource=profile&limit=100', `/account/export?resource=profile&limit=100&cursor=${id}`])
  expect(fixture.request.mock.calls.every(([, options]) => options.expectedUserId === actor)).toBe(true)
})
it.each([{ resource: 'messages' }, { nextCursor: 'not-a-cursor' }, { version: 2 }])('does not finish an export after a mismatched page %j', async patch => {
  fixture.request.mockResolvedValueOnce({ ...page, ...patch })
  const append = vi.fn().mockResolvedValue(undefined)
  await expect(exportAccountResource(actor, 'profile', { append }, () => undefined)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(append).toHaveBeenCalledTimes(1)
})
it('rejects a repeated/backwards cursor instead of looping or duplicating account records', async () => {
  fixture.request.mockResolvedValueOnce({ ...page, nextCursor: next }).mockResolvedValueOnce({ ...page, nextCursor: id })
  await expect(exportAccountResource(actor, 'profile', { append: async () => undefined }, () => undefined)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(fixture.request).toHaveBeenCalledTimes(2)
})
it('cancels before network work or before writing the returned private page', async () => {
  const abort = new AbortController(); abort.abort()
  const append = vi.fn().mockResolvedValue(undefined)
  await expect(exportAccountResource(actor, 'profile', { append }, () => undefined, abort.signal)).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(fixture.request).not.toHaveBeenCalled(); expect(append).not.toHaveBeenCalled()
  const inFlight = new AbortController()
  fixture.request.mockImplementationOnce(async () => { inFlight.abort(); return page })
  await expect(exportAccountResource(actor, 'profile', { append }, () => undefined, inFlight.signal)).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(append).toHaveBeenCalledTimes(1)
})
it('stores only canonical discovery constraints for the actor, without a paging cursor', async () => {
  const filters = { ...emptyDiscoveryFilters(), category: 'house' as const, q: 'Yaba', bedrooms: '0', cursor: { createdAt: page.generatedAt, id }, transmission: 'manual' as const }
  const saved = await saveDeviceSearch(actor, { id, name: 'Studio homes', filters })
  expect(saved[0].params).toEqual({ category: 'house', q: 'Yaba', bedrooms: '0' })
  expect(await loadDeviceSavedSearches(actor)).toEqual(saved)
  expect(await loadDeviceSavedSearches(other)).toEqual([])
  expect(fixture.request).not.toHaveBeenCalled()
  expect(deviceSearchDescription(saved[0].params)).toBe('Homes · Yaba · 0 bedrooms')
})
it('rejects invalid budgets instead of silently clearing their constraint', async () => {
  await expect(saveDeviceSearch(actor, { id, name: 'Invalid budget', filters: { ...emptyDiscoveryFilters(), minPrice: '1.0001' } })).rejects.toThrow('budget')
  expect(fixture.set).not.toHaveBeenCalled()
})
it('serializes overlapping device saves and enforces distinct names without losing previous searches', async () => {
  await Promise.all([saveDeviceSearch(actor, { id, name: 'First', filters: emptyDiscoveryFilters() }), saveDeviceSearch(actor, { id: next, name: 'Second', filters: emptyDiscoveryFilters() })])
  expect(await loadDeviceSavedSearches(actor)).toHaveLength(2)
  await expect(saveDeviceSearch(actor, { id: other, name: 'first', filters: emptyDiscoveryFilters() })).rejects.toThrow('different name')
  expect(await loadDeviceSavedSearches(actor)).toHaveLength(2)
})
it('preserves visible searches after a failed device write and supports actor-scoped removal', async () => {
  await saveDeviceSearch(actor, { id, name: 'First', filters: emptyDiscoveryFilters() })
  fixture.set.mockRejectedValueOnce(new Error('Device storage unavailable'))
  await expect(saveDeviceSearch(actor, { id: next, name: 'Second', filters: emptyDiscoveryFilters() })).rejects.toThrow('Device storage unavailable')
  expect(await loadDeviceSavedSearches(actor)).toHaveLength(1)
  expect(await removeDeviceSavedSearch(actor, id)).toEqual([])
})
it('does not forward corrupted or unexpected device query data and clears only by deliberate action', async () => {
  fixture.values.set(`rentral.searches.${actor}`, JSON.stringify({ version: 1, actorId: actor, items: [{ id, name: 'Bad saved record', params: { apiKey: 'never forward' }, createdAt: page.generatedAt }] }))
  await expect(loadDeviceSavedSearches(actor)).rejects.toThrow('could not be confirmed')
  expect(fixture.request).not.toHaveBeenCalled()
  await clearDeviceSavedSearches(actor)
  expect(await loadDeviceSavedSearches(actor)).toEqual([])
})
