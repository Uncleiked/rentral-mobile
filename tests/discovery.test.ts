import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn(), saves: vi.fn(), media: vi.fn(), holds: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { findMany: mocks.findMany, findFirst: mocks.findFirst }, savedListing: { findMany: mocks.saves }, booking: { findMany: mocks.holds } } }))
vi.mock('@/lib/media/status', () => ({ listingMediaStatuses: mocks.media }))
vi.mock('@/lib/media/config', () => ({ muxEnabled: () => process.env.MUX_ENABLED === 'true' }))
vi.mock('@/lib/profile-data', () => ({ formatListingPrice: (value: unknown) => String(value), listingPriceDenomination: (category: string) => category === 'house' ? 'year' : 'day' }))
import { getDiscoveryListings, getListingDetails } from '@/lib/discovery'
import { parseDiscoveryFilters } from '@/lib/discovery-policy'

const id = '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d'
const row = {
  id, category: 'house', text_address: '12 Hidden Street, Lekki, Lagos', base_rent_amount: '5000000',
  asset_metadata: { bedrooms: '0', bathrooms: '1', sizeSqm: '45' }, video_path: 'host/folder/video.webm',
  poster_path: 'host/folder/poster.jpg', listing_status: 'active', createdAt: new Date('2026-11-07T12:00:00Z'),
  lister_id: 'host', lister: { username: 'rentralhost', avatar_url: null, kyc_verified: true, account_type: 'individual', bio: null, createdAt: new Date('2026-01-01T00:00:00Z') },
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
  vi.stubEnv('MUX_ENABLED', 'false')
  mocks.findMany.mockResolvedValue([row])
  mocks.findFirst.mockResolvedValue(row)
  mocks.media.mockResolvedValue(new Map())
  mocks.saves.mockResolvedValue([]); mocks.holds.mockResolvedValue([])
})
afterEach(() => vi.unstubAllEnvs())

it('queries active inventory with stable ordered pagination and server-side filters', async () => {
  await getDiscoveryListings(parseDiscoveryFilters({ category: 'house', q: 'Lekki', bedrooms: '0', minPrice: '1000000' }), 'viewer')
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 19, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: { AND: expect.arrayContaining([{ listing_status: 'active' }, { category: 'house' }, { text_address: { contains: 'Lekki', mode: 'insensitive' } }, { asset_metadata: { path: ['bedrooms'], equals: '0' } }]) } }))
  expect(mocks.saves).not.toHaveBeenCalled()
  expect(mocks.holds).not.toHaveBeenCalled()
})

it('shows a live hold deadline without exposing the holder or querying new tables before staging', async () => {
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  const deadline = new Date(Date.now() + 86400000)
  mocks.holds.mockResolvedValue([{ listing_id: id, expires_at: deadline }])
  const result = await getListingDetails(id, 'viewer')
  expect(result?.holdUntil).toBe(deadline.toISOString())
  expect(mocks.holds).toHaveBeenCalledWith(expect.objectContaining({ select: { listing_id: true, expires_at: true, allocated_hold_credit: { select: { rental_booking: { select: { expires_at: true } } } } }, where: expect.objectContaining({ kind: 'hold', OR: expect.arrayContaining([{ status: 'confirmed' }, expect.objectContaining({ status: 'converted', allocated_hold_credit: { rental_booking: { status: 'awaiting_payment', expires_at: { gt: expect.any(Date) } } } })]) }) }))
  expect(JSON.stringify(result)).not.toContain('seeker_id')
})

it('projects neighborhood and authorized media URLs without leaking address, GPS or storage paths', async () => {
  const result = await getDiscoveryListings(parseDiscoveryFilters({}), 'viewer')
  expect(result.listings[0]).toMatchObject({ location: 'Lekki, Lagos', title: 'Studio home', videoUrl: `/api/listings/${id}/source?kind=video`, saved: false })
  const serialized = JSON.stringify(result)
  expect(serialized).not.toContain('Hidden Street')
  expect(serialized).not.toContain('host/folder')
  expect(serialized).not.toContain('hardware_coordinates')
})

it('does not offer a Mux listing before its video is ready', async () => {
  vi.stubEnv('MUX_ENABLED', 'true')
  expect((await getDiscoveryListings(parseDiscoveryFilters({}))).listings).toEqual([])
  mocks.media.mockResolvedValue(new Map([[id, { status: 'ready', attempts: 1 }]]))
  expect((await getDiscoveryListings(parseDiscoveryFilters({}))).listings[0]).toMatchObject({ useMux: true, videoUrl: null })
})

it('limits private detail lookup to the viewer’s own inventory or active listings', async () => {
  await getListingDetails(id, 'viewer')
  expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id, OR: [{ listing_status: 'active' }, { lister_id: 'viewer' }] } }))
  expect(await getListingDetails('../../private', 'viewer')).toBeNull()
  expect(mocks.findFirst).toHaveBeenCalledTimes(1)
})

it('builds the next cursor from the last returned row, including timestamp ties', async () => {
  mocks.findMany.mockResolvedValue(Array.from({ length: 19 }, (_, index) => ({ ...row, id: `${String(index).padStart(8, '0')}-62c1-4c5d-93de-7a0ee6d5728d` })))
  const result = await getDiscoveryListings(parseDiscoveryFilters({}))
  expect(result.listings).toHaveLength(18)
  expect(result.nextCursor).toEqual({ id: '00000017-62c1-4c5d-93de-7a0ee6d5728d', createdAt: row.createdAt.toISOString() })
})
