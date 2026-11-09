import prisma from '@/lib/db'
import { accountCloseSchema } from '@/lib/contracts/account-lifecycle'
import { verifyPassword } from '@/lib/auth/password'
import { AuthError } from '@/lib/auth/types'
import { invalidateAccountChallenges } from '@/lib/auth/credential-state'
import { authSecurityPrepared, commercialPrepared, financialPrepared, lifecyclePrepared, matchingPrepared, pushPrepared } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import { apiRateLimiter } from '@/lib/api/rate-limit'
import { withdrawAnalyticsHistoryInTransaction } from '@/lib/analytics/service'
import { withdrawMatchingAccountInTransaction } from '@/lib/matching/profiles'
import { lifecycleAccountClosureBlocked } from '@/lib/lifecycle/service'
import { closeCommercialAccountInTransaction } from '@/lib/commerce/service'
import { closePushAccountInTransaction } from '@/lib/push/devices'
import { accountIsActive, assertActiveAccounts } from './availability'

/** Soft closure preserves contractual/financial history and private evidence. */
export async function closeAccount(userId: string, input: unknown): Promise<void> {
  const { currentPassword } = accountCloseSchema.parse(input)
  if (!apiRateLimiter.allow(`account-close:${userId}`, 5)) throw new AuthError(429, 'RATE_LIMITED', 'Too many account verification attempts. Please wait a minute.')
  const proof = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, password_hash: true, closed_at: true } })
  const valid = await verifyPassword(currentPassword, accountIsActive(proof) ? proof?.password_hash ?? null : null)
  if (!proof || !accountIsActive(proof) || !valid || !proof.password_hash) throw new AuthError(400, 'CURRENT_PASSWORD_INCORRECT', 'Your current password is incorrect.')
  const [securityReady, financeReady, matchingReady, lifecycleReady, commerceReady, pushReady] = await Promise.all([authSecurityPrepared(), financialPrepared(), matchingPrepared(), lifecyclePrepared(), commercialPrepared(), pushPrepared()])
  await withTransaction(async tx => {
    await assertActiveAccounts(tx, [userId])
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, password_hash: true } })
    if (current.email !== proof.email || current.password_hash !== proof.password_hash) throw new AuthError(409, 'CREDENTIALS_CHANGED', 'Your account credentials changed. Sign in again before continuing.')
    const booking = await tx.booking.findFirst({ where: { OR: [{ seeker_id: userId }, { lister_id: userId }], status: { in: ['requested', 'awaiting_payment', 'confirmed', 'disputed'] } }, select: { id: true } })
    const dispute = await tx.dispute.findFirst({ where: { status: 'open', booking: { OR: [{ seeker_id: userId }, { lister_id: userId }] } }, select: { id: true } })
    const payment = await tx.paymentIntent.findFirst({ where: { OR: [{ user_id: userId }, { booking: { lister_id: userId } }], status: { in: ['created', 'initializing', 'pending', 'uncertain'] } }, select: { id: true } })
    const operation = financeReady ? await tx.financialOperation.findFirst({ where: { OR: [{ participant_ids: { has: userId } }, { requested_by: userId }], status: { in: ['requested', 'approved', 'submitting', 'pending', 'requires_action', 'uncertain'] } }, select: { id: true } }) : null
    const lifecycle = lifecycleReady && await lifecycleAccountClosureBlocked(tx, userId)
    if (booking || dispute || payment || operation || lifecycle) throw new AuthError(409, 'ACCOUNT_HAS_OBLIGATIONS', 'Resolve your ongoing bookings, open reports and pending payment instructions before closing your account. Contact Rentral support if an item needs review.')
    const now = new Date()
    // Listing writes and account guards share this same transaction write anchor.
    await tx.listing.updateMany({ where: { lister_id: userId }, data: { listing_status: 'suspended', archived_at: now, revision: { increment: 1 } } })
    await tx.authSession.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: now } })
    await invalidateAccountChallenges(tx, userId, securityReady)
    await withdrawAnalyticsHistoryInTransaction(tx, userId)
    if (matchingReady) await withdrawMatchingAccountInTransaction(tx, userId)
    if (commerceReady) await closeCommercialAccountInTransaction(tx, userId)
    if (pushReady) await closePushAccountInTransaction(tx, userId)
    if (financeReady) await tx.paymentRecipient.updateMany({ where: { user_id: userId }, data: { status: 'disabled', revision: { increment: 1 } } })
    await tx.savedListing.deleteMany({ where: { user_id: userId } })
    await tx.user.update({ where: { id: userId }, data: { closed_at: now, username: null, bio: null, avatar_url: null, staff_role: null } })
  })
}
