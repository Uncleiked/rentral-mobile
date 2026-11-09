import type { Prisma } from '@prisma/client'
import { cancelAuthEmails } from './email-delivery'
import { pushPrepared } from '@/lib/database/readiness'
import { closePushAccountInTransaction, revokePushSessionInTransaction } from '@/lib/push/devices'

/** Caller holds the User write lock. Revocation never requires push sending
 * to be enabled and makes no external provider request. */
export async function revokeAccountPush(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  if (await pushPrepared()) await closePushAccountInTransaction(tx, userId)
}
export async function revokeSessionPush(tx: Prisma.TransactionClient, userId: string, sessionId: string): Promise<void> {
  if (await pushPrepared()) await revokePushSessionInTransaction(tx, userId, sessionId)
}

/** Caller holds the User revision lock. Challenge hashes remain as one-use history. */
export async function invalidateAccountChallenges(tx: Prisma.TransactionClient, userId: string, securityPrepared: boolean): Promise<void> {
  await tx.passwordReset.updateMany({ where: { user_id: userId, used_at: null }, data: { used_at: new Date() } })
  if (securityPrepared) {
    await tx.emailChange.updateMany({ where: { user_id: userId, status: 'pending' }, data: { status: 'cancelled' } })
    await cancelAuthEmails(tx, userId, ['password_reset', 'email_change_old', 'email_change_new'])
  }
}
