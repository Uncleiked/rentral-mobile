import { z } from 'zod'
import { paymentsEnabled } from './config'

export class FinancialError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); this.name = 'FinancialError' }
}

export const financialAmountSchema = z.string().regex(/^[1-9]\d{0,15}$/).refine(value => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER))
export const financialReasonSchema = z.string().trim().min(20).max(500)
export const financialRequestSchema = z.object({ clientId: z.string().uuid(), kind: z.enum(['refund', 'payout']),
  bookingId: z.string().uuid().optional(), paymentId: z.string().uuid().optional(), recipientId: z.string().uuid().optional(),
  amountKobo: financialAmountSchema, reason: financialReasonSchema, policyVersion: z.enum(['standard-v1', '30-70-v1']).default('standard-v1') }).strict().superRefine((value, context) => {
  if (value.kind === 'refund' ? !value.paymentId || Boolean(value.recipientId) : !value.bookingId || !value.recipientId || Boolean(value.paymentId)) {
    context.addIssue({ code: 'custom', message: 'Supply the correct source for this operation.' })
  }
})
export type FinancialRequest = z.infer<typeof financialRequestSchema>

export function settlementAvailable(kind?: 'refund' | 'payout'): boolean {
  return paymentsEnabled() && process.env.SETTLEMENT_ENABLED === 'true' && process.env.SETTLEMENT_POLICY_ACK === 'manual-review-v1'
    && (kind === 'payout' ? process.env.PAYSTACK_TRANSFERS_ENABLED === 'true' : kind === 'refund' ? process.env.PAYSTACK_REFUNDS_ENABLED === 'true'
      : process.env.PAYSTACK_TRANSFERS_ENABLED === 'true' || process.env.PAYSTACK_REFUNDS_ENABLED === 'true')
}

export function assertSettlementAvailable(kind: 'refund' | 'payout'): void {
  if (!settlementAvailable(kind)) throw new FinancialError('SETTLEMENT_UNAVAILABLE', 'This merchant settlement capability is not enabled. Your request remains recorded for review.', 503)
}
