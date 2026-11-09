import { z } from 'zod'
import type { BookingDetail } from './booking-contracts'

const id = z.string().uuid()
const positiveKobo = z.string().regex(/^[1-9]\d{0,15}$/).refine(value => /^[1-9]\d{0,15}$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER))
export const financialCommandSchema = z.object({ clientId: id, kind: z.enum(['refund', 'payout']), bookingId: id.optional(), paymentId: id.optional(), recipientId: id.optional(),
  amountKobo: positiveKobo, reason: z.string().trim().min(20).max(500), policyVersion: z.literal('standard-v1'),
}).strict().superRefine((command, context) => {
  if (command.kind === 'refund' ? !command.paymentId || Boolean(command.recipientId) : !command.bookingId || !command.recipientId || Boolean(command.paymentId)) {
    context.addIssue({ code: 'custom', message: 'Choose the correct payment or booking and recipient.' })
  }
})
export type FinancialCommand = z.infer<typeof financialCommandSchema>
export const recipientCommandSchema = z.object({ bankCode: z.string().regex(/^\d{2,12}$/), accountNumber: z.string().regex(/^\d{10}$/) }).strict()

/** Decimal naira entry is converted with integer arithmetic; no float rounding. */
export function nairaToKobo(input: string): string {
  const match = /^(0|[1-9]\d{0,13})(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) throw new Error('Enter a naira amount with up to two decimal places, without commas.')
  const kobo = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? '').padEnd(2, '0'))
  if (kobo <= BigInt(0) || kobo > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Enter a positive amount within the supported payment limit.')
  return kobo.toString()
}
export function koboToNaira(kobo: string): string {
  if (!/^\d+$/.test(kobo)) return ''
  const value = BigInt(kobo)
  return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, '0')}`
}
export function canRequestOrdinaryPayout(booking: BookingDetail): boolean {
  return booking.role === 'host' && booking.status === 'completed' && ['rental', 'inspection'].includes(booking.kind)
    && !['settled', 'requires_review'].includes(booking.settlementStatus)
    && (booking.kind !== 'inspection' || Boolean(booking.checkIn.renterAt && booking.checkIn.hostAt))
}
