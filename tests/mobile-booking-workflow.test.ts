import { beforeEach, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixtures.request, ApiError: class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
} }))
import { ApiError } from '../apps/mobile/src/lib/api'
import { bookingOutcomeUncertain, createBooking, issueCheckInCode, loadBooking, loadOwnActiveHold, prepareCheckout, quoteBooking, recordCheckIn, reconcileBookingPayment, updateBooking } from '../apps/mobile/src/lib/booking-api'
import { bookingDetailSchema, bookingQuoteSchema, checkInReading, checkoutSchema } from '../apps/mobile/src/lib/booking-contracts'
import { memberAmount } from '../apps/mobile/src/lib/member-format'
import { bookingRequestInput } from '../apps/mobile/src/lib/booking-request-input'

const bookingId = '11111111-1111-4111-8111-111111111111'
const listingId = '22222222-2222-4222-8222-222222222222'
const differentId = '33333333-3333-4333-8333-333333333333'
const quote = { currency: 'NGN' as const, period: 'day', days: 2, baseKobo: '10000000', fees: [{ label: 'Service charge', amountKobo: '1000000' }], totalKobo: '11000000', holdCreditKobo: '2000000', payableKobo: '9000000' }
const booking = {
  id: bookingId, kind: 'rental', status: 'awaiting_payment', startsAt: '2030-01-01T10:00:00.000Z', endsAt: '2030-01-03T10:00:00.000Z',
  expiresAt: '2030-01-01T09:30:00.000Z', createdAt: '2029-12-01T10:00:00.000Z', amountKobo: '11000000', holdCreditKobo: '2000000', payableKobo: '9000000', currency: 'NGN',
  role: 'renter', settlementStatus: 'unsettled', listing: { id: listingId, category: 'car', location: 'Lekki, Lagos' }, renter: { username: 'renter' }, host: { username: 'host' },
  holdBookingId: differentId, rentalBookingId: null, checkIn: { renterAt: null, hostAt: null }, payments: [], quote, paymentAvailable: true,
  actions: { accept: false, cancel: false, complete: false, checkout: true, reconcile: false, checkIn: false, issueCode: false, convertHold: false },
}
const input = { listingId, kind: 'rental' as const, startsAt: booking.startsAt, endsAt: booking.endsAt, holdBookingId: differentId }
beforeEach(() => { fixtures.request.mockReset() })

it('keeps gross, allocated credit and net payment exact without floating-point conversion', () => {
  expect(bookingDetailSchema.parse(booking).payableKobo).toBe('9000000')
  expect(memberAmount('9007199254740991')).toBe('₦90,071,992,547,409.91')
  expect(bookingQuoteSchema.parse({ ...quote, holdCreditKobo: quote.totalKobo, payableKobo: '0' }).payableKobo).toBe('0')
})

it.each([
  { payableKobo: '9000001' }, { holdCreditKobo: '12000000' }, { amountKobo: 11000000 },
  { amountKobo: 'NaN' }, { holdCreditKobo: '-1' }, { payableKobo: '1.5' },
  { endsAt: booking.startsAt }, { quote: { ...quote, totalKobo: '100' } },
])('rejects inconsistent or malformed critical booking data %# without throwing a parser exception', patch => {
  expect(bookingDetailSchema.safeParse({ ...booking, ...patch }).success).toBe(false)
})

it.each([
  { baseKobo: 'bad' }, { totalKobo: 'NaN' }, { holdCreditKobo: '11000001' }, { payableKobo: '0' },
  { fees: [{ label: 'Broken fee', amountKobo: '1.2' }] }, { totalKobo: 11000000 },
])('rejects malformed quote money or impossible balances %#', patch => {
  expect(bookingQuoteSchema.safeParse({ ...quote, ...patch }).success).toBe(false)
})

it('reads the existing pricing snapshot without inventing allocated holding credit', () => {
  const snapshot = { period: quote.period, days: quote.days, baseKobo: quote.baseKobo, fees: quote.fees, totalKobo: quote.totalKobo }
  const result = bookingQuoteSchema.parse({ ...snapshot, holdBookingId: differentId })
  expect(result.holdCreditKobo).toBe('0')
  expect(result.payableKobo).toBe(result.totalKobo)
})

