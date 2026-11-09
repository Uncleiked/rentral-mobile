import { z } from 'zod'
import { financialOverviewSchema, financialBanksSchema, financialOperationResultSchema, financialRecipientResultSchema } from '../../../../lib/contracts/financial'
import { api, ApiError } from './api'
import { memberResponse } from './member-api'
import { financialCommandSchema, recipientCommandSchema, type FinancialCommand } from './financial-input'

export const nativeFinancialOverviewSchema = financialOverviewSchema.superRefine((workspace, context) => {
  if ([...workspace.payments.flatMap(payment => [payment.availableKobo, payment.amountKobo]), ...workspace.operations.map(operation => operation.amountKobo)].some(value => !/^(0|[1-9]\d{0,15})$/.test(value))) return
  if (workspace.payments.some(payment => BigInt(payment.availableKobo) > BigInt(payment.amountKobo))
    || workspace.operations.some(operation => BigInt(operation.amountKobo) <= BigInt(0))) {
    context.addIssue({ code: 'custom', message: 'Financial amounts need reconciliation.' })
  }
})
export { financialBanksSchema }
export async function loadFinancialWorkspace(query = '', signal?: AbortSignal, expectedUserId?: string) {
  return memberResponse(nativeFinancialOverviewSchema, await api<unknown>(`/financial${query}`, { signal, ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function requestFinancialOperation(input: FinancialCommand, actorId: string) {
  const command = financialCommandSchema.parse(input)
  const { operation } = memberResponse(financialOperationResultSchema, await api<unknown>('/financial/operations', { method: 'POST', body: command, expectedUserId: actorId }))
  if (operation.kind !== command.kind || operation.amountKobo !== command.amountKobo || operation.reason !== command.reason || operation.requestedBy !== actorId
    || operation.policyVersion !== command.policyVersion || operation.paymentId !== (command.paymentId ?? null) || operation.recipientId !== (command.recipientId ?? null)
    || (command.bookingId && operation.bookingId !== command.bookingId)) {
    throw new ApiError('This financial request could not be confirmed. Keep the saved request and check your history.', 'INVALID_RESPONSE', 200)
  }
  return operation
}
export async function reconcileFinancialOperation(id: string, actorId: string) {
  const { operation } = memberResponse(financialOperationResultSchema, await api<unknown>(`/financial/operations/${encodeURIComponent(id)}`, { method: 'POST', body: { action: 'reconcile' }, expectedUserId: actorId }))
  if (operation.id !== id) throw new ApiError('The operation status could not be confirmed. Refresh your history.', 'INVALID_RESPONSE', 200)
  return operation
}
export async function setupFinancialRecipient(input: z.infer<typeof recipientCommandSchema>, actorId: string) {
  const command = recipientCommandSchema.parse(input)
  const { recipient } = memberResponse(financialRecipientResultSchema, await api<unknown>('/financial/recipients', { method: 'POST', body: command, expectedUserId: actorId }))
  if (recipient.bankCode !== command.bankCode || recipient.accountLast4 !== command.accountNumber.slice(-4)) {
    throw new ApiError('These bank details could not be confirmed. Check saved recipients before continuing.', 'INVALID_RESPONSE', 200)
  }
  return recipient
}
export async function disableFinancialRecipient(id: string, actorId: string) {
  return memberResponse(z.object({ removed: z.literal(true) }), await api<unknown>(`/financial/recipients/${encodeURIComponent(id)}`, { method: 'DELETE', expectedUserId: actorId }))
}
