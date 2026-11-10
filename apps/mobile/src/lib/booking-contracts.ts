import { z } from 'zod'

const id = z.string().uuid()
const date = z.string().datetime({ offset: true })
const money = z.string().regex(/^(0|[1-9]\d{0,29})$/)
const status = z.string().min(1).max(80)

export const bookingQuoteSchema = z.object({
  currency: z.literal('NGN').default('NGN'), period: z.string().min(1).max(40), days: z.number().int().positive().max(3660),
  baseKobo: money, fees: z.array(z.object({ label: z.string().min(1).max(100), amountKobo: money })).max(20),
  totalKobo: money, holdCreditKobo: money.default('0'), payableKobo: money.optional(),
  holdBookingId: id.optional(), holdDays: z.number().int().min(1).max(7).optional(),
}).superRefine((quote, context) => {
  if ([quote.baseKobo, quote.totalKobo, quote.holdCreditKobo, ...quote.fees.map(fee => fee.amountKobo), ...(quote.payableKobo === undefined ? [] : [quote.payableKobo])].some(value => !money.safeParse(value).success)) return
  const total = BigInt(quote.totalKobo)
  const credit = BigInt(quote.holdCreditKobo)
  if (quote.fees.reduce((sum, fee) => sum + BigInt(fee.amountKobo), BigInt(quote.baseKobo)) !== total || credit > total
    || (quote.payableKobo !== undefined && BigInt(quote.payableKobo) !== total - credit)) {
    context.addIssue({ code: 'custom', message: 'The quote needs reconciliation.' })
  }
}).transform(quote => ({ ...quote, payableKobo: quote.payableKobo ?? (BigInt(quote.totalKobo) - BigInt(quote.holdCreditKobo)).toString() }))

export const bookingDetailSchema = z.object({
  id, kind: z.enum(['inspection', 'rental', 'hold']),
  status: z.enum(['requested', 'awaiting_payment', 'confirmed', 'completed', 'cancelled', 'expired', 'disputed', 'converted']),
  startsAt: date, endsAt: date, expiresAt: date.nullable(), createdAt: date,
  amountKobo: money, holdCreditKobo: money, payableKobo: money, currency: z.literal('NGN'),
  role: z.enum(['renter', 'host']), settlementStatus: status,
  inspectionMode: z.enum(['recorded', 'manual']).optional(),
  listing: z.object({ id, category: z.enum(['house', 'car', 'boat']), location: z.string().max(200) }),
  renter: z.object({ username: z.string().nullable() }), host: z.object({ username: z.string().nullable() }),
  holdBookingId: id.nullable(), rentalBookingId: id.nullable(),
  checkIn: z.object({ renterAt: date.nullable(), hostAt: date.nullable() }),
  payments: z.array(z.object({ id, reference: z.string().min(1).max(150), status })).max(100),
  quote: bookingQuoteSchema.nullable(), paymentAvailable: z.boolean(),
  actions: z.object({ accept: z.boolean(), cancel: z.boolean(), complete: z.boolean(), checkout: z.boolean(), reconcile: z.boolean(),
    checkIn: z.boolean(), issueCode: z.boolean(), convertHold: z.boolean() }),
}).superRefine((booking, context) => {
  if ([booking.amountKobo, booking.holdCreditKobo, booking.payableKobo].some(value => !money.safeParse(value).success)) return
  if (BigInt(booking.holdCreditKobo) > BigInt(booking.amountKobo)
    || BigInt(booking.payableKobo) !== BigInt(booking.amountKobo) - BigInt(booking.holdCreditKobo)
    || Date.parse(booking.endsAt) <= Date.parse(booking.startsAt)
    || (booking.quote !== null && booking.quote.totalKobo !== booking.amountKobo)) {
    context.addIssue({ code: 'custom', message: 'The booking needs reconciliation.' })
  }
})

export const createdBookingSchema = z.object({ id })
export const handshakeCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) })
export const paymentStatusSchema = z.object({ status })
export const checkoutSchema = z.object({ url: z.string().url().refine(value => {
  try { const url = new URL(value); return url.origin === 'https://checkout.paystack.com' && !url.username && !url.password && !url.hash }
  catch { return false }
}) })

export type BookingDetail = z.infer<typeof bookingDetailSchema>
export type BookingQuote = z.infer<typeof bookingQuoteSchema>
export type BookingOperation = 'accept' | 'cancel' | 'complete'
export type BookingRequestInput = { listingId: string; kind: 'inspection' | 'rental' | 'hold'; startsAt: string; endsAt: string; holdDays?: number; holdBookingId?: string }
/** Dates may be in the past when restoring an uncertain request; the server owns availability. */
export const bookingCommandSchema = z.object({ clientId: id, listingId: id, kind: z.enum(['inspection', 'rental', 'hold']),
  startsAt: date, endsAt: date, holdDays: z.number().int().min(1).max(7).optional(), holdBookingId: id.optional(),
}).strict().superRefine((command, context) => {
  const duration = Date.parse(command.endsAt) - Date.parse(command.startsAt)
  if (duration <= 0 || duration > 3660 * 86400000 || (command.holdBookingId && command.kind !== 'rental')) {
    context.addIssue({ code: 'custom', message: 'The saved booking instructions could not be confirmed.' })
  }
})
export type BookingCommand = z.infer<typeof bookingCommandSchema>
export const bookingHistorySchema = z.object({ items: z.array(bookingDetailSchema).max(100), limit: z.number().int().min(1).max(100) })
export type HoldConversion = Pick<BookingDetail, 'id' | 'startsAt' | 'endsAt' | 'amountKobo'>

export function checkInReading(location: { mocked?: boolean; timestamp: number; coords: { latitude: number; longitude: number; accuracy: number | null } }, now = Date.now()) {
  const { latitude, longitude, accuracy } = location.coords
  if (location.mocked || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || accuracy === null || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 100 || !Number.isFinite(location.timestamp) || Math.abs(now - location.timestamp) > 15000) {
    throw new Error('A fresh, precise location is needed. Enable precise location, move outdoors, and try again.')
  }
  return { latitude, longitude, accuracy, capturedAt: new Date(location.timestamp).toISOString() }
}
