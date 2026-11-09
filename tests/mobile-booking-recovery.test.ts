import { beforeEach, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn(), values: new Map<string, string>() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixtures.request, ApiError: class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
} }))
vi.mock('../apps/mobile/src/lib/session-storage', () => ({ sessionStorage: { getItem: fixtures.get, setItem: fixtures.set, removeItem: fixtures.remove } }))
import { ApiError } from '../apps/mobile/src/lib/api'
import { loadBookingHistory } from '../apps/mobile/src/lib/booking-api'
import { bookingCommandSchema, type BookingCommand } from '../apps/mobile/src/lib/booking-contracts'
import { dismissPendingBooking, loadPendingBooking, submitPendingBooking } from '../apps/mobile/src/lib/booking-pending-store'

const actor = '11111111-1111-4111-8111-111111111111'
const listingId = '22222222-2222-4222-8222-222222222222'
const bookingId = '33333333-3333-4333-8333-333333333333'
const otherId = '44444444-4444-4444-8444-444444444444'
const clientId = '55555555-5555-4555-8555-555555555555'
const command: BookingCommand = { clientId, listingId, kind: 'rental', startsAt: '2030-01-01T10:00:00.000Z', endsAt: '2030-01-03T10:00:00.000Z' }
const quote = { currency: 'NGN', period: 'day', days: 2, baseKobo: '100000', fees: [], totalKobo: '100000', holdCreditKobo: '0', payableKobo: '100000' }
const booking = { id: bookingId, kind: 'rental', status: 'requested', startsAt: command.startsAt, endsAt: command.endsAt, expiresAt: null, createdAt: '2029-12-01T10:00:00.000Z',
  amountKobo: '100000', holdCreditKobo: '0', payableKobo: '100000', currency: 'NGN', role: 'renter', settlementStatus: 'unsettled',
  listing: { id: listingId, category: 'car', location: 'Yaba, Lagos' }, renter: { username: 'member' }, host: { username: 'host' },
  holdBookingId: null, rentalBookingId: null, checkIn: { renterAt: null, hostAt: null }, payments: [], quote, paymentAvailable: false,
  actions: { accept: false, cancel: true, complete: false, checkout: false, reconcile: false, checkIn: false, issueCode: false, convertHold: false } }
const key = `rentral.booking.pending.${actor}`
const unknownResult = () => new ApiError('Unknown response', 'NETWORK_ERROR', 0)
beforeEach(() => {
  vi.resetAllMocks(); fixtures.values.clear()
  fixtures.get.mockImplementation(async key => fixtures.values.get(key) ?? null)
  fixtures.set.mockImplementation(async (key, value) => { fixtures.values.set(key, value) })
  fixtures.remove.mockImplementation(async key => { fixtures.values.delete(key) })
  fixtures.request.mockImplementation(async (path, options) => options?.method === 'POST' ? { id: bookingId } : path === '/bookings' ? { items: [booking], limit: 100 } : booking)
})

