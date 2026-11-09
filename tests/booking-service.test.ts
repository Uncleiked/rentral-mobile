import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), raw: vi.fn(), proximity: vi.fn(), conflicting: vi.fn(), findBooking: vi.fn(), hold: vi.fn(), expiredHolds: vi.fn(), uniqueBooking: vi.fn(), updateBooking: vi.fn(), updateMany: vi.fn(), findListing: vi.fn(), createBooking: vi.fn(), notify: vi.fn(), findMany: vi.fn() }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work), lockRecord: async (_tx: unknown, model: string, id: string) => { mocks.raw(model, id); return true } }))
vi.mock('@/lib/listings/spatial', () => ({ listingProximity: mocks.proximity }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction, booking: { findMany: mocks.findMany, findFirst: mocks.findBooking, updateMany: mocks.updateMany } } }))
import { changeBookingStatus, checkInBooking, getBookingsForUser, requestBooking, paidBookingExpiry } from '@/lib/bookings/service'

const bookingId = '4560dc65-027d-490f-bd8e-ea3c71de8943', listingId = 'ac0d4d98-3858-4bbb-9440-14a080ab6e2c'
const now = new Date()
const baseBooking = { id: bookingId, listing_id: listingId, seeker_id: 'seeker', lister_id: 'host', kind: 'inspection', status: 'confirmed',
  starts_at: now, ends_at: new Date(now.getTime() - 1000), seeker_checked_in_at: null, lister_checked_in_at: null,
  handshake_code_hash: createHash('sha256').update(`${bookingId}:123456`).digest('hex'), payments: [] }
const location = { latitude: 6.45, longitude: 3.4, accuracy: 10, capturedAt: now.toISOString() }

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
  mocks.findBooking.mockResolvedValue({ ...baseBooking })
  mocks.uniqueBooking.mockResolvedValue({ ...baseBooking })
  mocks.raw.mockResolvedValue([{ nearby: true }])
  mocks.proximity.mockResolvedValue(true)
  mocks.conflicting.mockResolvedValue(null)
  mocks.hold.mockResolvedValue(null)
  mocks.expiredHolds.mockResolvedValue([])
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    booking: { findMany: (args: { where: { kind?: string } }) => args.where.kind === 'hold' ? mocks.expiredHolds(args) : Promise.resolve([]), findFirst: (args: { where: { kind?: unknown } }) => args.where.kind === 'hold' ? mocks.hold(args) : typeof args.where.kind === 'object' ? mocks.conflicting(args) : mocks.findBooking(args), findUniqueOrThrow: mocks.uniqueBooking, update: mocks.updateBooking, updateMany: mocks.updateMany, create: mocks.createBooking },
    listing: { findFirst: mocks.findListing }, notification: { create: mocks.notify, findUnique: vi.fn(async () => null), upsert: mocks.notify },
  }))
})
afterEach(() => vi.unstubAllEnvs())

