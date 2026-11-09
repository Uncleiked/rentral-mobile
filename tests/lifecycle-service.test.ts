import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ ready: vi.fn(), lock: vi.fn(), active: vi.fn(), permission: vi.fn(), prepare: vi.fn(), claim: vi.fn(), available: vi.fn(), expire: vi.fn(),
  booking: vi.fn(), updateBooking: vi.fn(), otherBooking: vi.fn(), renewal: vi.fn(), activeRenewal: vi.fn(), createRenewal: vi.fn(), updateRenewal: vi.fn(),
  termination: vi.fn(), activeTermination: vi.fn(), createTermination: vi.fn(), updateTermination: vi.fn(), report: vi.fn(), audit: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertLifecycleReady: mocks.ready }))
vi.mock('@/lib/db', () => ({ default: {} }))
vi.mock('@/lib/auth/roles', () => ({ assertStaffPermission: mocks.permission }))
vi.mock('@/lib/storage-claims/service', () => ({ prepareListingStorage: mocks.prepare, claimStorageObjects: mocks.claim }))
vi.mock('@/lib/bookings/availability', () => ({ bookingWindowAvailable: mocks.available }))
vi.mock('@/lib/bookings/service', () => ({ expireListingReservations: mocks.expire }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({
  user: { updateMany: mocks.active },
  booking: { findUnique: mocks.booking, findFirst: mocks.otherBooking, update: mocks.updateBooking },
  renewal: { findUnique: mocks.renewal, findFirst: mocks.activeRenewal, create: mocks.createRenewal, update: mocks.updateRenewal },
  leaseTermination: { findUnique: mocks.termination, findFirst: mocks.activeTermination, create: mocks.createTermination, update: mocks.updateTermination },
  dispute: { findFirst: mocks.report }, adminAudit: { create: mocks.audit }, notification: { create: mocks.notify, createMany: mocks.notify },
}) }))
import { requestRenewal, confirmRenewal, reviewRenewal, requestTermination, confirmTermination, reviewTermination, releaseTermination, lifecycleAccountClosureBlocked } from '@/lib/lifecycle/service'
import type { Prisma } from '@prisma/client'

const id = 'c7af3d50-a016-475d-8e51-23fd04989436', listingId = '2ca8c61b-ffac-4200-bcba-a7387d0324ac'
const requestId = '55bfc098-ff33-4fdd-b7ae-68d810a74050'
const now = new Date('2030-01-10T10:00:00Z'), endsAt = new Date('2030-02-01T10:00:00Z'), nextEnd = new Date('2031-02-01T10:00:00Z')
const reviewInput = { decision: 'approve', reason: 'A documented independent review of the supporting evidence.' }
function lease() { return { id, listing_id: listingId, seeker_id: 'renter', lister_id: 'host', kind: 'rental', status: 'confirmed',
  starts_at: new Date('2029-02-01T10:00:00Z'), ends_at: endsAt, listing: { category: 'house' } } }
function renewal() { return { id: requestId, booking_id: id, user_id: 'renter', status: 'pending_review', original_ends_at: endsAt, requested_ends_at: nextEnd,
  evidence_path: 'renter/folder/receipt.pdf', host_confirmed_at: now, host_confirmed_by: 'host' } }
function termination() { return { id: requestId, booking_id: id, requested_by: 'renter', status: 'pending_review', original_ends_at: endsAt,
  requested_end_at: new Date('2030-01-15T10:00:00Z'), evidence_path: 'renter/folder/agreement.pdf', counterparty_decision: 'accepted',
  counterparty_decided_at: now, reviewed_by: 'staff', reviewed_at: now } }
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  mocks.lock.mockResolvedValue(true); mocks.ready.mockResolvedValue(undefined); mocks.permission.mockResolvedValue(undefined)
  mocks.active.mockResolvedValue({ count: 1 })
  mocks.prepare.mockResolvedValue([{ id: 'prepared-evidence' }]); mocks.claim.mockResolvedValue(undefined)
  mocks.available.mockResolvedValue(true); mocks.expire.mockResolvedValue(undefined)
  mocks.booking.mockResolvedValue(lease()); mocks.renewal.mockResolvedValue(renewal()); mocks.termination.mockResolvedValue(termination())
  mocks.activeRenewal.mockResolvedValue(null); mocks.activeTermination.mockResolvedValue(null); mocks.report.mockResolvedValue(null); mocks.otherBooking.mockResolvedValue(null)
  mocks.createRenewal.mockResolvedValue({ id: requestId }); mocks.createTermination.mockResolvedValue({ id: requestId })
})
afterEach(() => { vi.useRealTimers() })