it('requires server action capabilities instead of guessing host permissions', () => {
  expect(bookingDetailSchema.safeParse({ ...booking, actions: undefined }).success).toBe(false)
  expect(bookingDetailSchema.parse(booking).actions.accept).toBe(false)
})

it.each(['http://checkout.paystack.com/fixture', 'https://attacker.example/checkout', 'https://checkout.paystack.com.attacker.example/fixture',
  'https://user:secret@checkout.paystack.com/fixture', 'https://checkout.paystack.com:8443/fixture', 'javascript:alert(1)', 'https://checkout.paystack.com/fixture#secret'])('rejects unsafe checkout address%s', url => {
  expect(checkoutSchema.safeParse({ url }).success).toBe(false)
})

it('opens only a validated HTTPS Paystack checkout from the authenticated API result', async () => {
  fixtures.request.mockResolvedValue({ url: 'https://checkout.paystack.com/fixture-checkout' })
  expect(await prepareCheckout(bookingId)).toEqual({ url: 'https://checkout.paystack.com/fixture-checkout' })
  expect(fixtures.request).toHaveBeenCalledExactlyOnceWith(`/bookings/${bookingId}/checkout`, { method: 'POST' })
})

it('keeps original hold dates and hold id in quote/create requests without allocating anything client-side', async () => {
  fixtures.request.mockResolvedValueOnce(quote).mockResolvedValueOnce({ id: bookingId })
  expect((await quoteBooking(input)).holdCreditKobo).toBe('2000000')
  expect(await createBooking(input)).toEqual({ id: bookingId })
  expect(fixtures.request.mock.calls).toEqual([
    ['/bookings/quote', { method: 'POST', body: input }], ['/bookings', { method: 'POST', body: input }],
  ])
})

it('does not declare a malformed successful create response as a completed request', async () => {
  fixtures.request.mockResolvedValue({ success: true })
  await expect(createBooking(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 })
  expect(fixtures.request).toHaveBeenCalledTimes(1)
})

it('does not replay a request after an uncertain network failure', async () => {
  const failure = new ApiError('Request interrupted', 'NETWORK_ERROR', 0)
  fixtures.request.mockRejectedValue(failure)
  await expect(createBooking(input)).rejects.toMatchObject({ message: failure.message, status: 0, code: 'NETWORK_ERROR' })
  expect(bookingOutcomeUncertain(failure)).toBe(true)
  expect(fixtures.request).toHaveBeenCalledTimes(1)
  expect(bookingOutcomeUncertain(new ApiError('Not allowed', 'FORBIDDEN', 403))).toBe(false)
})

it.each(['load', 'update', 'check-in'])('rejects a%s response for another booking instead of announcing success', async operation => {
  fixtures.request.mockResolvedValue({ ...booking, id: differentId })
  const promise = operation === 'load' ? loadBooking(bookingId) : operation === 'update' ? updateBooking(bookingId, 'accept')
    : recordCheckIn(bookingId, { latitude: 6.44, longitude: 3.43, accuracy: 10, capturedAt: '2030-01-01T10:00:00Z' })
  await expect(promise).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})

it('keeps participant-denial responses intact with no fallback or second request', async () => {
  const failure = new ApiError('This booking is unavailable.', 'NOT_FOUND', 404)
  fixtures.request.mockRejectedValue(failure)
  await expect(loadBooking(bookingId)).rejects.toMatchObject({ message: failure.message, status: 404, code: 'NOT_FOUND' })
  expect(fixtures.request).toHaveBeenCalledTimes(1)
})

