import type { Prisma } from '@prisma/client'

type ReservationWindow = { id: string; listing_id: string; kind: string; starts_at: Date; ends_at: Date }

/** The caller must first write-lock the common listing in its Mongo transaction. */
export async function bookingWindowAvailable(tx: Prisma.TransactionClient, booking: ReservationWindow): Promise<boolean> {
  if (booking.kind === 'inspection') return true
  if (!['rental', 'hold'].includes(booking.kind) || booking.ends_at <= booking.starts_at) return false
  const conflicting = await tx.booking.findFirst({
    where: {
      id: { not: booking.id }, listing_id: booking.listing_id,
      kind: { in: ['rental', 'hold'] }, status: { in: ['awaiting_payment', 'confirmed', 'disputed'] },
      // Half-open intervals allow a new rental to start when the previous one ends.
      starts_at: { lt: booking.ends_at }, ends_at: { gt: booking.starts_at },
    },
    select: { id: true },
  })
  return !conflicting
}
