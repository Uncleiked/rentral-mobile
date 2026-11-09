import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BookingView } from '@/lib/bookings/service'

const mocks = vi.hoisted(() => ({
  identity: vi.fn(), participant: vi.fn(), activeHold: vi.fn(), change: vi.fn(), checkIn: vi.fn(), code: vi.fn(),
  startPayment: vi.fn(), reconcile: vi.fn(), paymentReference: vi.fn(), paymentsEnabled: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/bookings/service', () => ({
  getBookingForParticipant: mocks.participant, getOwnActiveHold: mocks.activeHold, changeBookingStatus: mocks.change,
  checkInBooking: mocks.checkIn, issueHandshakeCode: mocks.code,
}))
vi.mock('@/lib/payments/service', () => ({ startBookingPayment: mocks.startPayment, reconcilePayment: mocks.reconcile }))
vi.mock('@/lib/payments/config', () => ({ paymentsEnabled: mocks.paymentsEnabled }))
vi.mock('@/lib/db', () => ({ default: { paymentIntent: { findFirst: mocks.paymentReference } } }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { ApiError } from '@/lib/api/http'
import { publicBooking, apiBookingQuoteSchema } from '@/lib/api/bookings'
import { BookingError } from '@/lib/bookings/policy'
import { GET as getBooking, PATCH as patchBooking } from '@/app/api/v1/bookings/[id]/route'
import { GET as getHold } from '@/app/api/v1/bookings/active-hold/route'
import { POST as checkIn } from '@/app/api/v1/bookings/[id]/check-in/route'
import { POST as issueCode } from '@/app/api/v1/bookings/[id]/handshake-code/route'
import { POST as checkout } from '@/app/api/v1/bookings/[id]/checkout/route'
import { POST as reconcile } from '@/app/api/v1/bookings/[id]/reconcile/route'

const renter = '55bfc098-ff33-4fdd-b7ae-68d810a74050'
const host = '52db23e2-fb48-4cf7-9dfc-06e3c96c301f'
const listingId = 'c7af3d50-a016-475d-8e51-23fd04989436'
const bookingId = '2ca8c61b-ffac-4200-bcba-a7387d0324ac'
const paymentId = 'bd90f07c-d628-42cd-bfa6-4228387d7510'
const reference = `rentral-${paymentId}`
const now = '2030-01-01T10:00:00.000Z'
const context = { params: Promise.resolve({ id: bookingId }) }
function booking(overrides: Partial<BookingView> = {}): BookingView {
  return {
    id: bookingId, listing_id: listingId, seeker_id: renter, lister_id: host, kind: 'inspection', status: 'confirmed',
    starts_at: '2030-01-01T11:00:00.000Z', ends_at: '2030-01-01T12:00:00.000Z', expires_at: null,
    amount_kobo: '300000', hold_credit_kobo: '0', currency: 'NGN', settlement_status: 'unsettled', createdAt: now,
    pricing_snapshot: { period: 'fixed', days: 1, baseKobo: '300000', fees: [], totalKobo: '300000' },
    rental_hold_credit: null, allocated_hold_credit: null, seeker_checked_in_at: null, lister_checked_in_at: null,
    listing: { category: 'house', text_address: 'Private building 77, Lekki Phase 1, Lagos' },
    seeker: { username: 'member' }, lister: { username: 'host' }, payments: [], ...overrides,
  }
}
function request(path: string, method = 'POST', body?: unknown): Request {
  return new Request(`http://localhost:3000/api/v1/bookings${path}`, {
    method, headers: { authorization: 'Bearer test-session', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers(); vi.setSystemTime(now)
  mocks.identity.mockResolvedValue({ userId: renter, mode: 'bearer' })
  mocks.participant.mockResolvedValue(booking())
  mocks.activeHold.mockResolvedValue(null)
  mocks.change.mockResolvedValue(undefined); mocks.checkIn.mockResolvedValue(undefined)
  mocks.code.mockResolvedValue('654321')
  mocks.paymentsEnabled.mockReturnValue(true)
  mocks.paymentReference.mockResolvedValue({ id: paymentId })
  mocks.startPayment.mockResolvedValue('https://checkout.paystack.com/test-checkout')
  mocks.reconcile.mockResolvedValue('succeeded')
})
afterEach(() => { vi.useRealTimers() })

it('rejects unauthenticated booking reads and writes before domain services run', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'A valid sign-in is required.'))
  const responses = await Promise.all([
    getBooking(request(`/${bookingId}`, 'GET'), context), getHold(request(`/active-hold?listingId=${listingId}`, 'GET')),
    patchBooking(request(`/${bookingId}`, 'PATCH', { operation: 'cancel' }), context),
    checkIn(request(`/${bookingId}/check-in`, 'POST', {}), context), issueCode(request(`/${bookingId}/handshake-code`), context),
    checkout(request(`/${bookingId}/checkout`), context), reconcile(request(`/${bookingId}/reconcile`, 'POST', { reference }), context),
  ])
  for (const response of responses) {
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  }
  for (const operation of [mocks.participant, mocks.activeHold, mocks.change, mocks.checkIn, mocks.code, mocks.startPayment, mocks.reconcile]) expect(operation).not.toHaveBeenCalled()
})

it('returns an allowlisted string-only DTO with shared-policy capabilities and no precise address or actor IDs', async () => {
  const response = await getBooking(request(`/${bookingId}`, 'GET'), context)
  expect(response.status).toBe(200)
  const output = await response.json()
  expect(output.data).toMatchObject({ amountKobo: '300000', payableKobo: '300000', startsAt: '2030-01-01T11:00:00.000Z', role: 'renter',
    listing: { id: listingId, location: 'Lekki, Lagos' }, quote: { totalKobo: '300000' }, actions: { checkIn: true, issueCode: true, complete: false }, paymentAvailable: true })
  expect(JSON.stringify(output)).not.toContain('Private building')
  expect(JSON.stringify(output)).not.toContain(renter)
  expect(JSON.stringify(output)).not.toContain(host)
  expect(output.data).not.toHaveProperty('handshake_code_hash')
  expect(mocks.participant).toHaveBeenCalledWith(bookingId, renter)
})

it.each([
  { amount_kobo: 'not-money' }, { hold_credit_kobo: '300001' }, { status: 'unknown-provider-state' },
  { ends_at: '2030-01-01T09:00:00.000Z' },
  { pricing_snapshot: { period: 'fixed', days: 1, baseKobo: '300001', fees: [], totalKobo: '300001' } },
])('fails closed for inconsistent booking data: %j', async overrides => {
  mocks.participant.mockResolvedValue(booking(overrides))
  const response = await getBooking(request(`/${bookingId}`, 'GET'), context)
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ success: false, code: 'BOOKING_DATA_UNAVAILABLE' })
})