it('validates six-digit handshake codes and refuses malformed success payloads', async () => {
  fixtures.request.mockResolvedValueOnce({ code: '123456' }).mockResolvedValueOnce({ code: 123456 })
  expect(await issueCheckInCode(bookingId)).toEqual({ code: '123456' })
  await expect(issueCheckInCode(bookingId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})

it('sends reconciliation against the current booking and stored reference without inventing a paid state', async () => {
  fixtures.request.mockResolvedValue({ status: 'pending' })
  expect(await reconcileBookingPayment(bookingId, 'rentral-fixture-reference')).toEqual({ status: 'pending' })
  expect(fixtures.request).toHaveBeenCalledExactlyOnceWith(`/bookings/${bookingId}/reconcile`, { method: 'POST', body: { reference: 'rentral-fixture-reference' } })
})

it('binds every native booking mutation to the captured account including delayed check-in and checkout work', async () => {
  const actor = '44444444-4444-4444-8444-444444444444'
  const reading = { latitude: 6.44, longitude: 3.43, accuracy: 10, capturedAt: '2030-01-01T10:00:00Z' }
  fixtures.request.mockResolvedValueOnce(booking).mockResolvedValueOnce({ code: '123456' }).mockResolvedValueOnce(booking)
    .mockResolvedValueOnce({ url: 'https://checkout.paystack.com/fixture' }).mockResolvedValueOnce({ status: 'pending' })
  await updateBooking(bookingId, 'accept', actor)
  await issueCheckInCode(bookingId, actor)
  await recordCheckIn(bookingId, reading, actor)
  await prepareCheckout(bookingId, actor)
  await reconcileBookingPayment(bookingId, 'fixture', actor)
  expect(fixtures.request.mock.calls).toHaveLength(5)
  for (const call of fixtures.request.mock.calls) expect(call[1].expectedUserId).toBe(actor)
})

it('accepts only the current renter’s hold for the requested listing', async () => {
  fixtures.request.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...booking, kind: 'hold' }).mockResolvedValueOnce({ ...booking, kind: 'hold', role: 'host' })
  expect(await loadOwnActiveHold(listingId)).toBeNull()
  expect((await loadOwnActiveHold(listingId))?.kind).toBe('hold')
  await expect(loadOwnActiveHold(listingId)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})

const now = Date.parse('2030-01-01T10:00:00Z')
const location = { timestamp: now, coords: { latitude: 6.44, longitude: 3.43, accuracy: 10 } }
it('keeps the intended rental end separate from holding days and allows a different return time', () => {
  const result = bookingRequestInput({ listingId, kind: 'hold', date: '2030-02-01', time: '10:00', endDate: '2031-02-01', endTime: '18:30', holdDays: '1' }, now)
  expect(result.holdDays).toBe(1)
  expect(new Date(result.endsAt).getFullYear()).toBe(2031)
  expect(new Date(result.endsAt).getHours()).toBe(18)
  expect(new Date(result.endsAt).getMinutes()).toBe(30)
})
it('preserves exact hold conversion timestamps even when the original rental start has passed', () => {
  const result = bookingRequestInput({ listingId, kind: 'rental', date: '', time: '', endDate: '', endTime: '', holdDays: '1', hold: {
    id: differentId, startsAt: '2029-12-31T10:00:00.000Z', endsAt: '2031-01-01T10:30:00.000Z', amountKobo: '2000000',
  } }, now)
  expect(result).toEqual({ listingId, kind: 'rental', startsAt: '2029-12-31T10:00:00.000Z', endsAt: '2031-01-01T10:30:00.000Z', holdBookingId: differentId })
})
it('rejects expired dates or invalid holding duration before asking for a quote', () => {
  const draft = { listingId, kind: 'hold' as const, date: '2030-01-02', time: '10:00', endDate: '2030-02-01', endTime: '10:00', holdDays: '8' }
  expect(() => bookingRequestInput(draft, now)).toThrow('Holding periods')
  expect(() => bookingRequestInput({ ...draft, holdDays: '1', endDate: '2029-01-01' }, now)).toThrow('end date')
})
it('pairs the actual fresh GPS timestamp and accuracy with a check-in without exposing a stored asset location', () => {
  expect(checkInReading(location, now)).toEqual({ latitude: 6.44, longitude: 3.43, accuracy: 10, capturedAt: '2030-01-01T10:00:00.000Z' })
})
it.each([
  { ...location, mocked: true }, { ...location, timestamp: now - 15001 }, { ...location, timestamp: now + 15001 },
  { ...location, coords: { ...location.coords, accuracy: null } }, { ...location, coords: { ...location.coords, accuracy: 101 } },
  { ...location, coords: { ...location.coords, accuracy: -1 } }, { ...location, coords: { ...location.coords, latitude: Number.NaN } },
])('rejects mocked, stale or imprecise GPS reading %# before any submission', reading => {
  expect(() => checkInReading(reading, now)).toThrow('fresh, precise location')
  expect(fixtures.request).not.toHaveBeenCalled()
})
