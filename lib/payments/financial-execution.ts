import { createHmac, randomUUID } from 'node:crypto'
import type { FinancialOperation, Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { assertStaffPermission } from '@/lib/auth/roles'
import { assertFinancialReady } from '@/lib/database/readiness'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { auditFinancial, availableFunds, ensureOperationAllocations, financialContext, independentApprover, visibleOperation } from './financial-core'
import { FinancialError, assertSettlementAvailable } from './financial-policy'
import { publicOperation } from './financial'
import { insertBalancedLedger } from './ledger'
import { PaystackError, paystackClientFromEnvironment } from './providers/paystack/client'
import { accountNumberSchema, providerIdSchema } from './providers/paystack/schemas'
import { refundBindingMatches, refundOperationStatus, transferBindingMatches, transferOperationStatus, type ProviderRefund, type ProviderTransfer } from './providers/contracts'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { revokeCommercialOrder } from '@/lib/commerce/service'

const LEASE_MS = 120000
const RECONCILE_MS = 30000

async function requireIndependentStaff(tx: Prisma.TransactionClient, actorId: string, current: FinancialOperation, booking: Awaited<ReturnType<typeof financialContext>>['booking']) {
  await assertStaffPermission(tx, actorId, 'settlement:approve')
  if (!independentApprover(actorId, current, booking)) throw new FinancialError('INDEPENDENT_APPROVAL_REQUIRED', 'An independent authorized staff member is required.', 403)
}

async function reserveExecution(actorId: string, id: string, action: 'execute' | 'finalize' | 'retryRefund') {
  await assertFinancialReady()
  return withTransaction(async tx => {
    const initial = await tx.financialOperation.findUnique({ where: { id } })
    if (!initial) throw new FinancialError('NOT_FOUND', 'This financial operation is unavailable.', 404)
    const context = await financialContext(tx, initial)
    const current = await tx.financialOperation.findUniqueOrThrow({ where: { id } })
    await requireIndependentStaff(tx, actorId, current, context.booking)
    if (!current.approved_by || !current.approved_at || !independentApprover(current.approved_by, current, context.booking)) throw new FinancialError('APPROVAL_REQUIRED', 'Independent approval is required.', 409)
    if (current.approved_by !== actorId) await assertStaffPermission(tx, current.approved_by, 'settlement:approve')
    assertSettlementAvailable(current.kind === 'payout' ? 'payout' : 'refund')
    if (current.policy_version === '30-70-v1' && process.env.SETTLEMENT_HOLD_DEFAULT_POLICY !== '30-70-v1') throw new FinancialError('POLICY_UNAVAILABLE', 'The accepted hold-default policy is not enabled.', 409)
    if (current.lease_expires_at && current.lease_expires_at > new Date()) throw new FinancialError('OPERATION_IN_PROGRESS', 'This operation is already being processed.', 409)
    if (action === 'execute' ? current.status !== 'approved' || Boolean(current.attempted_at)
      : current.status !== 'requires_action' || (action === 'finalize' ? current.kind !== 'payout' || current.provider_status !== 'otp'
        : current.kind !== 'refund' || current.provider_status !== 'needs-attention')) {
      throw new FinancialError('RECONCILE_REQUIRED', 'Reconcile this operation before sending another provider instruction.', 409)
    }
    const allocations = await ensureOperationAllocations(tx, current)
    for (const row of allocations) if (await availableFunds(tx, row.payment, current.id) < row.amount) throw new FinancialError('FUNDS_RESERVED', 'The source collection needs reconciliation.', 409)
    if (context.booking && await tx.dispute.findFirst({ where: { booking_id: context.booking.id, status: 'open' }, select: { id: true } })) throw new FinancialError('DISPUTED', 'Resolve the booking report before settlement.', 409)
    if (current.kind === 'payout') {
      if (context.booking) await assertActiveAccounts(tx, [context.booking.seeker_id, context.booking.lister_id])
      const validDefault = current.policy_version === '30-70-v1' && context.booking?.kind === 'hold' && context.booking.status === 'expired'
        && context.booking.expires_at && context.booking.expires_at <= new Date() && !await tx.holdCreditAllocation.findUnique({ where: { hold_booking_id: context.booking.id } })
      const validOrdinary = current.policy_version === 'standard-v1' && context.booking?.status === 'completed' && ['rental', 'inspection'].includes(context.booking.kind)
        && context.booking.settlement_status !== 'requires_review' && (context.booking.kind !== 'inspection' || Boolean(context.booking.seeker_checked_in_at && context.booking.lister_checked_in_at))
      if (!validDefault && !validOrdinary) throw new FinancialError('BOOKING_NOT_SETTLEABLE', 'The booking requires settlement review.', 409)
    }
    const client = paystackClientFromEnvironment()
    if (current.provider_environment !== client.environment) throw new FinancialError('ENVIRONMENT_MISMATCH', 'The provider key does not match this operation.', 409)
    if (current.recipient_id) await lockRecord(tx, 'paymentRecipient', current.recipient_id)
    const recipient = current.recipient_id ? await tx.paymentRecipient.findUnique({ where: { id: current.recipient_id } }) : null
    if (current.kind === 'payout' && (!recipient?.provider_code || recipient.status !== 'active' || recipient.user_id !== context.booking?.lister_id || recipient.provider_environment !== current.provider_environment)) {
      throw new FinancialError('RECIPIENT_UNAVAILABLE', 'The host recipient needs verification.', 409)
    }
    const token = randomUUID()
    const operation = await tx.financialOperation.update({ where: { id }, data: { status: 'submitting', attempted_at: current.attempted_at ?? new Date(),
      lease_token: token, lease_expires_at: new Date(Date.now() + LEASE_MS), failure_code: null, reconcile_after: new Date(Date.now() + RECONCILE_MS) } })
    await auditFinancial(tx, actorId, id, `financial_${action}`, `Independent authorized ${action}; reference=${current.reference}; no completion assumed.`)
    return { operation, recipient, allocations, token }
  })
}

async function uncertainOutcome(id: string, token: string, error: unknown): Promise<void> {
  const code = error instanceof PaystackError ? `PROVIDER_${error.code}` : error instanceof FinancialError ? error.code : 'PROVIDER_OUTCOME_UNKNOWN'
  const rejected = error instanceof PaystackError && error.code === 'REJECTED' && !error.uncertain
  await prisma.financialOperation.updateMany({ where: { id, lease_token: token, status: 'submitting' }, data: { status: rejected ? 'failed' : 'uncertain', failure_code: code,
    ...(rejected ? { completed_at: new Date() } : {}), lease_token: null, lease_expires_at: null, reconcile_after: rejected ? null : new Date(Date.now() + RECONCILE_MS) } })
}

/** One initial financial POST. Unknown outcomes never clear its attempted marker. */
export async function executeFinancialOperation(actorId: string, id: string) {
  const claim = await reserveExecution(actorId, id, 'execute')
  let mutationStarted = false
  try {
    const client = paystackClientFromEnvironment()
    if (claim.operation.kind === 'refund') {
      const source = claim.allocations[0]?.payment
      if (claim.allocations.length !== 1 || !source?.provider_transaction_id) throw new FinancialError('SOURCE_MISMATCH', 'Refund source is unavailable.', 409)
      mutationStarted = true
      await client.createRefund({ reference: claim.operation.reference, transactionId: source.provider_transaction_id, amountKobo: claim.operation.amount_kobo })
    } else {
      const recipient = claim.recipient!
      const verifiedRecipient = await client.fetchRecipient(recipient.provider_code!)
      const secret = process.env.PAYMENT_ACCOUNT_HASH_SECRET?.trim()
      const fingerprint = secret && createHmac('sha256', secret).update(`paystack:${client.environment}:${verifiedRecipient.bankCode}:${verifiedRecipient.accountNumber}`).digest('hex')
      if (!verifiedRecipient.active || fingerprint !== recipient.account_fingerprint || verifiedRecipient.accountNumber.slice(-4) !== recipient.account_last4
        || verifiedRecipient.bankCode !== recipient.bank_code) throw new FinancialError('RECIPIENT_MISMATCH', 'The provider recipient changed and needs review.', 409)
      mutationStarted = true
      await client.initiateTransfer({ reference: claim.operation.reference, amountKobo: claim.operation.amount_kobo, recipientCode: recipient.provider_code!, reason: `Rentral settlement ${claim.operation.id}` })
    }
    await prisma.financialOperation.updateMany({ where: { id, lease_token: claim.token, status: 'submitting' }, data: { status: 'pending', lease_token: null, lease_expires_at: null } })
  } catch (error) {
    if (mutationStarted) await uncertainOutcome(id, claim.token, error)
    else {
      // A failed read-only recipient preflight cannot have sent a financial instruction.
      // A process crash remains conservative: only this still-owned live attempt can release it.
      await prisma.financialOperation.updateMany({ where: { id, lease_token: claim.token, status: 'submitting' }, data: { status: 'approved', attempted_at: null,
        lease_token: null, lease_expires_at: null, failure_code: error instanceof FinancialError ? error.code : 'RECIPIENT_PREFLIGHT_UNAVAILABLE', reconcile_after: null } })
    }
  }
  // Read-only reconciliation is safe after timeout/conflict; it never repeats the POST.
  try { await reconcileFinancialOperation(actorId, id) } catch { /* Keep the durable unknown outcome for the scheduler/operator. */ }
  return financialOperationForViewer(actorId, id)
}

async function journalOperation(tx: Prisma.TransactionClient, operation: FinancialOperation, reversed: boolean): Promise<void> {
  const rows = await ensureOperationAllocations(tx, operation, true)
  let retained = operation.retained_kobo
  for (const row of rows) {
    const businessKey = `financial:${operation.id}:${row.payment.id}:${reversed ? 'reversed' : 'settled'}`
    if (await tx.ledgerTransaction.findUnique({ where: { business_key: businessKey }, select: { id: true } })) continue
    const platform = retained > row.amount ? row.amount : retained
    retained -= platform
    const provider = row.amount - platform
    const liability = { account_key: `customer:${row.payment.user_id}:unsettled`, direction: reversed ? 'credit' : 'debit', amount_kobo: row.amount, currency: operation.currency }
    const entries = [liability]
    if (provider > BigInt(0)) entries.push({ account_key: `provider:paystack:${operation.kind === 'refund' ? 'refunds' : 'payouts'}`, direction: reversed ? 'debit' : 'credit', amount_kobo: provider, currency: operation.currency })
    if (platform > BigInt(0)) entries.push({ account_key: 'platform:hold_default:retained', direction: reversed ? 'debit' : 'credit', amount_kobo: platform, currency: operation.currency })
    await insertBalancedLedger(tx, { payment_id: row.payment.id, operation_id: operation.id, kind: `${operation.kind}_${reversed ? 'reversal' : 'settlement'}`, business_key: businessKey,
      currency: operation.currency, entries })
  }
}

async function applyProviderOutcome(id: string, value: ProviderRefund | ProviderTransfer, leaseToken?: string): Promise<void> {
  await withTransaction(async tx => {
    const initial = await tx.financialOperation.findUniqueOrThrow({ where: { id } })
    const context = await financialContext(tx, initial)
    const current = await tx.financialOperation.findUniqueOrThrow({ where: { id } })
    if (current.lease_token && current.lease_expires_at && current.lease_expires_at > new Date() && current.lease_token !== leaseToken) {
      throw new FinancialError('OPERATION_IN_PROGRESS', 'Another provider instruction is still in progress.', 409)
    }
    const allocations = await ensureOperationAllocations(tx, current, true)
    const recipient = current.recipient_id ? await tx.paymentRecipient.findUnique({ where: { id: current.recipient_id } }) : null
    const valid = current.kind === 'refund' && 'transactionId' in value
      ? allocations.length === 1 && refundBindingMatches(value, { environment: current.provider_environment as 'test' | 'live', reference: current.reference,
        transactionId: allocations[0].payment.provider_transaction_id!, amountKobo: current.amount_kobo })
      : current.kind === 'payout' && 'transferCode' in value && Boolean(recipient?.provider_code) && transferBindingMatches(value, {
        environment: current.provider_environment as 'test' | 'live', reference: current.reference, amountKobo: current.amount_kobo, recipientCode: recipient!.provider_code! })
    if (!valid || (current.provider_id && current.provider_id !== value.providerId)) throw new FinancialError('PROVIDER_BINDING_MISMATCH', 'The provider result does not match the approved financial instruction.', 409)
    if (!current.attempted_at || !current.approved_at || !current.approved_by) throw new FinancialError('NOT_SUBMITTED', 'This operation has no approved provider submission.', 409)
    if (current.status === 'reversed') return
    const status = 'transactionId' in value ? refundOperationStatus(value.status) : transferOperationStatus(value.status)
    const settledKey = `financial:${current.id}:${allocations[0].payment.id}:settled`
    const posted = Boolean(await tx.ledgerTransaction.findUnique({ where: { business_key: settledKey }, select: { id: true } }))
    let nextStatus: string = status
    let failureCode: string | null = null
    if (status === 'succeeded') {
      if (!posted) await journalOperation(tx, current, false)
      if (['failed', 'rejected'].includes(current.status)) { nextStatus = 'uncertain'; failureCode = 'PROVIDER_TERMINAL_REGRESSION' }
      for (const row of allocations) if (await availableFunds(tx, row.payment, current.id) < row.amount) { nextStatus = 'uncertain'; failureCode = 'SOURCE_OVERALLOCATED' }
      if (allocations.some(row => row.payment.status === 'reversed')) { nextStatus = 'uncertain'; failureCode = 'SOURCE_COLLECTION_REVERSED' }
    } else if (status === 'reversed') {
      if (posted) await journalOperation(tx, current, true)
    } else if (posted) {
      // Never release spent funds because a later endpoint returned an earlier/contradictory status.
      nextStatus = 'uncertain'; failureCode = 'PROVIDER_TERMINAL_REGRESSION'
    }
    const operation = await tx.financialOperation.update({ where: { id }, data: { status: nextStatus, provider_id: value.providerId, provider_status: value.status,
      failure_code: failureCode, lease_token: null, lease_expires_at: null, completed_at: ['succeeded', 'failed', 'reversed'].includes(nextStatus)
        ? current.status === nextStatus && current.completed_at ? current.completed_at : new Date() : current.completed_at,
      reconcile_after: ['pending', 'requires_action', 'uncertain'].includes(nextStatus) ? new Date(Date.now() + RECONCILE_MS) : null } })
    if (current.kind === 'refund' && nextStatus === 'succeeded') for (const row of allocations) if (row.payment.order_id) await revokeCommercialOrder(tx, row.payment.order_id)
    if (context.booking && (nextStatus === 'reversed' || failureCode)) await tx.booking.update({ where: { id: context.booking.id }, data: { settlement_status: 'requires_review' } })
    else if (context.booking && nextStatus === 'succeeded' && operation.policy_version === '30-70-v1') await tx.booking.update({ where: { id: context.booking.id }, data: { settlement_status: 'settled' } })
    if (current.status !== nextStatus) {
      await auditFinancial(tx, current.approved_by, id, `financial_provider_${nextStatus}`, `Verified provider result; reference=${current.reference}; provider status=${value.status}; no payload retained.`)
      const participants = [...new Set([current.requested_by, context.booking?.seeker_id, context.booking?.lister_id].filter((user): user is string => Boolean(user)))]
      await tx.notification.createMany({ data: participants.map(user_id => ({ user_id, kind: 'settlement', title: 'Settlement status updated',
        body: nextStatus === 'succeeded' ? 'The provider confirmed the reviewed financial operation.' : 'Your financial operation has an update. Open its history for the verified status.', href: '/marketplace/financial' })) })
    }
  })
}

export async function financialOperationForViewer(actorId: string, id: string) {
  return withTransaction(async tx => {
    const operation = await tx.financialOperation.findUnique({ where: { id } })
    if (!operation || !await visibleOperation(tx, actorId, operation)) throw new FinancialError('NOT_FOUND', 'This operation is unavailable.', 404)
    return publicOperation(tx, actorId, operation)
  })
}

/** A missing actor is reserved for the internal scheduler; API callers always provide their authenticated ID. */
export async function reconcileFinancialOperation(actorId: string | null, id: string, leaseToken?: string): Promise<void> {
  await assertFinancialReady()
  const operation = await prisma.financialOperation.findUnique({ where: { id } })
  if (!operation) throw new FinancialError('NOT_FOUND', 'This operation is unavailable.', 404)
  if (actorId) await financialOperationForViewer(actorId, id)
  if (operation.lease_token && operation.lease_expires_at && operation.lease_expires_at > new Date() && operation.lease_token !== leaseToken) {
    throw new FinancialError('OPERATION_IN_PROGRESS', 'Another provider instruction is still in progress.', 409)
  }
  if (!operation.attempted_at) throw new FinancialError('NOT_SUBMITTED', 'No financial instruction has been submitted.', 409)
  const client = paystackClientFromEnvironment()
  if (client.environment !== operation.provider_environment) throw new FinancialError('ENVIRONMENT_MISMATCH', 'The provider key does not match this operation.', 409)
  try {
    const value = operation.kind === 'refund' ? await client.findRefundByReference(operation.reference) : await client.verifyTransfer(operation.reference)
    if (!value) throw new PaystackError('NOT_FOUND')
    await applyProviderOutcome(id, value, leaseToken)
  } catch (error) {
    const failureCode = error instanceof PaystackError ? `PROVIDER_${error.code}` : error instanceof FinancialError ? error.code : 'RECONCILIATION_UNAVAILABLE'
    await prisma.financialOperation.updateMany({ where: { id, status: { in: ['submitting', 'pending', 'requires_action', 'uncertain'] } }, data: {
      failure_code: failureCode, reconcile_after: new Date(Date.now() + RECONCILE_MS), ...(error instanceof PaystackError && error.code === 'NOT_FOUND' ? { status: 'uncertain' } : {}) } })
    throw error
  }
}

export async function finalizeFinancialTransfer(actorId: string, id: string, otp: string) {
  if (!/^\d{4,10}$/.test(otp)) throw new FinancialError('INVALID_OTP', 'Enter the provider approval code.')
  const claim = await reserveExecution(actorId, id, 'finalize')
  try {
    const value = await paystackClientFromEnvironment().verifyTransfer(claim.operation.reference)
    if (!claim.recipient?.provider_code || !transferBindingMatches(value, { environment: claim.operation.provider_environment as 'test' | 'live',
      reference: claim.operation.reference, amountKobo: claim.operation.amount_kobo, recipientCode: claim.recipient.provider_code })) throw new FinancialError('PROVIDER_BINDING_MISMATCH', 'The provider instruction changed; reconcile before approval.', 409)
    if (value.status !== 'otp') throw new FinancialError('RECONCILE_REQUIRED', 'The provider approval step changed; reconcile first.', 409)
    await paystackClientFromEnvironment().finalizeTransfer({ transferCode: value.transferCode, otp })
    await prisma.financialOperation.updateMany({ where: { id, lease_token: claim.token, status: 'submitting' }, data: { status: 'pending', lease_token: null, lease_expires_at: null } })
  } catch (error) { await uncertainOutcome(id, claim.token, error) }
  try { await reconcileFinancialOperation(actorId, id) } catch { /* Durable operator reconciliation remains available. */ }
  return financialOperationForViewer(actorId, id)
}

export async function retryFinancialRefund(actorId: string, id: string, input: { accountNumber: string; bankId: string }) {
  const accountNumber = accountNumberSchema.parse(input.accountNumber), bankId = providerIdSchema.parse(input.bankId)
  const claim = await reserveExecution(actorId, id, 'retryRefund')
  try {
    const value = await paystackClientFromEnvironment().findRefundByReference(claim.operation.reference)
    if (value && !refundBindingMatches(value, { environment: claim.operation.provider_environment as 'test' | 'live', reference: claim.operation.reference,
      transactionId: claim.allocations[0].payment.provider_transaction_id!, amountKobo: claim.operation.amount_kobo })) throw new FinancialError('PROVIDER_BINDING_MISMATCH', 'The refund binding requires review.', 409)
    if (!value || value.status !== 'needs-attention') throw new FinancialError('RECONCILE_REQUIRED', 'The refund approval step changed; reconcile first.', 409)
    await paystackClientFromEnvironment().retryRefund({ refundId: value.providerId, accountNumber, bankId })
    await prisma.financialOperation.updateMany({ where: { id, lease_token: claim.token, status: 'submitting' }, data: { status: 'pending', lease_token: null, lease_expires_at: null } })
  } catch (error) { await uncertainOutcome(id, claim.token, error) }
  try { await reconcileFinancialOperation(actorId, id) } catch { /* Keep the unknown result; never replay automatically. */ }
  return financialOperationForViewer(actorId, id)
}
