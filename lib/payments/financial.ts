import { createHmac, randomUUID } from 'node:crypto'
import type { FinancialOperation, PaymentRecipient, Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db'
import { assertFinancialReady } from '@/lib/database/readiness'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { assertStaffPermission, hasStaffPermission } from '@/lib/auth/roles'
import { roleAllows } from '@/lib/auth/roles-policy'
import { financialOperationSchema, financialRecipientSchema, financialWorkspaceSchema, type FinancialOperationView } from '@/lib/contracts/financial'
import { paystackClientFromEnvironment } from './providers/paystack/client'
import { accountNumberSchema, bankCodeSchema } from './providers/paystack/schemas'
import { FinancialError, financialRequestSchema, financialReasonSchema, settlementAvailable } from './financial-policy'
import { auditFinancial, availableFunds, ensureOperationAllocations, financeActor, financialContext, independentApprover, visibleOperation, type FinancialContext } from './financial-core'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { revokeCommercialOrder } from '@/lib/commerce/service'

export function publicRecipient(value: PaymentRecipient) {
  return financialRecipientSchema.parse({ id: value.id, environment: value.provider_environment, bankCode: value.bank_code, accountLast4: value.account_last4, status: value.status, createdAt: value.createdAt.toISOString() })
}

function operationView(actorId: string, value: FinancialOperation, canApprove: boolean, booking: { seeker_id: string; lister_id: string } | null): FinancialOperationView {
  const approver = canApprove && independentApprover(actorId, value, booking)
  const enabled = settlementAvailable(value.kind === 'payout' ? 'payout' : 'refund')
  const submitted = Boolean(value.attempted_at)
  return financialOperationSchema.parse({ id: value.id, environment: value.provider_environment, kind: value.kind, bookingId: value.booking_id, paymentId: value.payment_id, recipientId: value.recipient_id,
    reference: value.reference, amountKobo: value.amount_kobo.toString(), retainedKobo: value.retained_kobo.toString(), policyVersion: value.policy_version,
    currency: value.currency, status: value.status, providerStatus: value.provider_status, failureCode: value.failure_code, reason: value.reason,
    requestedBy: value.requested_by, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString(), approvedAt: value.approved_at?.toISOString() ?? null,
    completedAt: value.completed_at?.toISOString() ?? null, actions: {
      approve: approver && value.status === 'requested', reject: !submitted && ['requested', 'approved'].includes(value.status) && (approver || actorId === value.requested_by),
      execute: approver && enabled && value.status === 'approved' && !submitted,
      reconcile: submitted && !['rejected', 'reversed'].includes(value.status),
      finalize: approver && enabled && value.kind === 'payout' && value.provider_status === 'otp' && value.status === 'requires_action',
      retryRefund: approver && enabled && value.kind === 'refund' && value.provider_status === 'needs-attention' && value.status === 'requires_action',
    } })
}

export async function publicOperation(tx: Prisma.TransactionClient, actorId: string, value: FinancialOperation): Promise<FinancialOperationView> {
  const booking = value.booking_id ? await tx.booking.findUnique({ where: { id: value.booking_id }, select: { seeker_id: true, lister_id: true } }) : null
  const user = await tx.user.findUnique({ where: { id: actorId }, select: { staff_role: true } })
  return operationView(actorId, value, roleAllows(user?.staff_role, 'settlement:approve'), booking)
}

export async function setupPaymentRecipient(actorId: string, value: unknown) {
  await assertFinancialReady()
  const parsed = z.object({ accountNumber: accountNumberSchema, bankCode: bankCodeSchema }).strict().parse(value)
  if (!settlementAvailable('payout')) throw new FinancialError('SETTLEMENT_UNAVAILABLE', 'Recipient setup is not enabled for this merchant account.', 503)
  const secret = process.env.PAYMENT_ACCOUNT_HASH_SECRET?.trim()
  if (!secret || Buffer.byteLength(secret) < 32) throw new FinancialError('SETTLEMENT_UNAVAILABLE', 'Recipient privacy configuration is unavailable.', 503)
  const client = paystackClientFromEnvironment()
  const fingerprint = createHmac('sha256', secret).update(`paystack:${client.environment}:${parsed.bankCode}:${parsed.accountNumber}`).digest('hex')
  const existing = await prisma.paymentRecipient.findFirst({ where: { user_id: actorId, provider: 'paystack', provider_environment: client.environment, account_fingerprint: fingerprint } })
  if (existing?.status === 'active') return publicRecipient(existing)
  const pending = await withTransaction(async tx => {
    await assertActiveAccounts(tx, [actorId])
    const previous = await tx.paymentRecipient.findFirst({ where: { user_id: actorId, provider: 'paystack', provider_environment: client.environment, account_fingerprint: fingerprint } })
    if (previous?.status === 'active') return previous
    if (previous) return tx.paymentRecipient.update({ where: { id: previous.id }, data: { status: 'pending', revision: { increment: 1 } } })
    return tx.paymentRecipient.create({ data: { user_id: actorId, provider_environment: client.environment, provider_code: null,
      bank_code: parsed.bankCode, account_last4: parsed.accountNumber.slice(-4), account_fingerprint: fingerprint, fingerprint_version: 'v1', status: 'pending', resolved_at: null } })
  })
  if (pending.status === 'active') return publicRecipient(pending)
  // Recipient creation is provider-idempotent by bank/account. No full account number is retained for retries.
  try {
    const resolved = await client.createRecipient(parsed)
    const saved = await withTransaction(async tx => {
      await assertActiveAccounts(tx, [actorId])
      const current = await tx.paymentRecipient.findUnique({ where: { id: pending.id } })
      if (!current || current.status !== 'pending' || current.revision !== pending.revision) throw new FinancialError('RECIPIENT_SETUP_INTERRUPTED', 'Recipient setup changed while verification was in progress. Refresh its current status.', 409)
      const linked = await tx.paymentRecipient.findFirst({ where: { provider: 'paystack', provider_environment: client.environment, provider_code: resolved.recipientCode } })
      if (linked && linked.id !== pending.id) throw new FinancialError('RECIPIENT_REVIEW_REQUIRED', 'This bank recipient or fingerprint rotation requires operator review.', 409)
      await auditFinancial(tx, actorId, pending.id, 'payment_recipient_verified', 'Verified provider bank routing; retained masked account and keyed fingerprint only.', 'payment_recipient')
      return tx.paymentRecipient.update({ where: { id: pending.id }, data: { provider_code: resolved.recipientCode, status: 'active', resolved_at: new Date(),
        account_fingerprint: fingerprint, fingerprint_version: 'v1', revision: { increment: 1 } } })
    })
    return publicRecipient(saved)
  } catch (error) {
    await prisma.paymentRecipient.updateMany({ where: { id: pending.id, status: { in: ['pending', 'uncertain'] } }, data: { status: 'uncertain' } })
    throw error
  }
}

export async function disablePaymentRecipient(actorId: string, id: string): Promise<void> {
  await assertFinancialReady()
  await withTransaction(async tx => {
    await lockRecord(tx, 'paymentRecipient', id)
    const recipient = await tx.paymentRecipient.findFirst({ where: { id, user_id: actorId } })
    if (!recipient) throw new FinancialError('NOT_FOUND', 'This recipient is unavailable.', 404)
    await tx.paymentRecipient.update({ where: { id }, data: { status: 'disabled' } })
  })
}

async function validateRequestContext(tx: Prisma.TransactionClient, context: FinancialContext, request: z.infer<typeof financialRequestSchema>, actorId: string): Promise<{ retained: bigint; total: bigint }> {
  const { booking, payments } = context
  const staff = await financeActor(tx, actorId)
  const requested = BigInt(request.amountKobo)
  if (booking && payments.some(payment => payment.user_id !== booking.seeker_id || payment.currency !== booking.currency)) throw new FinancialError('SOURCE_MISMATCH', 'This collection does not match the booking parties and currency.', 409)
  if (request.kind === 'refund') {
    if (request.policyVersion !== 'standard-v1' || payments.length !== 1 || (payments[0].user_id !== actorId && !staff)) throw new FinancialError('NOT_FOUND', 'This refund source is unavailable.', 404)
    if (payments[0].user_id !== actorId) await assertStaffPermission(tx, actorId, 'finance:review')
    if (booking && booking.seeker_id !== payments[0].user_id) throw new FinancialError('SOURCE_MISMATCH', 'The refund source does not belong to this booking.', 409)
    if (payments[0].booking_id && payments[0].booking_id !== booking?.id) {
      const conversion = await tx.holdCreditAllocation.findUnique({ where: { hold_booking_id: payments[0].booking_id } })
      if (!conversion || conversion.rental_booking_id !== booking?.id) throw new FinancialError('SOURCE_MISMATCH', 'This holding payment belongs to a different reservation.', 409)
    } else if (booking?.kind === 'hold' && await tx.holdCreditAllocation.findUnique({ where: { hold_booking_id: booking.id } })) {
      throw new FinancialError('CREDIT_ALLOCATED', 'Request the refund against the rental funded by this hold.', 409)
    }
    return { retained: BigInt(0), total: requested }
  }
  if (!booking || (booking.lister_id !== actorId && !staff)) throw new FinancialError('NOT_FOUND', 'This payout booking is unavailable.', 404)
  if (booking.lister_id !== actorId) await assertStaffPermission(tx, actorId, 'finance:review')
  for (const payment of payments.filter(source => source.status === 'requires_review')) {
    const refunded = await tx.financialAllocation.findMany({ where: { payment_id: payment.id, operation: { kind: 'refund', status: 'succeeded' } }, select: { amount_kobo: true } })
    if (refunded.reduce((sum, row) => sum + row.amount_kobo, BigInt(0)) < payment.amount_kobo) throw new FinancialError('SOURCE_RECONCILIATION_REQUIRED', 'Resolve the collected payment review before a payout.', 409)
  }
  const existingPayouts = await tx.financialOperation.findMany({ where: { booking_id: booking.id, kind: 'payout', status: { in: ['requested', 'approved', 'submitting', 'pending', 'requires_action', 'uncertain', 'succeeded'] } }, select: { amount_kobo: true, retained_kobo: true } })
  const alreadyCommitted = existingPayouts.reduce((sum, operation) => sum + operation.amount_kobo + operation.retained_kobo, BigInt(0))
  if (alreadyCommitted + requested > booking.amount_kobo) throw new FinancialError('BOOKING_PAYOUT_BOUND', 'The total payout cannot exceed the accepted booking amount.', 409)
  if (booking.hold_credit_kobo > BigInt(0)) {
    const credit = await tx.holdCreditAllocation.findUnique({ where: { rental_booking_id: booking.id }, include: { hold_booking: true } })
    const hold = credit?.hold_booking
    const source = payments.filter(payment => payment.booking_id === hold?.id && payment.status === 'succeeded')
    if (!credit || !hold || hold.kind !== 'hold' || hold.status !== 'converted' || credit.amount_kobo !== booking.hold_credit_kobo || credit.currency !== booking.currency
      || hold.listing_id !== booking.listing_id || hold.seeker_id !== booking.seeker_id || hold.lister_id !== booking.lister_id || source.length !== 1 || source[0].amount_kobo !== credit.amount_kobo) {
      throw new FinancialError('SOURCE_RECONCILIATION_REQUIRED', 'The allocated holding funds require reconciliation.', 409)
    }
  }
  if (await tx.dispute.findFirst({ where: { booking_id: booking.id, status: 'open' }, select: { id: true } })) throw new FinancialError('DISPUTED', 'Resolve the booking report before requesting a payout.', 409)
  if (request.policyVersion === '30-70-v1') {
    if (process.env.SETTLEMENT_HOLD_DEFAULT_POLICY !== '30-70-v1' || booking.kind !== 'hold' || booking.status !== 'expired'
      || !booking.expires_at || booking.expires_at > new Date() || await tx.holdCreditAllocation.findUnique({ where: { hold_booking_id: booking.id } })) {
      throw new FinancialError('POLICY_UNAVAILABLE', 'This hold is not eligible for the accepted default policy.', 409)
    }
    const platform = booking.amount_kobo * BigInt(30) / BigInt(100)
    if (requested !== booking.amount_kobo - platform || requested <= BigInt(0)) throw new FinancialError('POLICY_AMOUNT', 'Use the exact reviewed host share for this hold.', 409)
    return { retained: platform, total: booking.amount_kobo }
  }
  if (booking.status !== 'completed' || !['rental', 'inspection'].includes(booking.kind) || booking.settlement_status === 'requires_review'
    || (booking.kind === 'inspection' && (!booking.seeker_checked_in_at || !booking.lister_checked_in_at))) {
    throw new FinancialError('BOOKING_NOT_SETTLEABLE', 'This booking needs completion and settlement review before a payout.', 409)
  }
  return { retained: BigInt(0), total: requested }
}

export async function requestFinancialOperation(actorId: string, value: unknown): Promise<FinancialOperationView> {
  await assertFinancialReady()
  const request = financialRequestSchema.parse(value)
  const idempotencyKey = `financial:${actorId}:${request.clientId}`
  const run = async () => withTransaction(async tx => {
    await assertActiveAccounts(tx, [actorId])
    const prior = await tx.financialOperation.findUnique({ where: { idempotency_key: idempotencyKey } })
    if (prior) {
      if (prior.kind !== request.kind || prior.amount_kobo.toString() !== request.amountKobo || prior.payment_id !== (request.paymentId ?? null)
        || (request.bookingId && prior.booking_id !== request.bookingId) || prior.recipient_id !== (request.recipientId ?? null)
        || prior.reason !== request.reason || prior.policy_version !== request.policyVersion) throw new FinancialError('INVALID_RETRY', 'Use a new request identifier for changed financial instructions.', 409)
      return publicOperation(tx, actorId, prior)
    }
    const context = await financialContext(tx, { booking_id: request.bookingId, payment_id: request.paymentId })
    const terms = await validateRequestContext(tx, context, request, actorId)
    const sources = context.payments.filter(payment => request.kind === 'refund' || payment.status === 'succeeded')
    if (!sources.length || sources.some(payment => payment.currency !== 'NGN')) throw new FinancialError('SOURCE_UNAVAILABLE', 'No verified collection is available for this operation.', 409)
    const environment = sources[0].provider_environment
    if (!['test', 'live'].includes(environment ?? '') || sources.some(payment => payment.provider_environment !== environment)) throw new FinancialError('ENVIRONMENT_UNVERIFIED', 'The collection environment needs operator reconciliation.', 409)
    if (request.kind === 'payout') {
      await assertActiveAccounts(tx, [context.booking!.seeker_id, context.booking!.lister_id])
      await lockRecord(tx, 'paymentRecipient', request.recipientId!)
      const recipient = await tx.paymentRecipient.findFirst({ where: { id: request.recipientId, user_id: context.booking!.lister_id,
        provider_environment: environment!, provider: 'paystack', status: 'active' } })
      if (!recipient?.provider_code) throw new FinancialError('RECIPIENT_UNAVAILABLE', 'Choose a current verified recipient belonging to this host.', 409)
    }
    let remaining = terms.total
    const allocations: { payment_id: string; amount_kobo: bigint }[] = []
    for (const payment of sources) {
      if (!remaining) break
      const available = await availableFunds(tx, payment)
      const used = available < remaining ? available : remaining
      if (used > BigInt(0)) { allocations.push({ payment_id: payment.id, amount_kobo: used }); remaining -= used }
    }
    if (remaining) throw new FinancialError('FUNDS_RESERVED', 'The collected amount is unavailable or already reserved for another operation.', 409)
    const id = randomUUID()
    const operation = await tx.financialOperation.create({ data: { id, kind: request.kind, booking_id: context.booking?.id ?? null,
      payment_id: request.paymentId ?? null, recipient_id: request.recipientId ?? null, provider_environment: environment!,
      reference: `rt-${request.kind}-${id}`, idempotency_key: idempotencyKey, amount_kobo: BigInt(request.amountKobo), retained_kobo: terms.retained,
      policy_version: request.policyVersion, currency: 'NGN', status: 'requested', requested_by: actorId,
      participant_ids: [...new Set([...sources.map(payment => payment.user_id), ...(context.booking ? [context.booking.seeker_id, context.booking.lister_id] : [])])], reason: request.reason,
      failure_code: null, provider_status: null, approved_at: null, completed_at: null, attempted_at: null, reconcile_after: null,
      allocations: { create: allocations } } })
    if (request.kind === 'refund') for (const source of sources) if (source.order_id) await revokeCommercialOrder(tx, source.order_id)
    await auditFinancial(tx, actorId, id, 'financial_request', `${request.kind}; policy=${request.policyVersion}; provider=${request.amountKobo}; retained=${terms.retained}; ${request.reason}`)
    return publicOperation(tx, actorId, operation)
  })
  try { return await run() } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return run()
    throw error
  }
}

