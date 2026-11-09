import { describe, expect, it } from 'vitest'
import { bookingDateTime, localDateInput } from '../apps/mobile/src/lib/booking-input'

describe('native booking calendar input', () => {
  it('converts device-local dates to the explicit ISO timezone API contract', () => {
    const value = bookingDateTime('2028-02-29', '10:30')
    expect(value).toBe(new Date(2028, 1, 29, 10, 30).toISOString())
    expect(localDateInput(new Date(2028, 1, 29, 10, 30))).toBe('2028-02-29')
  })
  it.each([
    ['2026-02-29', '10:00'], ['2026-04-31', '10:00'], ['2026-00-10', '10:00'],
    ['2026-13-01', '10:00'], ['2026-12-01', '24:00'], ['2026-12-01', '10:60'],
    ['2026-12-01', '9:00'], ['12/01/2026', '10:00'], ['0026-12-01', '10:00'],
  ])('rejects calendar rollovers and ambiguous input %s %s', (date, time) => {
    expect(bookingDateTime(date, time)).toBeNull()
  })
})