it('rejects malformed quote money without throwing from a later BigInt refinement', () => {
  expect(apiBookingQuoteSchema.safeParse({ period: 'fixed', days: 1, baseKobo: '100.5', fees: [], totalKobo: '100.5' }).success).toBe(false)
})

it('requires a participant on every mutation and hides missing/foreign bookings', async () => {
  mocks.participant.mockResolvedValue(null)
  const responses = await Promise.all([
    patchBooking(request(`/${bookingId}`, 'PATCH', { operation: 'accept' }), context), issueCode(request(`/${bookingId}/handshake-code`), context),
    checkIn(request(`/${bookingId}/check-in`, 'POST', { latitude: 6.5, longitude: 3.4, accuracy: 5, capturedAt: now }), context),
    checkout(request(`/${bookingId}/checkout`), context), reconcile(request(`/${bookingId}/reconcile`, 'POST', { reference }), context),
  ])
  for (const response of responses) expect(response.status).toBe(404)
  for (const operation of [mocks.change, mocks.checkIn, mocks.code, mocks.startPayment, mocks.reconcile]) expect(operation).not.toHaveBeenCalled()
})

it.each([{ operation: 'accept', seeker_id: host }, { operation: 'complete', amountKobo: '1' }, { operation: 'refund' }])('rejects spoofed or unsupported updates before mutation: %j', async body => {
  expect((await patchBooking(request(`/${bookingId}`, 'PATCH', body), context)).status).toBe(400)
  expect(mocks.change).not.toHaveBeenCalled()
})

it('bounds actual JSON bytes, content type and identifiers before mutation', async () => {
  expect((await patchBooking(request('/bad-id', 'PATCH', { operation: 'cancel' }), { params: Promise.resolve({ id: 'bad-id' }) })).status).toBe(400)
  expect((await patchBooking(new Request(`http://localhost:3000/api/v1/bookings/${bookingId}`, { method: 'PATCH', body: 'cancel' }), context)).status).toBe(415)
  expect((await patchBooking(request(`/${bookingId}`, 'PATCH', { operation: 'cancel', padding: 'x'.repeat(1024) }), context)).status).toBe(413)
  expect(mocks.change).not.toHaveBeenCalled()
})