export async function decideFinancialOperation(actorId: string, id: string, action: 'approve' | 'reject', reason: string): Promise<FinancialOperationView> {
  await assertFinancialReady()
  const decisionReason = financialReasonSchema.parse(reason)
  return withTransaction(async tx => {
    const initial = await tx.financialOperation.findUnique({ where: { id } })
    if (!initial || !await visibleOperation(tx, actorId, initial)) throw new FinancialError('NOT_FOUND', 'This operation is unavailable.', 404)
    const context = await financialContext(tx, initial)
    const current = await tx.financialOperation.findUniqueOrThrow({ where: { id } })
    if (current.attempted_at || !['requested', 'approved'].includes(current.status)) throw new FinancialError('ALREADY_SUBMITTED', 'Submitted instructions require provider reconciliation.', 409)
    if (action === 'approve') {
      await assertStaffPermission(tx, actorId, 'settlement:approve')
      if (!independentApprover(actorId, current, context.booking)) throw new FinancialError('INDEPENDENT_APPROVAL_REQUIRED', 'A staff member independent of the requester and booking parties must approve.', 403)
      for (const row of await ensureOperationAllocations(tx, current)) {
        if (await availableFunds(tx, row.payment, current.id) < row.amount) throw new FinancialError('FUNDS_RESERVED', 'The source balance requires reconciliation before approval.', 409)
      }
    } else if (actorId !== current.requested_by) await assertStaffPermission(tx, actorId, 'settlement:approve')
    const operation = await tx.financialOperation.update({ where: { id }, data: action === 'approve' ? { status: 'approved', approved_by: actorId, approved_at: new Date() }
      : { status: 'rejected', failure_code: 'REJECTED_BY_REVIEW', reconcile_after: null } })
    await auditFinancial(tx, actorId, id, action === 'approve' ? 'financial_approve' : 'financial_reject', decisionReason)
    return publicOperation(tx, actorId, operation)
  })
}