describe('reservation authorization and presence', () => {
  it('does not query new tables while the staged platform is disabled', async () => {
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
    expect(await getBookingsForUser('seeker')).toEqual([])
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
  it('scopes list reads to either participant', async () => {
    mocks.findMany.mockResolvedValue([])
    await getBookingsForUser('seeker')
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ seeker_id: 'seeker' }, { lister_id: 'seeker' }] } }))
  })
  it('rejects own-asset booking before creating rows', async () => {
    mocks.findListing.mockResolvedValue({ id: listingId, lister_id: 'seeker', category: 'car', base_rent_amount: { toString: () => '50000' } })
    await expect(requestBooking('seeker', { listingId, kind: 'rental', startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() })).rejects.toThrow('own listing')
    expect(mocks.createBooking).not.toHaveBeenCalled()
  })
  it('creates a real booking request without requiring KYC from either participant', async () => {
    mocks.findListing.mockImplementation(async (query: { where: { lister?: unknown } }) => query.where.lister
      ? null : { id: listingId, lister_id: 'host-without-kyc', category: 'car', base_rent_amount: { toString: () => '50000' }, asset_metadata: { pricePeriod: 'day' } })
    mocks.createBooking.mockResolvedValue({ id: 'requested-without-kyc' })
    const firstDay = Date.now() + 3600000
    const startsAt = new Date(firstDay).toISOString()
    const endsAt = new Date(firstDay + 86400000).toISOString()
    expect(await requestBooking('renter-without-kyc', { listingId, kind: 'rental', startsAt, endsAt })).toBe('requested-without-kyc')
    expect(mocks.createBooking).toHaveBeenCalledWith({ data: expect.objectContaining({
      seeker_id: 'renter-without-kyc', lister_id: 'host-without-kyc', kind: 'rental', amount_kobo: BigInt(5000000),
    }) })
    expect(mocks.notify).toHaveBeenCalledWith({ data: expect.objectContaining({ user_id: 'host-without-kyc', kind: 'booking_requested' }) })
  })
  it('blocks other renters inspection requests globally during a live paid hold', async () => {
    mocks.findListing.mockResolvedValue({ id: listingId, lister_id: 'host', category: 'car', base_rent_amount: { toString: () => '50000' } })
    mocks.hold.mockResolvedValue({ id: 'held-by-someone-else', expires_at: new Date(Date.now() + 86400000) })
    await expect(requestBooking('seeker', { listingId, kind: 'inspection', startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString() })).rejects.toThrow('active hold')
    expect(mocks.createBooking).not.toHaveBeenCalled()
    expect(mocks.hold).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ listing_id: listingId, seeker_id: { not: 'seeker' }, kind: 'hold', OR: expect.arrayContaining([{ status: 'confirmed' }]) }) }))
  })
  it('uses the purchased hold duration for the server deadline', () => {
    const before = Date.now()
    const expiry = paidBookingExpiry('hold', { period: 'fixed', days: 1, baseKobo: '6000000', fees: [], totalKobo: '6000000', holdDays: 3 })
    expect(expiry?.getTime()).toBeGreaterThanOrEqual(before + 3 * 86400000)
    expect(paidBookingExpiry('rental')).toBeNull()
  })
  it('opportunistically expires paid holds into settlement review and deduplicated participant notices', async () => {
    mocks.findListing.mockResolvedValue({ id: listingId, lister_id: 'host', category: 'car', base_rent_amount: { toString: () => '50000' } })
    mocks.expiredHolds.mockResolvedValue([{ id: 'expired-hold', seeker_id: 'previous-renter', lister_id: 'host' }])
    mocks.createBooking.mockResolvedValue({ id: 'new-request' })
    await requestBooking('seeker', { listingId, kind: 'inspection', startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString() })
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'confirmed', kind: 'hold' }), data: { status: 'expired', settlement_status: 'requires_review' } }))
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupe_key: 'hold-expired:expired-hold:previous-renter' }, create: expect.objectContaining({ user_id: 'previous-renter' }) }))
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ where: { dedupe_key: 'hold-expired:expired-hold:host' }, create: expect.objectContaining({ user_id: 'host' }) }))
  })
  it('prevents the generic complete transition from bypassing inspection presence checks', async () => {
    await expect(changeBookingStatus('host', bookingId, 'complete')).rejects.toThrow('both participants')
    expect(mocks.updateBooking).not.toHaveBeenCalled()
  })
  it('does not accept a rental over another active or disputed reservation', async () => {
    mocks.uniqueBooking.mockResolvedValue({ ...baseBooking, kind: 'rental', status: 'requested',
      starts_at: new Date(Date.now() + 86400000), ends_at: new Date(Date.now() + 2 * 86400000), pricing_snapshot: {} })
    mocks.findListing.mockResolvedValue({ id: listingId })
    mocks.conflicting.mockResolvedValue({ id: 'existing-reservation' })
    await expect(changeBookingStatus('host', bookingId, 'accept')).rejects.toThrow('overlap')
    expect(mocks.raw.mock.calls.slice(0, 2)).toEqual([['listing', listingId], ['booking', bookingId]])
    expect(mocks.updateBooking).not.toHaveBeenCalled()
  })
  it('records one participant without completing the inspection', async () => {
    await checkInBooking('seeker', bookingId, location)
    expect(mocks.updateBooking).toHaveBeenCalledWith({ where: { id: bookingId }, data: { seeker_checked_in_at: expect.any(Date) } })
  })
  it('requires OTP and fresh other-participant proximity before completing', async () => {
    mocks.findBooking.mockResolvedValue({ ...baseBooking, seeker_checked_in_at: new Date() })
    await expect(checkInBooking('host', bookingId, { ...location, code: '654321' })).rejects.toThrow('six-digit')
    expect(mocks.updateBooking).not.toHaveBeenCalled()
    await checkInBooking('host', bookingId, { ...location, code: '123456' })
    expect(mocks.updateBooking).toHaveBeenCalledWith({ where: { id: bookingId }, data: expect.objectContaining({ status: 'completed', handshake_code_hash: null, lister_checked_in_at: expect.any(Date) }) })
  })
  it('never completes with stale other-device evidence', async () => {
    mocks.findBooking.mockResolvedValue({ ...baseBooking, seeker_checked_in_at: new Date(Date.now() - 16 * 60000) })
    await checkInBooking('host', bookingId, { ...location, code: '123456' })
    expect(mocks.updateBooking).toHaveBeenCalledWith({ where: { id: bookingId }, data: { lister_checked_in_at: expect.any(Date) } })
  })
  it('rejects old client location samples before database access', async () => {
    await expect(checkInBooking('seeker', bookingId, { ...location, capturedAt: new Date(Date.now() - 180000).toISOString() })).rejects.toThrow('too old')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects a location outside 20 metres and does not return coordinates', async () => {
    mocks.proximity.mockResolvedValue(false)
    await expect(checkInBooking('seeker', bookingId, location)).rejects.toThrow('20 metres')
    expect(mocks.updateBooking).not.toHaveBeenCalled()
  })
})
