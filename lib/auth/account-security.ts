import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import type { EmailChange } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db'
import { assertAuthSecurityReady } from '@/lib/database/readiness'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { apiRateLimiter } from '@/lib/api/rate-limit'
import { accountEmailChangeRequestSchema, accountEmailConfirmSchema, accountPasswordSchema, accountSecuritySchema, accountSessionsSchema, emailChangeSchema } from '@/lib/contracts/account-security'
import { AuthError } from './types'
import { hashPassword, verifyPassword } from './password'
import { opaqueToken, tokenHash } from './token'
import { authEmailConfiguration, availableAuthDelivery } from './email-config'
import { cancelAuthEmails, queueAuthEmail } from './email-delivery'
import { writeDevelopmentAuthEmail } from './email-development'
import { invalidateAccountChallenges, revokeAccountPush, revokeSessionPush } from './credential-state'
import { accountIsActive } from '@/lib/accounts/availability'

function fingerprint(hash: string): string { return createHash('sha256').update(hash).digest('hex') }
function matchesFingerprint(hash: string | null, expected: string): boolean {
  return Boolean(hash && /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(fingerprint(hash), 'hex'), Buffer.from(expected, 'hex')))
}
function viewEmailChange(row: EmailChange) {
  return emailChangeSchema.parse({ id: row.id, newEmail: row.new_email, oldConfirmed: Boolean(row.old_confirmed_at), newConfirmed: Boolean(row.new_confirmed_at), expiresAt: row.expires_at.toISOString() })
}
async function passwordProof(userId: string, password: string) {
  if (!apiRateLimiter.allow(`account-proof:${userId}`, 10)) throw new AuthError(429, 'RATE_LIMITED', 'Too many account verification attempts. Please wait a minute.')
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, password_hash: true, closed_at: true, suspended_at: true } })
  const valid = await verifyPassword(password, accountIsActive(user) ? user?.password_hash ?? null : null)
  if (!user || !accountIsActive(user) || !valid || !user.password_hash) throw new AuthError(400, 'CURRENT_PASSWORD_INCORRECT', 'Your current password is incorrect.')
  return { ...user, password_hash: user.password_hash }
}

export async function getAccountSecurity(userId: string) {
  await assertAuthSecurityReady()
  const [user, change] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { email: true, closed_at: true, suspended_at: true } }),
    prisma.emailChange.findFirst({ where: { user_id: userId, status: 'pending', expires_at: { gt: new Date() } }, orderBy: { createdAt: 'desc' } })])
  if (!user || !accountIsActive(user)) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  return accountSecuritySchema.parse({ email: user.email, delivery: availableAuthDelivery(), emailChange: change ? viewEmailChange(change) : null })
}

export async function changeAccountPassword(userId: string, input: unknown): Promise<void> {
  const data = accountPasswordSchema.parse(input)
  const proof = await passwordProof(userId, data.currentPassword)
  const passwordHash = await hashPassword(data.newPassword)
  await assertAuthSecurityReady()
  await withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', userId)) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { password_hash: true, email: true, closed_at: true, suspended_at: true } })
    if (!accountIsActive(current) || current.password_hash !== proof.password_hash || current.email !== proof.email) throw new AuthError(400, 'CREDENTIALS_CHANGED', 'Your account credentials changed. Sign in again before continuing.')
    await tx.user.update({ where: { id: userId }, data: { password_hash: passwordHash } })
    await tx.authSession.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: new Date() } })
    await invalidateAccountChallenges(tx, userId, true)
    await revokeAccountPush(tx, userId)
    await tx.notification.create({ data: { user_id: userId, kind: 'account_security', title: 'Password changed', body: 'Your password changed and all existing sessions were signed out. Contact the Rentral operator if this was unexpected.', href: '/marketplace/settings' } })
  })
}