it.each(['accept', 'cancel', 'complete'] as const)('passes %s to the shared service using only the authenticated actor, then rereads the booking', async operation => {
  mocks.identity.mockResolvedValue({ userId: host, mode: 'cookie' })
  const response = await patchBooking(request(`/${bookingId}`, 'PATCH', { operation }), context)
  expect(response.status).toBe(200)
  expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { platform: true, mutation: true, verified: true })
  expect(mocks.change).toHaveBeenCalledExactlyOnceWith(host, bookingId, operation)
  expect(mocks.participant).toHaveBeenCalledTimes(2)
  expect((await response.json()).data.role).toBe('host')
})

it('keeps domain conflicts readable and unknown mutation outcomes explicitly unconfirmed without retries', async () => {
  mocks.change.mockRejectedValueOnce(new BookingError('These dates are no longer available.')).mockRejectedValueOnce(new Error('private database diagnostics'))
  const conflict = await patchBooking(request(`/${bookingId}`, 'PATCH', { operation: 'accept' }), context)
  expect(conflict.status).toBe(409)
  expect(await conflict.json()).toMatchObject({ code: 'BOOKING_UNAVAILABLE', error: 'These dates are no longer available.' })
  const uncertain = await patchBooking(request(`/${bookingId}`, 'PATCH', { operation: 'accept' }), context)
  expect(uncertain.status).toBe(503)
  expect(await uncertain.json()).toMatchObject({ code: 'BOOKING_UPDATE_UNCONFIRMED', error: expect.stringContaining('Refresh') })
  expect(mocks.change).toHaveBeenCalledTimes(2)
})

it('passes fresh GPS and the code unchanged to the shared inspection service', async () => {
  const reading = { latitude: 6.5, longitude: 3.4, accuracy: 5, capturedAt: now, code: '654321' }
  expect((await checkIn(request(`/${bookingId}/check-in`, 'POST', reading), context)).status).toBe(200)
  expect(mocks.checkIn).toHaveBeenCalledExactlyOnceWith(renter, bookingId, reading)
  expect(mocks.identity).toHaveBeenLastCalledWith(expect.any(Request), { platform: true, mutation: true, verified: true })
})

it.each([
  { latitude: 91, longitude: 3.4, accuracy: 5, capturedAt: now },
  { latitude: 6.5, longitude: 3.4, accuracy: 101, capturedAt: now },
  { latitude: 6.5, longitude: 3.4, accuracy: 5, capturedAt: now, code: '123' },
  { latitude: 6.5, longitude: 3.4, accuracy: 5, capturedAt: now, lister_id: host },
])('rejects invalid or spoofed GPS submissions: %j', async reading => {
  expect((await checkIn(request(`/${bookingId}/check-in`, 'POST', reading), context)).status).toBe(400)
  expect(mocks.checkIn).not.toHaveBeenCalled()
})

it('returns only a validated six-digit code, without inventing an expiration', async () => {
  const response = await issueCode(request(`/${bookingId}/handshake-code`), context)
  expect(await response.json()).toEqual({ success: true, data: { code: '654321' } })
  expect(mocks.code).toHaveBeenCalledExactlyOnceWith(renter, bookingId)
  mocks.code.mockResolvedValue('bad-code')
  expect((await issueCode(request(`/${bookingId}/handshake-code`, 'POST', {}), context)).status).toBe(503)
})

it('forbids the host from generating a renter code, opening checkout or reconciling a payment', async () => {
  mocks.identity.mockResolvedValue({ userId: host, mode: 'bearer' })
  const responses = await Promise.all([issueCode(request(`/${bookingId}/handshake-code`), context), checkout(request(`/${bookingId}/checkout`), context),
    reconcile(request(`/${bookingId}/reconcile`, 'POST', { reference }), context)])
  for (const response of responses) expect(response.status).toBe(403)
  for (const operation of [mocks.code, mocks.startPayment, mocks.reconcile, mocks.paymentReference]) expect(operation).not.toHaveBeenCalled()
})

it('leaves payments unavailable without calling provider services when the gate is off', async () => {
  mocks.paymentsEnabled.mockReturnValue(false)
  for (const response of await Promise.all([checkout(request(`/${bookingId}/checkout`), context), reconcile(request(`/${bookingId}/reconcile`, 'POST', { reference }), context)])) {
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'PAYMENTS_UNAVAILABLE' })
  }
  expect(mocks.startPayment).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled()
  expect(publicBooking(booking({ status: 'awaiting_payment', expires_at: '2030-01-01T10:30:00.000Z' }), renter).actions.checkout).toBe(false)
})

