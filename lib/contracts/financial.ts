import { z } from 'zod'

const money = z.string().regex(/^(0|[1-9]\d{0,15})$/)
const timestamp = z.string().datetime({ offset: true })
export const financialActionsSchema = z.object({ approve: z.boolean(), reject: z.boolean(), execute: z.boolean(), reconcile: z.boolean(), finalize: z.boolean(), retryRefund: z.boolean() }).strict()
export const financialOperationSchema = z.object({
  id: z.string().uuid(), environment: z.enum(['test', 'live']), kind: z.enum(['refund', 'payout']), bookingId: z.string().uuid().nullable(), paymentId: z.string().uuid().nullable(), recipientId: z.string().uuid().nullable(),
  reference: z.string().min(1).max(64), amountKobo: money, retainedKobo: money, policyVersion: z.string().max(40).nullable(), currency: z.literal('NGN'),
  status: z.enum(['requested', 'approved', 'rejected', 'submitting', 'pending', 'requires_action', 'succeeded', 'failed', 'reversed', 'uncertain']),
  providerStatus: z.string().max(40).nullable(), failureCode: z.string().max(80).nullable(), reason: z.string().min(20).max(500),
  requestedBy: z.string().uuid(), createdAt: timestamp, updatedAt: timestamp, approvedAt: timestamp.nullable(), completedAt: timestamp.nullable(), actions: financialActionsSchema,
}).strict()
export const financialRecipientSchema = z.object({ id: z.string().uuid(), environment: z.enum(['test', 'live']), bankCode: z.string().regex(/^\d{2,12}$/), accountLast4: z.string().regex(/^\d{4}$/),
  status: z.enum(['pending', 'active', 'disabled', 'uncertain']), createdAt: timestamp }).strict()
export const financialPaymentSchema = z.object({ id: z.string().uuid(), environment: z.enum(['test', 'live']).nullable(), bookingId: z.string().uuid().nullable(), refundBookingId: z.string().uuid().nullable(), reference: z.string().min(1).max(150), amountKobo: money,
  availableKobo: money, status: z.string().max(40), createdAt: timestamp }).strict()
export const financialReceiptSchema = z.object({ id: z.string().uuid(), environment: z.enum(['test', 'live']), kind: z.enum(['collection', 'refund', 'transfer']),
  status: z.enum(['pending', 'processing', 'processed', 'failed', 'dead_letter']), attempts: z.number().int().nonnegative(), lastErrorCode: z.string().max(80).nullable(),
  receivedAt: timestamp, processedAt: timestamp.nullable() }).strict()
export const financialWorkspaceSchema = z.object({ operations: z.array(financialOperationSchema).max(100), recipients: z.array(financialRecipientSchema).max(100),
  payments: z.array(financialPaymentSchema).max(100), receipts: z.array(financialReceiptSchema).max(100), settlementAvailable: z.boolean(),
  operationsNextCursor: z.string().max(512).nullable(), paymentsNextCursor: z.string().max(512).nullable() }).strict()
export const financialBanksSchema = z.object({ items: z.array(z.object({ id: z.string().regex(/^\d+$/), code: z.string().regex(/^\d{2,12}$/), name: z.string().min(1).max(200), active: z.boolean() }).strict()).max(100),
  next: z.string().max(512).nullable() }).strict()
export const financialOperationResultSchema = z.object({ operation: financialOperationSchema }).strict()
export const financialRecipientResultSchema = z.object({ recipient: financialRecipientSchema }).strict()
export const financialPaymentResultSchema = z.object({ payment: financialPaymentSchema }).strict()
export type FinancialOperationView = z.infer<typeof financialOperationSchema>
export type FinancialRecipientView = z.infer<typeof financialRecipientSchema>
export type FinancialWorkspace = z.infer<typeof financialWorkspaceSchema>
export const financialOverviewSchema = financialWorkspaceSchema
export type FinancialOverview = FinancialWorkspace
export type FinancialOperationDTO = FinancialOperationView
export type FinancialRecipientDTO = FinancialRecipientView
