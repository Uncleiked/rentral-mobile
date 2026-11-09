import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db'
import { assertFinancialReady } from '@/lib/database/readiness'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { assertStaffPermission } from '@/lib/auth/roles'
import { FinancialError, financialReasonSchema } from './financial-policy'
import { auditFinancial } from './financial-core'
import { reconcileFinancialOperation } from './financial-execution'
import { reconcilePayment } from './service'
import { paymentsEnabled } from './config'
import { PaystackError, paystackClientFromEnvironment } from './providers/paystack/client'
import type { PaystackWebhookHint } from './providers/paystack/webhooks'

const LEASE_MS = 120000
const MAX_ATTEMPTS = 8
const hintSchema = z.object({ provider: z.literal('paystack'), environment: z.enum(['test', 'live']), event: z.string().max(100),
  entity: z.enum(['collection', 'refund', 'transfer']), providerId: z.string().regex(/^\d+$/).nullable(), reference: z.string().max(150).nullable(),
  transactionReference: z.string().max(150).nullable(), status: z.string().max(40), amountKobo: z.string().regex(/^[1-9]\d{0,15}$/), currency: z.literal('NGN'),
  eventKey: z.string().regex(/^[a-f0-9]{64}$/), payloadHash: z.string().regex(/^[a-f0-9]{64}$/), requiresReconciliation: z.literal(true), hasStrongIdentity: z.boolean() }).strict()

/** Persist only authenticated, normalized allowlisted hints. No raw payload/signature/customer fields. */
export async function ingestProviderReceipt(value: PaystackWebhookHint): Promise<string> {
  await assertFinancialReady()
  const hint = hintSchema.parse(value)
  return withTransaction(async tx => {
    const receipt = await tx.providerReceipt.upsert({ where: { event_key: hint.eventKey }, update: {}, create: {
      provider: 'paystack', provider_environment: hint.environment, event_key: hint.eventKey, entity_kind: hint.entity,
      provider_id: hint.providerId, reference: hint.reference, payload_hash: hint.payloadHash, hints: hint as Prisma.InputJsonObject,
      next_attempt_at: new Date(), last_error_code: null, processed_at: null, lease_token: null, lease_expires_at: null,
    } })
    if (receipt.payload_hash !== hint.payloadHash) {
      await tx.providerReceipt.update({ where: { id: receipt.id }, data: { status: 'dead_letter', last_error_code: 'CANONICAL_EVENT_COLLISION', lease_token: null, lease_expires_at: null } })
    }
    return receipt.id
  })
}

export async function processProviderReceipt(id: string): Promise<boolean> {
  await assertFinancialReady()
  const token = randomUUID(), now = new Date()
  await prisma.providerReceipt.updateMany({ where: { id, attempts: { gte: MAX_ATTEMPTS }, OR: [{ status: { in: ['pending', 'failed'] } }, { status: 'processing', lease_expires_at: { lte: now } }] },
    data: { status: 'dead_letter', last_error_code: 'RECEIPT_RETRY_LIMIT', lease_token: null, lease_expires_at: null } })
  const claimed = await prisma.providerReceipt.updateMany({ where: { id, attempts: { lt: MAX_ATTEMPTS }, AND: [
    { OR: [{ status: { in: ['pending', 'failed'] } }, { status: 'processing', lease_expires_at: { lte: now } }] },
    { OR: [{ next_attempt_at: null }, { next_attempt_at: { isSet: false } }, { next_attempt_at: { lte: now } }] },
  ] }, data: { status: 'processing', attempts: { increment: 1 }, lease_token: token, lease_expires_at: new Date(Date.now() + LEASE_MS) } })
  if (!claimed.count) return false
  const receipt = await prisma.providerReceipt.findUniqueOrThrow({ where: { id } })
  try {
    const hint = hintSchema.parse(receipt.hints)
    if (hint.entity === 'collection') {
      const payment = hint.reference ? await prisma.paymentIntent.findUnique({ where: { reference: hint.reference } }) : null
      if (payment) {
        if (payment.provider_environment !== hint.environment) throw new FinancialError('ENVIRONMENT_MISMATCH', 'Provider environment mismatch.', 409)
        await reconcilePayment(payment.user_id, payment.reference)
      } else throw new FinancialError('ORPHAN_PROVIDER_REFERENCE', 'The provider event has no matching payment.', 409)
    } else {
      const kind = hint.entity === 'transfer' ? 'payout' : 'refund'
      const source = !hint.hasStrongIdentity && hint.transactionReference ? await prisma.paymentIntent.findUnique({ where: { reference: hint.transactionReference }, select: { id: true } }) : null
      const operationWhere = hint.reference ? { reference: hint.reference } : hint.providerId ? { provider_id: hint.providerId } : source ? { payment_id: source.id } : null
      if (operationWhere) {
        const operations = await prisma.financialOperation.findMany({ where: { provider: 'paystack', provider_environment: hint.environment, kind, ...operationWhere,
          attempted_at: { not: null } }, orderBy: { createdAt: 'asc' }, take: 100 })
        if (!operations.length) throw new FinancialError('ORPHAN_PROVIDER_REFERENCE', 'The provider event has no submitted operation.', 409)
        for (const operation of operations) await reconcileFinancialOperation(null, operation.id)
      } else throw new FinancialError('ORPHAN_PROVIDER_REFERENCE', 'This provider hint cannot identify a known operation.', 409)
    }
    await prisma.providerReceipt.updateMany({ where: { id, lease_token: token, status: 'processing' }, data: { status: 'processed', processed_at: new Date(),
      lease_token: null, lease_expires_at: null, last_error_code: null, next_attempt_at: null } })
    return true
  } catch (error) {
    const code = error instanceof PaystackError ? `PROVIDER_${error.code}` : error instanceof FinancialError ? error.code : 'RECEIPT_RECONCILIATION_FAILED'
    await prisma.providerReceipt.updateMany({ where: { id, lease_token: token, status: 'processing' }, data: { status: receipt.attempts >= MAX_ATTEMPTS ? 'dead_letter' : 'failed',
      lease_token: null, lease_expires_at: null, next_attempt_at: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(receipt.attempts, 6))), last_error_code: code } })
    return false
  }
}

