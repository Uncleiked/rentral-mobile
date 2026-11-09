import type { z } from 'zod'
import { api, ApiError } from './api'
import { bookingDetailSchema, bookingHistorySchema, bookingQuoteSchema, checkoutSchema, createdBookingSchema, handshakeCodeSchema, paymentStatusSchema,
  type BookingCommand, type BookingOperation, type BookingRequestInput } from './booking-contracts'

function validated<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ApiError('The booking response could not be confirmed. Refresh to check its status.', 'INVALID_RESPONSE', 200)
  return parsed.data
}
function matchedBooking(id: string, value: unknown) {
  const booking = validated(bookingDetailSchema, value)
  if (booking.id !== id) throw new ApiError('This booking response could not be confirmed.', 'INVALID_RESPONSE', 200)
  return booking
}
export async function loadBooking(id: string, signal?: AbortSignal, expectedUserId?: string) {
  return matchedBooking(id, await api<unknown>(`/bookings/${encodeURIComponent(id)}`, { signal, ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function quoteBooking(input: BookingRequestInput) {
  return validated(bookingQuoteSchema, await api<unknown>('/bookings/quote', { method: 'POST', body: input }))
}
export async function createBooking(input: BookingRequestInput | BookingCommand, expectedUserId?: string) {
  return validated(createdBookingSchema, await api<unknown>('/bookings', { method: 'POST', body: input, ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function loadBookingHistory(expectedUserId: string) {
  return validated(bookingHistorySchema, await api<unknown>('/bookings', { expectedUserId }))
}
export async function updateBooking(id: string, operation: BookingOperation, expectedUserId?: string) {
  return matchedBooking(id, await api<unknown>(`/bookings/${encodeURIComponent(id)}`, { method: 'PATCH', body: { operation }, ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function issueCheckInCode(id: string, expectedUserId?: string) {
  return validated(handshakeCodeSchema, await api<unknown>(`/bookings/${encodeURIComponent(id)}/handshake-code`, { method: 'POST', ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function recordCheckIn(id: string, reading: { latitude: number; longitude: number; accuracy: number; capturedAt: string; code?: string }, expectedUserId?: string) {
  return matchedBooking(id, await api<unknown>(`/bookings/${encodeURIComponent(id)}/check-in`, { method: 'POST', body: reading, ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function prepareCheckout(id: string, expectedUserId?: string) {
  return validated(checkoutSchema, await api<unknown>(`/bookings/${encodeURIComponent(id)}/checkout`, { method: 'POST', ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function reconcileBookingPayment(id: string, reference: string, expectedUserId?: string) {
  return validated(paymentStatusSchema, await api<unknown>(`/bookings/${encodeURIComponent(id)}/reconcile`, { method: 'POST', body: { reference }, ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function loadOwnActiveHold(listingId: string, signal?: AbortSignal) {
  const result = await api<unknown>(`/bookings/active-hold?listingId=${encodeURIComponent(listingId)}`, { signal })
  if (result === null) return null
  const booking = validated(bookingDetailSchema, result)
  if (booking.listing.id !== listingId || booking.kind !== 'hold' || booking.role !== 'renter') throw new ApiError('This holding credit response could not be confirmed.', 'INVALID_RESPONSE', 200)
  return booking
}
export function bookingOutcomeUncertain(reason: unknown): boolean {
  return !(reason instanceof ApiError) || reason.status === 0 || reason.status >= 500 || reason.code === 'INVALID_RESPONSE'
}