it('persists exact actor-bound instructions before POST and acknowledged ID before participant readback', async () => {
  fixtures.request.mockImplementation(async (_path, options) => {
    const saved = JSON.parse(fixtures.values.get(key)!)
    expect(saved).toMatchObject({ version: 1, actorId: actor, command: bookingCommandSchema.parse(command) })
    expect(saved).not.toHaveProperty('access_token')
    if (options.method === 'POST') { expect(saved.confirmedId).toBeUndefined(); return { id: bookingId } }
    expect(saved.confirmedId).toBe(bookingId)
    return booking
  })
  const result = await submitPendingBooking(actor, command)
  expect(result.booking.id).toBe(bookingId)
  expect(result.cleanupPending).toBe(false)
  expect(await loadPendingBooking(actor)).toBeNull()
  expect(fixtures.request.mock.calls).toEqual([
    ['/bookings', { method: 'POST', body: bookingCommandSchema.parse(command), expectedUserId: actor }],
    [`/bookings/${bookingId}`, { signal: undefined, expectedUserId: actor }],
  ])
})
it('restores an uncertain request without making any network calls and keeps it isolated from another account', async () => {
  fixtures.request.mockRejectedValueOnce(unknownResult())
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ status: 0 })
  expect(await loadPendingBooking(actor)).toEqual({ command: bookingCommandSchema.parse(command) })
  expect(await loadPendingBooking(otherId)).toBeNull()
  expect(fixtures.request).toHaveBeenCalledTimes(1)
})
it('explicitly retries the identical clientId and body after acknowledgment loss', async () => {
  fixtures.request.mockRejectedValueOnce(unknownResult())
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ status: 0 })
  const saved = await loadPendingBooking(actor)
  await submitPendingBooking(actor, saved!.command)
  expect(fixtures.request.mock.calls[0]).toEqual(fixtures.request.mock.calls[1])
  expect(fixtures.request).toHaveBeenCalledTimes(3)
})
it('reads an acknowledged booking after a failed GET without issuing a second POST', async () => {
  fixtures.request.mockResolvedValueOnce({ id: bookingId }).mockRejectedValueOnce(new ApiError('Read unavailable', 'UNAVAILABLE', 503))
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ status: 503 })
  expect((await loadPendingBooking(actor))?.confirmedId).toBe(bookingId)
  await submitPendingBooking(actor, command)
  expect(fixtures.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
  expect(fixtures.request.mock.calls.at(-1)?.[0]).toBe(`/bookings/${bookingId}`)
})
it.each([{ listing: { ...booking.listing, id: otherId } }, { role: 'host' }, { kind: 'hold' }, { startsAt: '2030-01-02T10:00:00.000Z' }])('preserves recovery when participant readback contradicts saved instructions %j', async patch => {
  fixtures.request.mockResolvedValueOnce({ id: bookingId }).mockResolvedValueOnce({ ...booking, ...patch })
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect((await loadPendingBooking(actor))?.confirmedId).toBe(bookingId)
})
it('does not mistake unallocated holding credit for an incorrect rental conversion', async () => {
  fixtures.request.mockResolvedValueOnce({ id: bookingId }).mockResolvedValueOnce({ ...booking, holdBookingId: null, quote: { ...quote, holdBookingId: otherId } })
  expect((await submitPendingBooking(actor, { ...command, holdBookingId: otherId })).booking.id).toBe(bookingId)
})
it('refuses a hold-duration readback that differs from the saved request', async () => {
  fixtures.request.mockResolvedValueOnce({ id: bookingId }).mockResolvedValueOnce({ ...booking, kind: 'hold', quote: { ...quote, holdDays: 1 } })
  await expect(submitPendingBooking(actor, { ...command, kind: 'hold', holdDays: 3 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it.each([1, 2])('never submits if durable marker or command write %s fails', async index => {
  let writes = 0
  fixtures.set.mockImplementation(async (key, value) => { if (++writes === index) throw new Error('Keychain unavailable'); fixtures.values.set(key, value) })
  await expect(submitPendingBooking(actor, command)).rejects.toThrow('Keychain unavailable')
  expect(fixtures.request).not.toHaveBeenCalled()
})
it('keeps the original command if persisting an acknowledged ID fails', async () => {
  let writes = 0
  fixtures.set.mockImplementation(async (key, value) => { if (++writes === 4) throw new Error('Keychain unavailable'); fixtures.values.set(key, value) })
  await expect(submitPendingBooking(actor, command)).rejects.toThrow('Keychain unavailable')
  expect(await loadPendingBooking(actor)).toEqual({ command: bookingCommandSchema.parse(command) })
  expect(fixtures.request).toHaveBeenCalledTimes(1)
  await submitPendingBooking(actor, command)
  expect(fixtures.request.mock.calls[0]).toEqual(fixtures.request.mock.calls[1])
})
it('does not replace an unknown command with another nonce or changed dates', async () => {
  fixtures.request.mockRejectedValueOnce(unknownResult())
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ status: 0 })
  for (const patch of [{ clientId: otherId }, { endsAt: '2030-01-04T10:00:00.000Z' }]) await expect(submitPendingBooking(actor, { ...command, ...patch })).rejects.toThrow('previous booking request')
  expect(fixtures.request).toHaveBeenCalledTimes(1)
})
it('serializes overlapping screens so a failed command cannot be replaced in flight', async () => {
  let reject: (reason: unknown) => void = () => undefined
  fixtures.request.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure }))
  const first = submitPendingBooking(actor, command)
  const firstRejected = expect(first).rejects.toMatchObject({ status: 0 })
  await vi.waitFor(() => expect(fixtures.request).toHaveBeenCalledTimes(1))
  const secondRejected = expect(submitPendingBooking(actor, { ...command, clientId: otherId })).rejects.toThrow('previous booking request')
  reject(unknownResult())
  await Promise.all([firstRejected, secondRejected])
  expect(fixtures.request).toHaveBeenCalledTimes(1)
})
it('clears a definite first-attempt rejection so dates can be corrected', async () => {
  fixtures.request.mockRejectedValueOnce(new ApiError('Unavailable dates', 'BOOKING_REJECTED', 409))
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ status: 409 })
  expect(await loadPendingBooking(actor)).toBeNull()
})
it.each(['INVALID_RETRY', 'ACCOUNT_CHANGED'])('preserves a first-attempt %s record for review', async code => {
  fixtures.request.mockRejectedValueOnce(new ApiError('Cannot confirm', code, 409))
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ code })
  expect(await loadPendingBooking(actor)).not.toBeNull()
})
it('does not erase an older uncertain request because a later retry is declined', async () => {
  fixtures.request.mockRejectedValueOnce(unknownResult()).mockRejectedValueOnce(new ApiError('Not available', 'FORBIDDEN', 403))
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ status: 0 })
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ status: 403 })
  expect(await loadPendingBooking(actor)).not.toBeNull()
})
it('keeps an invalid successful response uncertain without readback or automatic retry', async () => {
  fixtures.request.mockResolvedValueOnce({ success: true })
  await expect(submitPendingBooking(actor, command)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(await loadPendingBooking(actor)).not.toBeNull()
  expect(fixtures.request).toHaveBeenCalledTimes(1)
})
it('reports confirmed success even if local cleanup fails', async () => {
  fixtures.remove.mockRejectedValueOnce(new Error('Keychain unavailable'))
  const result = await submitPendingBooking(actor, command)
  expect(result.cleanupPending).toBe(true)
  expect(result.booking.id).toBe(bookingId)
  expect((await loadPendingBooking(actor))?.confirmedId).toBe(bookingId)
})
it.each([null, 'invalid JSON', JSON.stringify({ version: 1, actorId: otherId, command })])('does not silently reset torn or mismatched recovery %s', async value => {
  fixtures.values.set(`${key}.present`, '1')
  if (value !== null) fixtures.values.set(key, value)
  await expect(loadPendingBooking(actor)).rejects.toThrow(/saved booking/)
  await expect(submitPendingBooking(actor, command)).rejects.toThrow(/saved booking/)
  expect(fixtures.request).not.toHaveBeenCalled()
  await dismissPendingBooking(actor)
  expect(await loadPendingBooking(actor)).toBeNull()
})
it('validates bounded history readback and scopes it to the actor without sending another request', async () => {
  expect((await loadBookingHistory(actor)).items[0].id).toBe(bookingId)
  expect(fixtures.request).toHaveBeenCalledExactlyOnceWith('/bookings', { expectedUserId: actor })
  fixtures.request.mockResolvedValueOnce({ items: [{ ...booking, payableKobo: '0.5' }], limit: 100 })
  await expect(loadBookingHistory(actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('retains original dates when an uncertain request is restored after those dates pass', async () => {
  const old = { ...command, startsAt: '2020-01-01T10:00:00.000Z', endsAt: '2020-01-03T10:00:00.000Z' }
  fixtures.values.set(key, JSON.stringify({ version: 1, actorId: actor, command: old }))
  expect((await loadPendingBooking(actor))?.command.startsAt).toBe(old.startsAt)
  expect(fixtures.request).not.toHaveBeenCalled()
})
