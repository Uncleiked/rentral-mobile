import { describe, expect, it } from 'vitest'
import { bookingRequestSchema, bookingTransition, checkInSchema, nairaToKobo, quoteBooking, quoteBookingBreakdown, formatKobo } from '@/lib/bookings/policy'

describe('reservation pricing and transitions', () => {
  it('converts decimal NGN exactly and rejects exponent or fractional kobo', () => {
    expect(nairaToKobo('5000000.01')).toBe(BigInt(500000001))
    expect(nairaToKobo('0.10')).toBe(BigInt(10))
    expect(() => nairaToKobo('1e6')).toThrow()
    expect(() => nairaToKobo('1.001')).toThrow()
    expect(() => nairaToKobo('0')).toThrow()
    expect(formatKobo('123456789')).toBe('₦1,234,567.89')
  })
  it('quotes inspections, holds, daily assets and yearly property without floating-point money', () => {
    const start = new Date('2026-12-01T12:00:00Z'), end = new Date('2026-12-03T13:00:00Z')
    expect(quoteBooking('inspection', 'house', BigInt(36500000), start, end)).toBe(BigInt(300000))
    expect(quoteBooking('hold', 'house', BigInt(36500000), start, end)).toBe(BigInt(2000000))
    expect(quoteBooking('rental', 'car', BigInt(5000000), start, end)).toBe(BigInt(15000000))
    expect(quoteBooking('rental', 'house', BigInt(36500000), start, end)).toBe(BigInt(300000))
  })
  it('validates temporal ordering, UUIDs, and strict input shape', () => {
    const payload = { listingId: 'ac0d4d98-3858-4bbb-9440-14a080ab6e2c', kind: 'rental', startsAt: '2026-12-01T12:00:00Z', endsAt: '2026-12-03T12:00:00Z' }
    expect(bookingRequestSchema.safeParse(payload).success).toBe(true)
    expect(bookingRequestSchema.safeParse({ ...payload, endsAt: payload.startsAt }).success).toBe(false)
    expect(bookingRequestSchema.safeParse({ ...payload, amount: 1 }).success).toBe(false)
  })
  it('honours monthly/trip periods and charges exact one-time fees only on rentals', () => {
    const start = new Date('2026-12-01T00:00:00Z'), end = new Date('2026-12-16T00:00:00Z')
    const metadata = { pricePeriod: 'month', agencyFee: '1000.25', legalFee: '', cautionFee: '2000', serviceCharge: '0.00' }
    expect(quoteBookingBreakdown('rental', 'house', BigInt(3000000), start, end, metadata)).toEqual({ period: 'month', days: 15,
      baseKobo: '1500000', fees: [{ label: 'Agency fee', amountKobo: '100025' }, { label: 'Caution deposit', amountKobo: '200000' }], totalKobo: '1800025' })
    expect(quoteBookingBreakdown('inspection', 'house', BigInt(3000000), start, end, metadata).totalKobo).toBe('300000')
    expect(quoteBookingBreakdown('rental', 'boat', BigInt(3000000), start, end, { pricePeriod: 'trip' }).totalKobo).toBe('3000000')
    expect(() => quoteBookingBreakdown('rental', 'house', BigInt(3000000), start, end, { rentalIntent: 'buy' })).toThrow('listed for sale')
  })
  it('charges the selected one-to-seven-day hold duration without changing the rental date window', () => {
    const start = new Date('2026-12-01T00:00:00Z'), end = new Date('2026-12-16T00:00:00Z')
    expect(quoteBookingBreakdown('hold', 'house', BigInt(100000), start, end, {}, 3)).toMatchObject({ holdDays: 3, totalKobo: '6000000', fees: [] })
    expect(() => quoteBookingBreakdown('hold', 'house', BigInt(100000), start, end, {}, 8)).toThrow()
  })
  it('requires host acceptance and denies participant impersonation or paid cancellation', () => {
    expect(bookingTransition('requested', 'accept', true, false, false, false)).toBe('awaiting_payment')
    expect(bookingTransition('requested', 'accept', false, true, false, false)).toBeNull()
    expect(bookingTransition('confirmed', 'complete', false, true, true, true)).toBeNull()
    expect(bookingTransition('confirmed', 'complete', true, false, true, false)).toBeNull()
    expect(bookingTransition('confirmed', 'complete', true, false, true, true)).toBe('completed')
    expect(bookingTransition('awaiting_payment', 'cancel', true, false, true, false)).toBeNull()
    expect(bookingTransition('requested', 'cancel', false, false, false, false)).toBeNull()
  })
  it('accepts bounded location evidence and rejects invalid coordinates/OTP', () => {
    const position = { latitude: 6.4, longitude: 3.5, accuracy: 8, capturedAt: '2026-12-01T12:00:00Z', code: '123456' }
    expect(checkInSchema.safeParse(position).success).toBe(true)
    expect(checkInSchema.safeParse({ ...position, accuracy: 1000 }).success).toBe(false)
    expect(checkInSchema.safeParse({ ...position, longitude: 181 }).success).toBe(false)
    expect(checkInSchema.safeParse({ ...position, code: '12345x' }).success).toBe(false)
  })
})
