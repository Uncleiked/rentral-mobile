import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ initial: vi.fn(), current: vi.fn(), location: vi.fn(), upsert: vi.fn(), lock: vi.fn(), transaction: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { findUniqueOrThrow: mocks.initial } } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: mocks.transaction, lockRecord: mocks.lock }))
import { distanceMetersWgs84, listingProximity, verifyListingAddress } from '@/lib/listings/spatial'

const point = { longitude: 3.4, latitude: 6.45 }
const listingId = '27d5a2ee-62c1-4c5d-93de-7a0ee6d5728d'
const tx = { listing: { findUnique: mocks.current }, listingLocation: { findUnique: mocks.location }, listingVerification: { upsert: mocks.upsert } }
// The fixture supplies only the transaction delegates exercised by this service.
const fixtureTransaction = tx as unknown as Parameters<typeof listingProximity>[0]
function north(meters: number): number { return point.latitude + meters / 6371008.8 * 180 / Math.PI }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.initial.mockResolvedValue({ text_address: 'Test building, Lekki, Lagos' })
  mocks.current.mockResolvedValue({ text_address: 'Test building, Lekki, Lagos' })
  mocks.location.mockResolvedValue({ geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] } })
  mocks.lock.mockResolvedValue(true)
  mocks.transaction.mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx))
  vi.stubEnv('GEOAPIFY_API_KEY', 'test-only-not-a-real-key')
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ features: [{ geometry: { coordinates: [point.longitude, point.latitude] }, properties: { result_type: 'building', rank: { confidence: 0.95 } } }] })))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('WGS84 coordinate proximity on the documented mean-radius sphere', () => {
  it('returns zero at the same point and the known equatorial one-degree distance', () => {
    expect(distanceMetersWgs84(point, point)).toBe(0)
    expect(distanceMetersWgs84({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111195.080234, 3)
  })
  it('uses the short antimeridian crossing and remains finite for antipodes', () => {
    expect(distanceMetersWgs84({ latitude: 0, longitude: 179.9999 }, { latitude: 0, longitude: -179.9999 })).toBeCloseTo(22.239016, 3)
    expect(distanceMetersWgs84({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toBeCloseTo(Math.PI * 6371008.8, 4)
  })
  it.each([{ latitude: 91, longitude: 3 }, { latitude: 6, longitude: Infinity }, { latitude: NaN, longitude: 3 }])('rejects invalid coordinates %o', invalid => {
    expect(() => distanceMetersWgs84(point, invalid)).toThrow()
  })
  it('applies the 20m check-in threshold without swapping longitude and latitude', async () => {
    expect(await listingProximity(fixtureTransaction, listingId, point.longitude, north(19.99), 20)).toBe(true)
    expect(await listingProximity(fixtureTransaction, listingId, point.longitude, north(20.01), 20)).toBe(false)
    expect(mocks.location).toHaveBeenCalledWith({ where: { listing_id: listingId }, select: { geometry: true } })
  })
  it.each([null, { geometry: { type: 'Point', coordinates: [300, 6.45] } }, { geometry: { type: 'LineString', coordinates: [3.4, 6.45] } }])('fails closed for a missing or malformed private location %o', async record => {
    mocks.location.mockResolvedValue(record)
    expect(await listingProximity(fixtureTransaction, listingId, point.longitude, point.latitude, 20)).toBe(false)
  })
  it('rejects invalid caller bounds before reading a private location', async () => {
    expect(await listingProximity(fixtureTransaction, listingId, point.longitude, 95, 20)).toBe(false)
    expect(await listingProximity(fixtureTransaction, listingId, point.longitude, point.latitude, -1)).toBe(false)
    expect(mocks.location).not.toHaveBeenCalled()
  })
})

describe('address matching and stale provider results', () => {
  it('checks geocoded building points against the private 100m threshold', async () => {
    expect(await verifyListingAddress(listingId)).toBe('matched')
    expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ spatial_status: 'matched', distance_meters: 0 })
    mocks.location.mockResolvedValue({ geometry: { type: 'Point', coordinates: [point.longitude, north(100.01)] } })
    expect(await verifyListingAddress(listingId)).toBe('mismatch')
    expect(mocks.upsert.mock.calls[1][0].create.distance_meters).toBeGreaterThan(100)
  })
  it('cannot apply a delayed response after the listing address changes', async () => {
    mocks.current.mockResolvedValue({ text_address: 'Different building, Yaba, Lagos' })
    expect(await verifyListingAddress(listingId)).toBe('unavailable')
    expect(mocks.location).not.toHaveBeenCalled()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('does not mistake a district centroid for a building match', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ features: [{ geometry: { coordinates: [3.4, 6.45] }, properties: { result_type: 'district', rank: { confidence: 1 } } }] }))
    expect(await verifyListingAddress(listingId)).toBe('unavailable')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('stays unavailable without geocoder configuration and performs no remote request', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', '')
    expect(await verifyListingAddress(listingId)).toBe('unavailable')
    expect(fetch).not.toHaveBeenCalled()
  })
})
