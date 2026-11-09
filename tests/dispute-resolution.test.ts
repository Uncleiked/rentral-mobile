import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ lock: vi.fn(), permission: vi.fn(), report: vi.fn(), otherReport: vi.fn(), booking: vi.fn(), updateBooking: vi.fn(), updateReport: vi.fn(),
  available: vi.fn(), otherHold: vi.fn(), expire: vi.fn(), creditReview: vi.fn(), fundsReserved: vi.fn(), audit: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertLifecycleReady: async () => undefined }))
vi.mock('@/lib/auth/roles', () => ({ assertStaffPermission: mocks.permission }))
vi.mock('@/lib/bookings/availability', () => ({ bookingWindowAvailable: mocks.available }))
vi.mock('@/lib/bookings/service', () => ({ expireListingReservations: mocks.expire, otherConfirmedHold: mocks.otherHold }))
vi.mock('@/lib/bookings/hold-credit', () => ({ reviewHoldCredit: mocks.creditReview }))
vi.mock('@/lib/payments/allocations', () => ({ bookingFundsReserved: mocks.fundsReserved }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({
  dispute: { findUnique: mocks.report, findFirst: mocks.otherReport, updateMany: mocks.updateReport },
  booking: { findUnique: mocks.booking, update: mocks.updateBooking }, adminAudit: { create: mocks.audit }, notification: { createMany: mocks.notify },
}) }))
import { resolveBookingDispute } from '@/lib/lifecycle/disputes'
const reason = 'A documented independent review of all submitted evidence.'
function booking() { return { id: 'booking', listing_id: 'listing', seeker_id: 'renter', lister_id: 'host', status: 'disputed', kind: 'rental',
  ends_at: new Date('2030-02-01T10:00:00Z'), settlement_status: 'unsettled', expires_at: null, hold_credit_kobo: BigInt(0),
  seeker_checked_in_at: null, lister_checked_in_at: null, payments: [{ status: 'succeeded' }] } }
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime('2030-01-01T10:00:00Z')
  mocks.lock.mockResolvedValue(true); mocks.permission.mockResolvedValue(undefined)
  mocks.booking.mockResolvedValue({ listing_id: 'listing' }); mocks.report.mockResolvedValue({ id: 'report', booking_id: 'booking', status: 'open', booking: booking() })
  mocks.otherReport.mockResolvedValue(null); mocks.updateReport.mockResolvedValue({ count: 1 })
  mocks.available.mockResolvedValue(true); mocks.otherHold.mockResolvedValue(null); mocks.fundsReserved.mockResolvedValue(false)
})
afterEach(() => { vi.useRealTimers() })

it('requires an explicit outcome and independent current-role staff before changing a reservation', async () => {
  await expect(resolveBookingDispute('staff', 'report', { reason })).rejects.toThrow()
  await expect(resolveBookingDispute('renter', 'report', { decision: 'cancel', reason })).rejects.toThrow('independent')
  mocks.permission.mockRejectedValue(new Error('Staff access required.'))
  await expect(resolveBookingDispute('staff', 'report', { decision: 'cancel', reason })).rejects.toThrow('Staff access')
  expect(mocks.updateBooking).not.toHaveBeenCalled(); expect(mocks.updateReport).not.toHaveBeenCalled()
})
it('restores only a paid eligible reservation with no reserved finance or overlapping occupancy', async () => {
  await resolveBookingDispute('staff', 'report', { decision: 'resume', reason })
  expect(mocks.lock.mock.calls.slice(0, 3).map(call => call[1])).toEqual(['listing', 'booking', 'dispute'])
  expect(mocks.fundsReserved).toHaveBeenCalledExactlyOnceWith(expect.any(Object), 'booking')
  expect(mocks.updateBooking).toHaveBeenCalledExactlyOnceWith({ where: { id: 'booking' }, data: { status: 'confirmed' } })
  expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'resolve_dispute_resume', metadata: expect.objectContaining({ moneyMoved: false, bookingDecisionApplied: true }) }) })
})
it.each(['funds', 'overlap', 'receipt', 'settlement'])('does not restore a booking blocked by %s', async missing => {
  if (missing === 'funds') mocks.fundsReserved.mockResolvedValue(true)
  if (missing === 'overlap') mocks.available.mockResolvedValue(false)
  if (missing === 'receipt') mocks.report.mockResolvedValue({ id: 'report', booking_id: 'booking', status: 'open', booking: { ...booking(), payments: [] } })
  if (missing === 'settlement') mocks.report.mockResolvedValue({ id: 'report', booking_id: 'booking', status: 'open', booking: { ...booking(), settlement_status: 'requires_review' } })
  await expect(resolveBookingDispute('staff', 'report', { decision: 'resume', reason })).rejects.toThrow()
  expect(mocks.updateBooking).not.toHaveBeenCalled(); expect(mocks.updateReport).not.toHaveBeenCalled()
})
it('keeps the booking disputed when another report remains open and records that no booking decision was applied', async () => {
  mocks.otherReport.mockResolvedValue({ id: 'another-report' })
  await resolveBookingDispute('staff', 'report', { decision: 'cancel', reason })
  expect(mocks.updateBooking).not.toHaveBeenCalled()
  expect(mocks.updateReport).toHaveBeenCalledWith({ where: { id: 'report', status: 'open' }, data: expect.objectContaining({ status: 'resolved', booking_resolution: 'cancel', resolved_by: 'staff' }) })
  expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ metadata: expect.objectContaining({ nextStatus: 'disputed', bookingDecisionApplied: false, moneyMoved: false }) }) })
})
it('cancels a paid reservation into financial review and preserves immutable payment/ledger history', async () => {
  mocks.report.mockResolvedValue({ id: 'report', booking_id: 'booking', status: 'open', booking: { ...booking(), hold_credit_kobo: BigInt(100) } })
  await resolveBookingDispute('staff', 'report', { decision: 'cancel', reason })
  expect(mocks.creditReview).toHaveBeenCalledWith(expect.any(Object), 'booking')
  expect(mocks.updateBooking).toHaveBeenCalledExactlyOnceWith({ where: { id: 'booking' }, data: { status: 'cancelled', settlement_status: 'requires_review' } })
})
