import { bookingDateTime } from './booking-input'
import type { BookingRequestInput, HoldConversion } from './booking-contracts'

type Draft = { listingId: string; kind: BookingRequestInput['kind']; date: string; time: string; endDate: string; endTime: string; holdDays: string; hold?: HoldConversion }

export function bookingRequestInput(draft: Draft, now = Date.now()): BookingRequestInput {
  const startsAt = draft.hold?.startsAt ?? bookingDateTime(draft.date, draft.time)
  const days = Number(draft.holdDays)
  if (!startsAt || (!draft.hold && Date.parse(startsAt) <= now) || (draft.kind === 'hold' && (!Number.isInteger(days) || days < 1 || days > 7))) {
    throw new Error('Choose future dates and valid times. Holding periods are 1–7 days.')
  }
  const endsAt = draft.hold?.endsAt ?? (draft.kind === 'inspection' ? new Date(Date.parse(startsAt) + 3600000).toISOString() : bookingDateTime(draft.endDate, draft.endTime))
  if (!endsAt || Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) <= now) throw new Error('Choose an end date and time after your start time.')
  return { listingId: draft.listingId, kind: draft.hold ? 'rental' : draft.kind, startsAt, endsAt,
    ...(draft.kind === 'hold' ? { holdDays: days } : {}), ...(draft.hold ? { holdBookingId: draft.hold.id } : {}) }
}
