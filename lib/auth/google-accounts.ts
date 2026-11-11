import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { assertGoogleAuthReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { defaultAccountHandle, isUniqueConstraintError } from '@/lib/accounts/bootstrap'
import { accountIsActive } from '@/lib/accounts/availability'
import { apiRateLimiter } from '@/lib/api/rate-limit'
import { createGoogleAccountSession } from './service'
import { verifyPassword } from './password'
import { tokenHash } from './token'
import { AuthError } from './types'
import { googleIdentitySchema, type GoogleFinish, type GoogleIdentity, type GoogleIntent } from './google-oauth'

const userSelect = { id: true, email: true, password_hash: true, closed_at: true, suspended_at: true } satisfies Prisma.UserSelect
const fingerprint = (user: { password_hash: string | null; email: string }) => tokenHash(JSON.stringify([user.email, user.password_hash]))
function challengeUsed(): never { throw new AuthError(409, 'GOOGLE_RESTART', 'This Google request has already been used or changed. Start Google sign-in again.') }
async function createGoogleAccount(identity: GoogleIdentity, accountType: 'individual' | 'organization', finish = false) {
  const id = randomUUID()
  await withTransaction(async tx => {
    if (await tx.googleIdentity.findUnique({ where: { id: identity.subject }, select: { user_id: true } })) challengeUsed()
    await tx.user.create({ data: { id, email: identity.email, username: defaultAccountHandle(id), account_type: accountType, password_hash: null } })
    await tx.googleIdentity.create({ data: { id: identity.subject, user_id: id, email_at_link: identity.email, credential_fingerprint: fingerprint({ email: identity.email, password_hash: null }) } })
  }).catch(error => { if (finish && isUniqueConstraintError(error)) challengeUsed(); throw error })
  return createGoogleAccountSession(id, identity.subject, fingerprint({ email: identity.email, password_hash: null }))
}
export async function completeVerifiedGoogle(identityInput: unknown, intent: GoogleIntent, recoveryAttempt = 0) {
  const identity = googleIdentitySchema.parse(identityInput)
  await assertGoogleAuthReady()
  const existing = await prisma.googleIdentity.findUnique({ where: { id: identity.subject }, select: { user_id: true, credential_fingerprint: true } })
  if (existing) {
    const current = await prisma.user.findUnique({ where: { id: existing.user_id }, select: userSelect })
    if (!current || !accountIsActive(current)) throw new AuthError(401, 'GOOGLE_FAILED', 'This account is unavailable.')
    if (existing.credential_fingerprint === fingerprint(current)) return { kind: 'session' as const, session: await createGoogleAccountSession(existing.user_id, identity.subject, fingerprint(current)) }
    return { kind: 'finish' as const, challenge: { kind: 'link' as const, identity, userId: current.id, fingerprint: fingerprint(current) } }
  }
  const emailAccount = await prisma.user.findUnique({ where: { email: identity.email }, select: userSelect })
  if (emailAccount) {
    if (!accountIsActive(emailAccount)) throw new AuthError(401, 'GOOGLE_FAILED', 'This account is unavailable.')
    return { kind: 'finish' as const, challenge: { kind: 'link' as const, identity, userId: emailAccount.id, fingerprint: fingerprint(emailAccount) } }
  }
  if (intent.mode === 'signin') return { kind: 'finish' as const, challenge: { kind: 'new' as const, identity } }
  try { return { kind: 'session' as const, session: await createGoogleAccount(identity, intent.accountType) } }
  catch (error) {
    // A competing verified Google callback may have committed. Read only the
    // immutable provider subject; a newly collided email must still confirm its password.
    if (isUniqueConstraintError(error) && recoveryAttempt < 1) return completeVerifiedGoogle(identity, { mode: 'signin' }, recoveryAttempt + 1)
    throw error
  }
}
export async function finishGoogleAccount(challenge: GoogleFinish, input: { password?: string; accountType?: 'individual' | 'organization'; termsAccepted?: boolean }) {
  await assertGoogleAuthReady()
  if (challenge.kind === 'new') {
    if (!input.accountType || !input.termsAccepted) throw new AuthError(400, 'ACCOUNT_TYPE_REQUIRED', 'Choose Individual or Organization and accept the terms before creating your account.')
    return createGoogleAccount(challenge.identity, input.accountType, true)
  }
  if (!challenge.userId || !challenge.fingerprint) challengeUsed()
  if (!apiRateLimiter.allow('google-link:' + tokenHash(challenge.userId + challenge.identity.subject), 5)) throw new AuthError(429, 'RATE_LIMITED', 'Too many attempts. Wait a minute and start Google sign-in again.')
  const account = await prisma.user.findUnique({ where: { id: challenge.userId }, select: userSelect })
  const valid = await verifyPassword(input.password ?? '', accountIsActive(account) ? account?.password_hash ?? null : null)
  if (!valid || !account || !accountIsActive(account)) throw new AuthError(401, 'INVALID_CREDENTIALS', 'The existing Rentral password is incorrect. Reset your password if needed, then start Google sign-in again.')
  await withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', account.id)) challengeUsed()
    const current = await tx.user.findUnique({ where: { id: account.id }, select: userSelect })
    if (!current || !accountIsActive(current) || fingerprint(current) !== challenge.fingerprint) challengeUsed()
    const binding = await tx.googleIdentity.findUnique({ where: { id: challenge.identity.subject }, select: { user_id: true, credential_fingerprint: true } })
    if (binding) {
      if (binding.user_id !== current.id || binding.credential_fingerprint === fingerprint(current)) challengeUsed()
      const refreshed = await tx.googleIdentity.updateMany({ where: { id: challenge.identity.subject, user_id: current.id, credential_fingerprint: binding.credential_fingerprint }, data: { credential_fingerprint: fingerprint(current) } })
      if (refreshed.count !== 1) challengeUsed()
    } else {
      if (current.email !== challenge.identity.email) challengeUsed()
      if (await tx.googleIdentity.findUnique({ where: { user_id: current.id }, select: { user_id: true } })) challengeUsed()
      await tx.googleIdentity.create({ data: { id: challenge.identity.subject, user_id: current.id, email_at_link: challenge.identity.email, credential_fingerprint: fingerprint(current) } })
    }
  })
  return createGoogleAccountSession(account.id, challenge.identity.subject, challenge.fingerprint)
}