export async function requestAccountEmailChange(userId: string, input: unknown) {
  const data = accountEmailChangeRequestSchema.parse(input)
  const configuration = authEmailConfiguration()
  await assertAuthSecurityReady()
  const proof = await passwordProof(userId, data.currentPassword)
  if (proof.email.toLowerCase() === data.newEmail) throw new AuthError(400, 'EMAIL_UNCHANGED', 'Choose a different email address.')
  const id = randomUUID(), oldToken = opaqueToken(), newToken = opaqueToken(), expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  const oldPayload = { from: configuration.from, to: proof.email, subject: 'Confirm your Rentral email change',
    text: `Confirmation code: ${oldToken}\n\nA change to ${data.newEmail} was requested. Enter this code in Rentral to confirm the current mailbox. The new mailbox must confirm separately. This code expires in 15 minutes. If you did not request this, keep this code private, change your password and contact the Rentral operator.` }
  const newPayload = { from: configuration.from, to: data.newEmail, subject: 'Confirm your new Rentral email address',
    text: `Confirmation code: ${newToken}\n\nEnter this code in Rentral to confirm the proposed new mailbox. The current mailbox must confirm separately. This code expires in 15 minutes. If you did not request this, ignore this email.` }
  let change: EmailChange
  try {
    change = await withTransaction(async tx => {
      if (!await lockRecord(tx, 'user', userId)) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
      const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, password_hash: true, closed_at: true, suspended_at: true } })
      if (!accountIsActive(current) || current.email !== proof.email || current.password_hash !== proof.password_hash) throw new AuthError(400, 'CREDENTIALS_CHANGED', 'Your account credentials changed. Sign in again before continuing.')
      if (await tx.user.findUnique({ where: { email: data.newEmail }, select: { id: true } })) throw new AuthError(409, 'EMAIL_UNAVAILABLE', 'This email address cannot be used for this change.')
      await tx.emailChange.updateMany({ where: { user_id: userId, status: 'pending' }, data: { status: 'cancelled' } })
      await cancelAuthEmails(tx, userId, ['email_change_old', 'email_change_new'])
      const created = await tx.emailChange.create({ data: { id, user_id: userId, old_email: current.email, new_email: data.newEmail,
        credential_fingerprint: fingerprint(current.password_hash!), old_token_hash: tokenHash(oldToken), new_token_hash: tokenHash(newToken),
        old_confirmed_at: null, new_confirmed_at: null, completed_at: null, status: 'pending', expires_at: expiresAt } })
      if (configuration.delivery === 'email') {
        await queueAuthEmail(tx, { userId, kind: 'email_change_old', dedupeKey: `email-change-old:${id}`, expiresAt, payload: oldPayload })
        await queueAuthEmail(tx, { userId, kind: 'email_change_new', dedupeKey: `email-change-new:${id}`, expiresAt, payload: newPayload })
      }
      return created
    })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new AuthError(409, 'EMAIL_UNAVAILABLE', 'This email address cannot be used for this change.')
    throw error
  }
  if (configuration.delivery === 'development-outbox') {
    await writeDevelopmentAuthEmail(oldPayload)
    await writeDevelopmentAuthEmail(newPayload)
  }
  return { pending: viewEmailChange(change), delivery: configuration.delivery }
}

export async function cancelAccountEmailChange(userId: string): Promise<void> {
  await assertAuthSecurityReady()
  await withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', userId)) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
    await tx.emailChange.updateMany({ where: { user_id: userId, status: 'pending' }, data: { status: 'cancelled' } })
    await cancelAuthEmails(tx, userId, ['email_change_old', 'email_change_new'])
  })
}