/** Fair due-time ordering also recovers an expired lease after a worker crash. No POST is replayed. */
export async function runFinancialReconciliationBatch(limit = 10): Promise<{ receipts: number; operations: number }> {
  if (!paymentsEnabled()) return { receipts: 0, operations: 0 }
  await assertFinancialReady()
  const bounded = z.number().int().min(1).max(50).parse(limit), now = new Date()
  const environment = paystackClientFromEnvironment().environment
  await prisma.providerReceipt.updateMany({ where: { provider_environment: environment, attempts: { gte: MAX_ATTEMPTS }, OR: [{ status: { in: ['pending', 'failed'] } }, { status: 'processing', lease_expires_at: { lte: now } }] },
    data: { status: 'dead_letter', last_error_code: 'RECEIPT_RETRY_LIMIT', lease_token: null, lease_expires_at: null } })
  const receipts = await prisma.providerReceipt.findMany({ where: { provider_environment: environment, attempts: { lt: MAX_ATTEMPTS }, AND: [
    { OR: [{ status: { in: ['pending', 'failed'] } }, { status: 'processing', lease_expires_at: { lte: now } }] },
    { OR: [{ next_attempt_at: null }, { next_attempt_at: { isSet: false } }, { next_attempt_at: { lte: now } }] },
  ] }, orderBy: [{ next_attempt_at: 'asc' }, { received_at: 'asc' }, { id: 'asc' }], take: bounded, select: { id: true } })
  let receiptCount = 0, operationCount = 0
  for (const row of receipts) if (await processProviderReceipt(row.id)) receiptCount += 1
  const operations = await prisma.financialOperation.findMany({ where: { provider_environment: environment, attempted_at: { not: null }, status: { in: ['submitting', 'pending', 'requires_action', 'uncertain'] }, AND: [
    { OR: [{ reconcile_after: null }, { reconcile_after: { isSet: false } }, { reconcile_after: { lte: now } }] },
    { OR: [{ lease_expires_at: null }, { lease_expires_at: { isSet: false } }, { lease_expires_at: { lte: now } }] },
  ] }, orderBy: [{ reconcile_after: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: bounded, select: { id: true } })
  for (const row of operations) {
    const token = randomUUID()
    const claim = await prisma.financialOperation.updateMany({ where: { id: row.id, OR: [{ lease_expires_at: null }, { lease_expires_at: { isSet: false } }, { lease_expires_at: { lte: now } }] },
      data: { lease_token: token, lease_expires_at: new Date(Date.now() + LEASE_MS) } })
    if (!claim.count) continue
    try { await reconcileFinancialOperation(null, row.id, token); operationCount += 1 } catch { /* Reconciliation records a safe failure and future retry time. */ }
    finally { await prisma.financialOperation.updateMany({ where: { id: row.id, lease_token: token }, data: { lease_token: null, lease_expires_at: null } }) }
  }
  return { receipts: receiptCount, operations: operationCount }
}

export async function retryProviderReceipt(actorId: string, id: string, reason: string): Promise<void> {
  await assertFinancialReady()
  const note = financialReasonSchema.parse(reason)
  await withTransaction(async tx => {
    await assertStaffPermission(tx, actorId, 'finance:review')
    await lockRecord(tx, 'providerReceipt', id)
    const current = await tx.providerReceipt.findUnique({ where: { id } })
    if (!current || !['failed', 'dead_letter'].includes(current.status) || current.last_error_code === 'CANONICAL_EVENT_COLLISION') throw new FinancialError('RECEIPT_NOT_RETRYABLE', 'This event requires operator investigation.', 409)
    await tx.providerReceipt.update({ where: { id }, data: { status: 'pending', attempts: 0, next_attempt_at: new Date(), lease_token: null, lease_expires_at: null } })
    await auditFinancial(tx, actorId, id, 'provider_receipt_retry', `Previous attempts=${current.attempts}; code=${current.last_error_code ?? 'unknown'}; ${note}`, 'provider_receipt')
  })
}