it('denies a new extension after either account closes while retaining early termination of an existing lease', async () => {
  mocks.active.mockResolvedValue({ count: 0 })
  await expect(requestRenewal('renter', { bookingId: id, reference: 'External-reference-1', recipientRoute: 'direct_landlord', requestedEndsAt: nextEnd.toISOString(), evidencePath: 'renter/folder/receipt.pdf' })).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
  expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.createRenewal).not.toHaveBeenCalled()
  await requestTermination('renter', { bookingId: id, requestedEndAt: '2030-01-15T10:00:00Z', reason: 'An existing obligation can still be ended safely.', evidencePath: 'renter/folder/agreement.pdf' })
  expect(mocks.createTermination).toHaveBeenCalledOnce()
})
it('checks pending lifecycle obligations within a caller-owned account-closure transaction', async () => {
  const tx = { renewal: { findFirst: mocks.activeRenewal }, leaseTermination: { findFirst: mocks.activeTermination } } as unknown as Prisma.TransactionClient
  expect(await lifecycleAccountClosureBlocked(tx, 'renter')).toBe(false)
  mocks.activeRenewal.mockResolvedValue({ id: requestId })
  expect(await lifecycleAccountClosureBlocked(tx, 'renter')).toBe(true)
  mocks.activeRenewal.mockResolvedValue(null); mocks.activeTermination.mockResolvedValue({ id: requestId })
  expect(await lifecycleAccountClosureBlocked(tx, 'renter')).toBe(true)
  expect(mocks.activeTermination).toHaveBeenCalledWith({ where: { booking: { OR: [{ seeker_id: 'renter' }, { lister_id: 'renter' }] }, status: { in: ['pending_counterparty', 'pending_review', 'approved'] } }, select: { id: true } })
})

it('prepares real owned evidence outside retries, claims it with the request, and preserves the original paid booking', async () => {
  const input = { bookingId: id, reference: 'External-reference-1', recipientRoute: 'direct_landlord', requestedEndsAt: nextEnd.toISOString(), evidencePath: 'renter/folder/receipt.pdf' }
  expect(await requestRenewal('renter', input)).toBe(requestId)
  expect(mocks.createRenewal).toHaveBeenCalledWith({ data: expect.objectContaining({ user_id: 'renter', original_ends_at: endsAt, requested_ends_at: nextEnd, status: 'pending_counterparty' }) })
  expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.lock.mock.invocationCallOrder[0])
  expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(mocks.createRenewal.mock.invocationCallOrder[0])
  expect(mocks.updateBooking).not.toHaveBeenCalled()
  await expect(requestRenewal('host', input)).rejects.toThrow('your residential')
  await expect(requestRenewal('renter', { ...input, approvedBy: 'staff' })).rejects.toThrow()
})

it('requires the host and complete current dates before counterparty confirmation', async () => {
  mocks.renewal.mockResolvedValue({ ...renewal(), status: 'pending_counterparty' })
  await confirmRenewal('host', requestId, { decision: 'accept', reason: 'I agree to this proposed extension.' })
  expect(mocks.updateRenewal).toHaveBeenCalledWith({ where: { id: requestId }, data: { status: 'pending_review', host_confirmed_at: now, host_confirmed_by: 'host' } })
  expect(mocks.updateBooking).not.toHaveBeenCalled()
  await expect(confirmRenewal('renter', requestId, { decision: 'accept', reason: 'I agree to this proposed extension.' })).rejects.toThrow('Only the host')
  mocks.renewal.mockResolvedValue({ ...renewal(), status: 'pending_counterparty', requested_ends_at: null })
  await expect(confirmRenewal('host', requestId, { decision: 'accept', reason: 'I agree to this proposed extension.' })).rejects.toThrow('lease dates changed')
})

it('completes a legacy incomplete renewal only for the same owner and original reference', async () => {
  mocks.activeRenewal.mockResolvedValue({ id: requestId, user_id: 'renter', reference: 'External-reference-1', original_ends_at: null, requested_ends_at: null, evidence_path: null })
  const input = { bookingId: id, reference: 'External-reference-1', recipientRoute: 'direct_landlord', requestedEndsAt: nextEnd.toISOString(), evidencePath: 'renter/folder/receipt.pdf' }
  expect(await requestRenewal('renter', input)).toBe(requestId)
  expect(mocks.createRenewal).not.toHaveBeenCalled()
  expect(mocks.updateRenewal).toHaveBeenCalledWith({ where: { id: requestId }, data: expect.objectContaining({ status: 'pending_counterparty', host_confirmed_at: null, requested_ends_at: nextEnd }) })
  await expect(requestRenewal('renter', { ...input, reference: 'A-different-reference' })).rejects.toThrow('original reference')
})