export async function confirmAccountEmailChange(input: unknown): Promise<{ status: 'waiting' | 'completed'; signInRequired: boolean }> {
  const checked = accountEmailConfirmSchema.safeParse(input)
  if (!checked.success) throw new AuthError(400, 'INVALID_EMAIL_CONFIRMATION', 'This confirmation code is invalid, expired or already used.')
  await assertAuthSecurityReady()
  const hashed = tokenHash(checked.data.token)
  const initial = await prisma.emailChange.findFirst({ where: { OR: [{ old_token_hash: hashed }, { new_token_hash: hashed }] }, select: { id: true, user_id: true } })
  if (!initial) throw new AuthError(400, 'INVALID_EMAIL_CONFIRMATION', 'This confirmation code is invalid, expired or already used.')
  try {
    return await withTransaction(async tx => {
      if (!await lockRecord(tx, 'user', initial.user_id)) throw new AuthError(400, 'INVALID_EMAIL_CONFIRMATION', 'This confirmation code is invalid, expired or already used.')
      const change = await tx.emailChange.findUniqueOrThrow({ where: { id: initial.id } })
      const user = await tx.user.findUniqueOrThrow({ where: { id: initial.user_id }, select: { email: true, password_hash: true, closed_at: true, suspended_at: true } })
      const old = change.old_token_hash === hashed
      if (change.status !== 'pending' || (!old && change.new_token_hash !== hashed) || change.expires_at <= new Date() || (old ? change.old_confirmed_at : change.new_confirmed_at)
        || !accountIsActive(user) || user.email !== change.old_email || !matchesFingerprint(user.password_hash, change.credential_fingerprint)) {
        throw new AuthError(400, 'INVALID_EMAIL_CONFIRMATION', 'This confirmation code is invalid, expired or already used.')
      }
      const bothConfirmed = old ? Boolean(change.new_confirmed_at) : Boolean(change.old_confirmed_at)
      await tx.emailChange.update({ where: { id: change.id }, data: { ...(old ? { old_confirmed_at: new Date() } : { new_confirmed_at: new Date() }),
        ...(bothConfirmed ? { status: 'completed', completed_at: new Date() } : {}) } })
      if (bothConfirmed) {
        await tx.user.update({ where: { id: change.user_id }, data: { email: change.new_email } })
        await tx.authSession.updateMany({ where: { user_id: change.user_id, revoked_at: null }, data: { revoked_at: new Date() } })
        await invalidateAccountChallenges(tx, change.user_id, true)
        await revokeAccountPush(tx, change.user_id)
        await tx.notification.create({ data: { user_id: change.user_id, kind: 'account_security', title: 'Email address changed',
          body: 'Both mailboxes confirmed your email change. Existing sessions were signed out. Use the new address to sign in.', href: '/marketplace/settings' } })
      }
      return { status: bothConfirmed ? 'completed' as const : 'waiting' as const, signInRequired: bothConfirmed }
    })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new AuthError(409, 'EMAIL_UNAVAILABLE', 'This email address cannot be used for this change.')
    throw error
  }
}

export async function getAccountSessions(userId: string, currentSessionId: string, cursor?: string) {
  let after: { at: string; id: string } | null = null
  if (cursor) {
    try { after = z.object({ at: z.string().datetime(), id: z.string().uuid() }).parse(JSON.parse(Buffer.from(z.string().max(512).parse(cursor), 'base64url').toString('utf8'))) }
    catch { throw new AuthError(400, 'INVALID_CURSOR', 'This session archive cursor is invalid.') }
  }
  const rows = await prisma.authSession.findMany({ where: { user_id: userId, revoked_at: null, expires_at: { gt: new Date() }, ...(after ? {
    OR: [{ createdAt: { lt: new Date(after.at) } }, { createdAt: new Date(after.at), id: { lt: after.id } }],
  } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, select: { id: true, createdAt: true, expires_at: true } })
  const last = rows.length > 50 ? rows[49] : null
  return accountSessionsSchema.parse({ items: rows.slice(0, 50).map(row => ({ id: row.id, createdAt: row.createdAt.toISOString(), expiresAt: row.expires_at.toISOString(), current: row.id === currentSessionId })),
    nextCursor: last ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null })
}

export async function revokeAccountSessions(userId: string, sessionId?: string): Promise<void> {
  if (sessionId) z.string().uuid().parse(sessionId)
  await withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', userId)) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
    await tx.authSession.updateMany({ where: { user_id: userId, ...(sessionId ? { id: sessionId } : {}), revoked_at: null }, data: { revoked_at: new Date() } })
    if (!sessionId) await revokeAccountPush(tx, userId)
    else await revokeSessionPush(tx, userId, sessionId)
  })
}
