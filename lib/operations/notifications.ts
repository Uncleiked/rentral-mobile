import type { Prisma } from '@prisma/client'

/** Call under the owning listing/booking transaction lock. No aborted duplicate write is swallowed. */
export async function ensureNotification(tx: Prisma.TransactionClient, data: Prisma.NotificationUncheckedCreateInput & { dedupe_key: string }): Promise<boolean> {
  const existing = await tx.notification.findUnique({ where: { dedupe_key: data.dedupe_key }, select: { id: true } })
  if (existing) return false
  await tx.notification.upsert({ where: { dedupe_key: data.dedupe_key }, update: {}, create: data })
  return true
}