it('extends only dates/status under listing/booking/request locks after role, counterparty and overlap checks', async () => {
  await reviewRenewal('staff', requestId, reviewInput)
  expect(mocks.lock.mock.calls.slice(0, 3).map(call => call[1])).toEqual(['listing', 'booking', 'renewal'])
  expect(mocks.permission).toHaveBeenCalledWith(expect.any(Object), 'staff', 'renewal:review')
  expect(mocks.available).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ id, ends_at: nextEnd }))
  expect(mocks.updateBooking).toHaveBeenCalledExactlyOnceWith({ where: { id }, data: { ends_at: nextEnd, status: 'confirmed' } })
  expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actor_id: 'staff', action: 'renewal_approve' }) })
})

it.each(['role', 'self', 'stale', 'host', 'overlap', 'legacy'])('refuses renewal approval missing %s without altering lease dates', async missing => {
  let actor = 'staff'
  if (missing === 'role') mocks.permission.mockRejectedValue(new Error('Staff access required.'))
  if (missing === 'self') actor = 'host'
  if (missing === 'stale') mocks.renewal.mockResolvedValue({ ...renewal(), original_ends_at: new Date('2030-01-31T10:00:00Z') })
  if (missing === 'host') mocks.renewal.mockResolvedValue({ ...renewal(), host_confirmed_at: null })
  if (missing === 'overlap') mocks.available.mockResolvedValue(false)
  if (missing === 'legacy') mocks.renewal.mockResolvedValue({ ...renewal(), evidence_path: null, requested_ends_at: null })
  await expect(reviewRenewal(actor, requestId, reviewInput)).rejects.toThrow()
  expect(mocks.updateBooking).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
})

it('records termination evidence while preserving lease dates until reviewed effective release', async () => {
  expect(await requestTermination('renter', { bookingId: id, requestedEndAt: '2030-01-15T10:00:00Z', reason: 'We are requesting a mutually agreed early lease end.', evidencePath: 'renter/folder/agreement.pdf' })).toBe(requestId)
  expect(mocks.createTermination).toHaveBeenCalledWith({ data: expect.objectContaining({ requested_by: 'renter', original_ends_at: endsAt }) })
  expect(mocks.claim).toHaveBeenCalled(); expect(mocks.updateBooking).not.toHaveBeenCalled()
})

it('requires the other participant agreement and independent current-role staff review', async () => {
  mocks.termination.mockResolvedValue({ ...termination(), status: 'pending_counterparty' })
  await expect(confirmTermination('renter', requestId, { decision: 'accept', reason: 'I agree to the proposed lease end.' })).rejects.toThrow('other lease participant')
  await confirmTermination('host', requestId, { decision: 'accept', reason: 'I agree to the proposed lease end.' })
  expect(mocks.updateTermination).toHaveBeenCalledWith({ where: { id: requestId }, data: expect.objectContaining({ counterparty_decision: 'accepted', status: 'pending_review' }) })
  mocks.termination.mockResolvedValue(termination())
  await reviewTermination('staff', requestId, reviewInput)
  expect(mocks.permission).toHaveBeenCalledWith(expect.any(Object), 'staff', 'termination:review')
  expect(mocks.updateBooking).not.toHaveBeenCalled()
})

it('does not release inventory before the agreed date or while a report/current other lease exists', async () => {
  mocks.termination.mockResolvedValue({ ...termination(), status: 'approved' })
  expect(await releaseTermination(requestId)).toBe(false)
  vi.setSystemTime('2030-01-20T10:00:00Z')
  mocks.report.mockResolvedValue({ id: 'open-report' })
  expect(await releaseTermination(requestId)).toBe(false)
  mocks.report.mockResolvedValue(null); mocks.otherBooking.mockResolvedValue({ id: 'another-active-lease' })
  expect(await releaseTermination(requestId)).toBe(false)
  expect(mocks.updateBooking).not.toHaveBeenCalled()
})

it('releases only an effective reviewed agreement, preserving listing status and every financial field', async () => {
  mocks.termination.mockResolvedValue({ ...termination(), status: 'approved' }); vi.setSystemTime('2030-01-20T10:00:00Z')
  expect(await releaseTermination(requestId)).toBe(true)
  expect(mocks.updateBooking).toHaveBeenCalledExactlyOnceWith({ where: { id }, data: { ends_at: new Date('2030-01-15T10:00:00Z'), status: 'completed' } })
  expect(mocks.updateTermination).toHaveBeenCalledWith({ where: { id: requestId }, data: { status: 'released', released_at: new Date('2030-01-20T10:00:00Z') } })
  expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'termination_effective_release' }) })
})