it('opens only the exact validated Paystack checkout result and rejects payload overrides', async () => {
  expect(await (await checkout(request(`/${bookingId}/checkout`), context)).json()).toEqual({ success: true, data: { url: 'https://checkout.paystack.com/test-checkout' } })
  expect(mocks.startPayment).toHaveBeenCalledExactlyOnceWith(renter, bookingId)
  expect((await checkout(request(`/${bookingId}/checkout`, 'POST', { amountKobo: '1' }), context)).status).toBe(400)
  expect(mocks.startPayment).toHaveBeenCalledTimes(1)
})

it.each(['http://checkout.paystack.com/test', 'https://checkout.paystack.com.evil.example/test', 'https://user:pass@checkout.paystack.com/test', 'https://checkout.paystack.com:444/test'])('rejects untrusted checkout URLs: %s', async url => {
  mocks.startPayment.mockResolvedValue(url)
  const response = await checkout(request(`/${bookingId}/checkout`), context)
  expect(response.status).toBe(502)
  expect(await response.json()).toMatchObject({ code: 'CHECKOUT_UNCONFIRMED' })
})

it('binds reconciliation to this booking, authenticated payer and exact reference before verification', async () => {
  const response = await reconcile(request(`/${bookingId}/reconcile`, 'POST', { reference }), context)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, data: { status: 'succeeded' } })
  expect(mocks.paymentReference).toHaveBeenCalledExactlyOnceWith({ where: { booking_id: bookingId, user_id: renter, reference, kind: 'booking' }, select: { id: true } })
  expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(renter, reference)
})

it('rejects a foreign payment reference before verification and rejects malformed references before lookup', async () => {
  mocks.paymentReference.mockResolvedValue(null)
  expect((await reconcile(request(`/${bookingId}/reconcile`, 'POST', { reference }), context)).status).toBe(404)
  expect((await reconcile(request(`/${bookingId}/reconcile`, 'POST', { reference: '../other' }), context)).status).toBe(400)
  expect(mocks.paymentReference).toHaveBeenCalledTimes(1)
  expect(mocks.reconcile).not.toHaveBeenCalled()
})

it('scopes active holds to the authenticated renter and rejects duplicated or additional query fields', async () => {
  expect(await (await getHold(request(`/active-hold?listingId=${listingId}`, 'GET'))).json()).toEqual({ success: true, data: null })
  expect(mocks.activeHold).toHaveBeenCalledExactlyOnceWith(listingId, renter)
  expect((await getHold(request(`/active-hold?listingId=${listingId}&listingId=${listingId}`, 'GET'))).status).toBe(400)
  expect((await getHold(request(`/active-hold?listingId=${listingId}&seekerId=${host}`, 'GET'))).status).toBe(400)
  expect(mocks.activeHold).toHaveBeenCalledTimes(1)
})

it('shows paid hold conversion only to the renter while the source is live and unallocated', () => {
  const hold = booking({ kind: 'hold', expires_at: '2030-01-02T10:00:00.000Z', payments: [{ id: paymentId, reference, status: 'succeeded' }],
    pricing_snapshot: { period: 'fixed', days: 1, baseKobo: '300000', fees: [], totalKobo: '300000', holdDays: 1 } })
  expect(publicBooking(hold, renter).actions.convertHold).toBe(true)
  expect(publicBooking(hold, host).actions.convertHold).toBe(false)
  expect(publicBooking({ ...hold, allocated_hold_credit: { rental_booking_id: bookingId } }, renter).actions.convertHold).toBe(false)
  expect(publicBooking({ ...hold, expires_at: '2030-01-01T09:00:00.000Z' }, renter).actions.convertHold).toBe(false)
})

it.each(['created', 'pending', 'failed', 'abandoned', 'uncertain', 'initializing', 'succeeded', 'requires_review', 'reversed'])('shows explicit collection retry only for safe attempt status %s', status => {
  const dto = publicBooking(booking({ status: 'awaiting_payment', expires_at: '2030-01-01T10:30:00.000Z', payments: [{ id: paymentId, reference, status }] }), renter)
  expect(dto.actions.checkout).toBe(['created', 'pending', 'failed', 'abandoned'].includes(status))
})
