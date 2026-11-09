import type { Prisma } from '@prisma/client'

/** Pending/uncertain instructions reserve money until a verified terminal result.
 * Immutable allocation rows are retained even when a reservation is released. */
export const FINANCIAL_RESERVING_STATUSES = ['requested', 'approved', 'submitting', 'pending', 'requires_action', 'uncertain', 'succeeded'] as const

export async function paymentFundsReserved(tx: Prisma.TransactionClient, paymentId: string): Promise<boolean> {
  return Boolean(await tx.financialAllocation.findFirst({ where: { payment_id: paymentId,
    operation: { status: { in: [...FINANCIAL_RESERVING_STATUSES] } } }, select: { id: true } }))
}

/** Also includes a converted hold that funds the target rental. Caller must hold
 * the shared listing/booking locks before restoring any reservation. */
export async function bookingFundsReserved(tx: Prisma.TransactionClient, bookingId: string): Promise<boolean> {
  const source = await tx.holdCreditAllocation.findUnique({ where: { rental_booking_id: bookingId }, select: { hold_booking_id: true } })
  const bookingIds = source ? [bookingId, source.hold_booking_id] : [bookingId]
  return Boolean(await tx.financialAllocation.findFirst({ where: { payment: { booking_id: { in: bookingIds } },
    operation: { status: { in: [...FINANCIAL_RESERVING_STATUSES] } } }, select: { id: true } }))
}