function archiveCursor(value?: string): { createdAt: Date; id: string } | null {
  if (!value) return null
  try {
    const parsed = z.object({ at: z.string().datetime(), id: z.string().uuid() }).parse(JSON.parse(Buffer.from(z.string().max(512).parse(value), 'base64url').toString('utf8')))
    return { createdAt: new Date(parsed.at), id: parsed.id }
  } catch { throw new FinancialError('INVALID_CURSOR', 'This archive cursor is invalid.') }
}
function nextCursor<T extends { id: string; createdAt: Date }>(rows: T[]): string | null {
  const row = rows.length > 100 ? rows[99] : null
  return row ? Buffer.from(JSON.stringify({ at: row.createdAt.toISOString(), id: row.id })).toString('base64url') : null
}

export async function getFinancialWorkspace(actorId: string, options: { staff?: boolean; operationsCursor?: string; paymentsCursor?: string } = {}) {
  await assertFinancialReady()
  if (options.staff && !await hasStaffPermission(actorId, 'finance:review')) throw new FinancialError('FORBIDDEN', 'Financial staff access is required.', 403)
  const operationCursor = archiveCursor(options.operationsCursor), paymentCursor = archiveCursor(options.paymentsCursor)
  // Read-only history is advisory. Mutation services recheck all balances under locks.
  const tx = prisma
    const operations = await tx.financialOperation.findMany({ where: { AND: [options.staff ? {} : { OR: [{ requested_by: actorId }, { participant_ids: { has: actorId } }] },
      operationCursor ? { OR: [{ createdAt: { lt: operationCursor.createdAt } }, { createdAt: operationCursor.createdAt, id: { lt: operationCursor.id } }] } : {}] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 101 })
    const payments = await tx.paymentIntent.findMany({ where: { user_id: actorId, ...(paymentCursor ? { OR: [{ createdAt: { lt: paymentCursor.createdAt } }, { createdAt: paymentCursor.createdAt, id: { lt: paymentCursor.id } }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 101 })
    const recipients = await tx.paymentRecipient.findMany({ where: { user_id: actorId }, orderBy: { createdAt: 'desc' }, take: 100 })
    const receipts = options.staff ? await tx.providerReceipt.findMany({ orderBy: { received_at: 'desc' }, take: 100 }) : []
    const user = await tx.user.findUnique({ where: { id: actorId }, select: { staff_role: true } })
    if (options.staff && !roleAllows(user?.staff_role, 'finance:review')) throw new FinancialError('FORBIDDEN', 'Current financial staff authorization is required.', 403)
    const bookings = await tx.booking.findMany({ where: { id: { in: operations.map(operation => operation.booking_id).filter((id): id is string => Boolean(id)) } }, select: { id: true, seeker_id: true, lister_id: true } })
    const collections = await tx.ledgerTransaction.findMany({ where: { payment_id: { in: payments.map(payment => payment.id) }, kind: 'provider_collection' }, select: { payment_id: true } })
    const reserved = await tx.financialAllocation.findMany({ where: { payment_id: { in: payments.map(payment => payment.id) }, operation: { status: { in: ['requested', 'approved', 'submitting', 'pending', 'requires_action', 'uncertain', 'succeeded'] } } }, select: { payment_id: true, amount_kobo: true } })
    const credits = await tx.holdCreditAllocation.findMany({ where: { hold_booking_id: { in: payments.map(payment => payment.booking_id).filter((id): id is string => Boolean(id)) } }, select: { hold_booking_id: true, rental_booking_id: true } })
    const canApprove = roleAllows(user?.staff_role, 'settlement:approve')
    return financialWorkspaceSchema.parse({ operations: operations.slice(0, 100).map(operation => operationView(actorId, operation, canApprove, bookings.find(booking => booking.id === operation.booking_id) ?? null)),
      recipients: recipients.map(publicRecipient), payments: payments.slice(0, 100).map(payment => {
        const used = reserved.filter(row => row.payment_id === payment.id).reduce((sum, row) => sum + row.amount_kobo, BigInt(0))
        const available = ['succeeded', 'requires_review'].includes(payment.status) && payment.paid_at && payment.provider_transaction_id && payment.provider_environment
          && collections.some(row => row.payment_id === payment.id) && payment.amount_kobo > used ? payment.amount_kobo - used : BigInt(0)
        return { id: payment.id, environment: payment.provider_environment, bookingId: payment.booking_id,
          refundBookingId: credits.find(credit => credit.hold_booking_id === payment.booking_id)?.rental_booking_id ?? payment.booking_id,
          reference: payment.reference, amountKobo: payment.amount_kobo.toString(), availableKobo: available.toString(), status: payment.status, createdAt: payment.createdAt.toISOString() }
      }),
      receipts: receipts.map(receipt => ({ id: receipt.id, environment: receipt.provider_environment, kind: receipt.entity_kind, status: receipt.status, attempts: receipt.attempts, lastErrorCode: receipt.last_error_code,
        receivedAt: receipt.received_at.toISOString(), processedAt: receipt.processed_at?.toISOString() ?? null })),
      settlementAvailable: settlementAvailable(), operationsNextCursor: nextCursor(operations), paymentsNextCursor: nextCursor(payments) })
}

/** Direct access to an archived refund source still checks the current authenticated payer. */
export async function getFinancialPayment(actorId: string, id: string) {
  await assertFinancialReady()
  return withTransaction(async tx => {
    const payment = await tx.paymentIntent.findFirst({ where: { id, user_id: actorId } })
    if (!payment) throw new FinancialError('NOT_FOUND', 'This payment is unavailable.', 404)
    const credit = payment.booking_id ? await tx.holdCreditAllocation.findUnique({ where: { hold_booking_id: payment.booking_id }, select: { rental_booking_id: true } }) : null
    return { id: payment.id, environment: payment.provider_environment, bookingId: payment.booking_id, refundBookingId: credit?.rental_booking_id ?? payment.booking_id,
      reference: payment.reference, amountKobo: payment.amount_kobo.toString(),
      availableKobo: (await availableFunds(tx, payment)).toString(), status: payment.status, createdAt: payment.createdAt.toISOString() }
  })
}
