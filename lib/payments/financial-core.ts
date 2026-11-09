import type { Booking, FinancialOperation, PaymentIntent, Prisma } from '@prisma/client'
import { lockRecord } from '@/lib/database/transactions'
import { roleAllows } from '@/lib/auth/roles-policy'
import { FINANCIAL_RESERVING_STATUSES } from './allocations'
import { FinancialError } from './financial-policy'
import { lockCommercialPayment } from './commercial-locks'

export type FinancialContext = { booking: Booking | null; payments: PaymentIntent[] }
export async function financialContext(tx: Prisma.TransactionClient, value: { booking_id?: string | null; payment_id?: string | null; id?: string }): Promise<FinancialContext> {
  const original = value.payment_id ? await tx.paymentIntent.findUnique({ where: { id: value.payment_id } }) : null
  if (original) await lockCommercialPayment(tx, original)
  const bookingId = value.booking_id ?? original?.booking_id
  let booking = bookingId ? await tx.booking.findUnique({ where: { id: bookingId } }) : null
  if (original && value.booking_id && !original.booking_id) throw new FinancialError('SOURCE_MISMATCH', 'This collection is not a booking payment.', 409)
  if ((value.payment_id && !original) || (bookingId && !booking)) throw new FinancialError('NOT_FOUND', 'This financial source is unavailable.', 404)
  const credit = booking ? await tx.holdCreditAllocation.findUnique({ where: { rental_booking_id: booking.id } }) : null
  const listingId = booking?.listing_id ?? original?.listing_id
  if (listingId) await lockRecord(tx, 'listing', listingId)
  const bookingIds = [...new Set([booking?.id, original?.booking_id, credit?.hold_booking_id].filter((id): id is string => Boolean(id)))].sort()
  for (const id of bookingIds) await lockRecord(tx, 'booking', id)
  if (booking) booking = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } })
  const sourceIds = credit ? [booking!.id, credit.hold_booking_id] : booking ? [booking.id] : []
  let payments = value.payment_id ? [original!] : await tx.paymentIntent.findMany({ where: { booking_id: { in: sourceIds }, kind: 'booking' }, orderBy: { id: 'asc' } })
  for (const payment of [...payments].sort((a, b) => a.id.localeCompare(b.id))) await lockRecord(tx, 'paymentIntent', payment.id)
  payments = await tx.paymentIntent.findMany({ where: { id: { in: payments.map(payment => payment.id) } }, orderBy: { id: 'asc' } })
  if (value.id) await lockRecord(tx, 'financialOperation', value.id)
  return { booking, payments }
}

export async function availableFunds(tx: Prisma.TransactionClient, payment: PaymentIntent, excludingOperation?: string): Promise<bigint> {
  if (!['succeeded', 'requires_review'].includes(payment.status) || !payment.paid_at || !payment.provider_transaction_id || payment.currency !== 'NGN'
    || !['test', 'live'].includes(payment.provider_environment ?? '') || payment.provider !== 'paystack') return BigInt(0)
  const collection = await tx.ledgerTransaction.findFirst({ where: { payment_id: payment.id, kind: 'provider_collection' }, select: { id: true } })
  if (!collection) return BigInt(0)
  const allocated = await tx.financialAllocation.findMany({ where: { payment_id: payment.id,
    ...(excludingOperation ? { operation_id: { not: excludingOperation } } : {}), operation: { status: { in: [...FINANCIAL_RESERVING_STATUSES] } } }, select: { amount_kobo: true } })
  const reserved = allocated.reduce((sum, row) => sum + row.amount_kobo, BigInt(0))
  return reserved >= payment.amount_kobo ? BigInt(0) : payment.amount_kobo - reserved
}

export async function financeActor(tx: Prisma.TransactionClient, actorId: string): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: actorId }, select: { staff_role: true } })
  return roleAllows(user?.staff_role, 'finance:review')
}

export function independentApprover(actorId: string, operation: Pick<FinancialOperation, 'requested_by'> & Partial<Pick<FinancialOperation, 'participant_ids'>>, booking: Pick<Booking, 'seeker_id' | 'lister_id'> | null): boolean {
  return actorId !== operation.requested_by && !operation.participant_ids?.includes(actorId) && actorId !== booking?.seeker_id && actorId !== booking?.lister_id
}

export async function auditFinancial(tx: Prisma.TransactionClient, actorId: string, operationId: string, action: string, reason: string, targetType = 'financial_operation'): Promise<void> {
  await tx.adminAudit.create({ data: { actor_id: actorId, action, target_type: targetType, target_id: operationId, reason } })
}

export async function visibleOperation(tx: Prisma.TransactionClient, actorId: string, operation: FinancialOperation): Promise<boolean> {
  if (operation.requested_by === actorId || operation.participant_ids.includes(actorId) || await financeActor(tx, actorId)) return true
  const booking = operation.booking_id ? await tx.booking.findUnique({ where: { id: operation.booking_id }, select: { seeker_id: true, lister_id: true } }) : null
  return booking?.seeker_id === actorId || booking?.lister_id === actorId
}

export async function ensureOperationAllocations(tx: Prisma.TransactionClient, operation: FinancialOperation, allowReversed = false): Promise<{ payment: PaymentIntent; amount: bigint }[]> {
  const rows = await tx.financialAllocation.findMany({ where: { operation_id: operation.id }, include: { payment: true }, orderBy: { payment_id: 'asc' } })
  if (!rows.length || rows.reduce((sum, row) => sum + row.amount_kobo, BigInt(0)) !== operation.amount_kobo + operation.retained_kobo
    || rows.some(row => row.amount_kobo <= BigInt(0) || row.payment.provider_environment !== operation.provider_environment || row.payment.currency !== operation.currency
      || !(allowReversed ? ['succeeded', 'requires_review', 'reversed'] : ['succeeded', 'requires_review']).includes(row.payment.status) || !row.payment.provider_transaction_id || !row.payment.paid_at)) {
    throw new FinancialError('SOURCE_RECONCILIATION_REQUIRED', 'The collected funds require reconciliation before this operation.', 409)
  }
  return rows.map(row => ({ payment: row.payment, amount: row.amount_kobo }))
}
