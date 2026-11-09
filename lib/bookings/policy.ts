import { z } from 'zod'
import { validOptionalListingFee } from '@/lib/listing-fees'

export const BOOKING_KINDS = ['inspection', 'rental', 'hold'] as const
export const BOOKING_OPERATIONS = ['accept', 'cancel', 'complete'] as const
export const INSPECTION_FEE_KOBO = BigInt(300000)
export const HOLD_FEE_KOBO = BigInt(2000000)
export const PAYMENT_WINDOW_MS = 30 * 60 * 1000
export const HOLD_WINDOW_MS = 24 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000

export const bookingRequestSchema = z.object({
  clientId: z.uuid().optional(),
  listingId: z.string().uuid(),
  kind: z.enum(BOOKING_KINDS),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  holdDays: z.number().int().min(1).max(7).default(1),
  holdBookingId: z.string().uuid().optional(),
}).strict().superRefine((value, context) => {
  const start = Date.parse(value.startsAt)
  const end = Date.parse(value.endsAt)
  if (end <= start || end - start > 3660 * DAY_MS) {
    context.addIssue({ code: 'custom', message: 'Choose a valid rental period of at most ten years.' })
  }
  if (value.holdBookingId && value.kind !== 'rental') context.addIssue({ code: 'custom', message: 'Holding credit can only fund a rental.' })
})

export const checkInSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive().max(100),
  capturedAt: z.string().datetime({ offset: true }),
  code: z.string().regex(/^\d{6}$/).optional(),
}).strict()

export type BookingKind = typeof BOOKING_KINDS[number]
export type BookingOperation = typeof BOOKING_OPERATIONS[number]
export class BookingError extends Error {}

const quoteTermsSchema = z.object({
  pricePeriod: z.enum(['year', 'month', 'day', 'trip', '']).optional(),
  rentalIntent: z.enum(['rent', 'buy', 'squat', 'shortlet', '']).optional(),
  agencyFee: z.string().refine(validOptionalListingFee).optional(),
  legalFee: z.string().refine(validOptionalListingFee).optional(),
  cautionFee: z.string().refine(validOptionalListingFee).optional(),
  serviceCharge: z.string().refine(validOptionalListingFee).optional(),
})
export const bookingQuoteSchema = z.object({ period: z.string(), days: z.number().int().positive(), baseKobo: z.string().regex(/^\d+$/),
  fees: z.array(z.object({ label: z.string(), amountKobo: z.string().regex(/^\d+$/) })), totalKobo: z.string().regex(/^\d+$/), holdDays: z.number().int().min(1).max(7).optional(),
  holdBookingId: z.string().uuid().optional(), holdCreditKobo: z.string().regex(/^\d+$/).optional(), payableKobo: z.string().regex(/^\d+$/).optional() })
export type BookingQuote = z.infer<typeof bookingQuoteSchema>

export function quoteBookingBreakdown(kind: BookingKind, category: string, baseKobo: bigint, start: Date, end: Date, metadata: unknown, holdDays: number = 1): BookingQuote {
  const terms = quoteTermsSchema.parse(metadata ?? {})
  if (terms.rentalIntent === 'buy' && kind !== 'inspection') throw new BookingError('This asset is listed for sale. Contact the host to discuss it; rental checkout is unavailable.')
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS))
  const period = terms.pricePeriod || (category === 'house' ? 'year' : 'day')
  if (kind !== 'rental') {
    const duration = z.number().int().min(1).max(7).parse(holdDays)
    const total = kind === 'inspection' ? INSPECTION_FEE_KOBO : HOLD_FEE_KOBO * BigInt(duration)
    return { period: 'fixed', days, baseKobo: total.toString(), fees: [], totalKobo: total.toString(), ...(kind === 'hold' ? { holdDays: duration } : {}) }
  }
  const divisor = period === 'year' ? BigInt(365) : period === 'month' ? BigInt(30) : BigInt(1)
  const base = period === 'trip' ? baseKobo : (baseKobo * BigInt(days) + divisor - BigInt(1)) / divisor
  const feeDefinitions = [
    { value: terms.agencyFee, label: 'Agency fee' }, { value: terms.legalFee, label: 'Legal fee' },
    { value: terms.cautionFee, label: 'Caution deposit' }, { value: terms.serviceCharge, label: 'Service charge' },
  ]
  const fees = feeDefinitions.flatMap(fee => {
    if (!fee.value || /^0(?:\.0{1,2})?$/.test(fee.value)) return []
    return [{ label: fee.label, amountKobo: nairaToKobo(fee.value).toString() }]
  })
  const total = fees.reduce((sum, fee) => sum + BigInt(fee.amountKobo), base)
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new BookingError('The requested total is too large. Choose a shorter period.')
  return { period, days, baseKobo: base.toString(), fees, totalKobo: total.toString() }
}

/** Decimal NGN -> integer kobo, without floating point conversion. */
export function nairaToKobo(value: string): bigint {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) throw new BookingError('Invalid price.')
  const amount = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? '').padEnd(2, '0'))
  if (amount <= BigInt(0)) throw new BookingError('Price must be positive.')
  return amount
}

export function quoteBooking(kind: BookingKind, category: string, baseKobo: bigint, start: Date, end: Date): bigint {
  return BigInt(quoteBookingBreakdown(kind, category, baseKobo, start, end, {}).totalKobo)
}

export function bookingTransition(status: string, operation: BookingOperation, isLister: boolean, isSeeker: boolean, paid: boolean, ended: boolean): string | null {
  if (!isLister && !isSeeker) return null
  if (operation === 'accept' && isLister && status === 'requested') return 'awaiting_payment'
  if (operation === 'cancel' && ['requested', 'awaiting_payment'].includes(status) && !paid) return 'cancelled'
  if (operation === 'complete' && isLister && status === 'confirmed' && ended) return 'completed'
  return null
}

export function formatKobo(value: string | bigint): string {
  const amount = typeof value === 'string' ? BigInt(value) : value
  const whole = amount / BigInt(100)
  const cents = (amount % BigInt(100)).toString().padStart(2, '0')
  return `₦${whole.toLocaleString('en-NG')}${cents === '00' ? '' : `.${cents}`}`
}
