import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), listing: vi.fn(), hold: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: mocks.listing }, booking: { findFirst: mocks.hold } } }))
vi.mock('@/lib/payments/config', () => ({ paymentsEnabled: () => false }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { ApiError } from '@/lib/api/http'
import { POST as quote } from '@/app/api/v1/bookings/quote/route'

const renter = '55bfc098-ff33-4fdd-b7ae-68d810a74050'
const host = '52db23e2-fb48-4cf7-9dfc-06e3c96c301f'
const listingId = 'c7af3d50-a016-475d-8e51-23fd04989436'
const holdId = '2ca8c61b-ffac-4200-bcba-a7387d0324ac'
const now = '2030-01-01T10:00:00.000Z'
const period = { startsAt: '2030-01-02T10:00:00.000Z', endsAt: '2030-01-03T10:00:00.000Z' }
const input = { listingId, kind: 'rental', ...period }
function request(body: unknown): Request {
  return new Request('http://localhost:3000/api/v1/bookings/quote', { method: 'POST',
    headers: { authorization: 'Bearer test-session', 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
function hold(overrides: Record<string, unknown> = {}) {
  return { id: holdId, listing_id: listingId, seeker_id: renter, lister_id: host, kind: 'hold', status: 'confirmed', currency: 'NGN',
    amount_kobo: BigInt(2000000), settlement_status: 'unsettled', expires_at: new Date('2030-01-02T12:00:00.000Z'),
    starts_at: new Date(period.startsAt), ends_at: new Date(period.endsAt), allocated_hold_credit: null,
    payments: [{ user_id: renter, status: 'succeeded', amount_kobo: BigInt(2000000), currency: 'NGN', paid_at: new Date(now) }], ...overrides }
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  mocks.identity.mockResolvedValue({ userId: renter, mode: 'bearer' })
  mocks.listing.mockResolvedValue({ id: listingId, lister_id: host, category: 'car', base_rent_amount: '30000.01',
    asset_metadata: { pricePeriod: 'day', agencyFee: '10.25', cautionFee: '0' } })
  mocks.hold.mockResolvedValue(hold())
})
afterEach(() => { vi.useRealTimers() })

it('quotes exact server prices and fees as integer kobo strings without allocating or reserving anything', async () => {
  const response = await quote(request(input))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, data: { currency: 'NGN', period: 'day', days: 1,
    baseKobo: '3000001', fees: [{ label: 'Agency fee', amountKobo: '1025' }], totalKobo: '3001026', holdCreditKobo: '0', payableKobo: '3001026' } })
  expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { platform: true, mutation: true, verified: true })
  expect(mocks.listing).toHaveBeenCalledExactlyOnceWith({ where: { id: listingId, listing_status: 'active' },
    select: { id: true, lister_id: true, category: true, base_rent_amount: true, asset_metadata: true } })
  expect(mocks.hold).not.toHaveBeenCalled()
})

it.each([{ kind: 'inspection', total: '300000' }, { kind: 'hold', total: '6000000' }])('uses shared fixed $kind pricing', async ({ kind, total }) => {
  const response = await quote(request({ ...input, kind, holdDays: 3 }))
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({ period: 'fixed', totalKobo: total, payableKobo: total, fees: [] })
})

it('previews a paid own hold against exact matching rental dates without committing the allocation', async () => {
  const response = await quote(request({ ...input, holdBookingId: holdId }))
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({ holdBookingId: holdId, holdCreditKobo: '2000000', payableKobo: '1001026' })
  expect(mocks.hold).toHaveBeenCalledExactlyOnceWith({ where: { id: holdId, seeker_id: renter }, include: { payments: true, allocated_hold_credit: true } })
})

it.each([
  { allocated_hold_credit: { rental_booking_id: listingId } }, { listing_id: holdId }, { seeker_id: host },
  { starts_at: new Date('2030-01-02T09:00:00.000Z') }, { expires_at: new Date('2030-01-01T09:00:00.000Z') },
  { payments: [] }, { payments: [{ user_id: renter, status: 'requires_review', amount_kobo: BigInt(2000000), currency: 'NGN', paid_at: new Date(now) }] },
])('rejects an allocated, mismatched, expired or unconfirmed holding credit, case %#', async overrides => {
  mocks.hold.mockResolvedValue(hold(overrides))
  const response = await quote(request({ ...input, holdBookingId: holdId }))
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ success: false, code: 'BOOKING_UNAVAILABLE' })
})

it('returns the same generic credit failure for a missing or foreign hold', async () => {
  mocks.hold.mockResolvedValue(null)
  expect((await quote(request({ ...input, holdBookingId: holdId }))).status).toBe(409)
})

it.each([{ ...input, amountKobo: '1' }, { ...input, seekerId: host }, { ...input, kind: 'hold', holdBookingId: holdId },
  { ...input, endsAt: period.startsAt }, { ...input, holdDays: 8 }])('rejects client prices, actors and malformed periods before any reads: %j', async body => {
  expect((await quote(request(body))).status).toBe(400)
  expect(mocks.listing).not.toHaveBeenCalled()
  expect(mocks.hold).not.toHaveBeenCalled()
})

it('requires authentication and an enabled platform before reading listing prices', async () => {
  mocks.identity.mockRejectedValue(new ApiError(503, 'PLATFORM_UNAVAILABLE', 'Unavailable'))
  expect((await quote(request(input))).status).toBe(503)
  expect(mocks.listing).not.toHaveBeenCalled()
})

it('rejects past dates, self bookings, sale rentals and missing listings through shared policies', async () => {
  expect((await quote(request({ ...input, startsAt: '2029-01-01T10:00:00.000Z', endsAt: '2029-01-02T10:00:00.000Z' }))).status).toBe(409)
  mocks.listing.mockResolvedValueOnce({ id: listingId, lister_id: renter, category: 'car', base_rent_amount: '30000.01', asset_metadata: {} })
  expect((await quote(request(input))).status).toBe(409)
  mocks.listing.mockResolvedValueOnce({ id: listingId, lister_id: host, category: 'car', base_rent_amount: '30000.01', asset_metadata: { rentalIntent: 'buy' } })
  expect((await quote(request(input))).status).toBe(409)
  mocks.listing.mockResolvedValueOnce(null)
  expect((await quote(request(input))).status).toBe(404)
})
