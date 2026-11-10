import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { defaultAccountHandle, isUniqueConstraintError } from '@/lib/accounts/bootstrap'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { hashPassword, verifyPassword } from './password'
import { ACCESS_SECONDS, REFRESH_SECONDS, accessClaims, accessToken, revocationClaims, opaqueToken, signingKey, tokenHash } from './token'
import { AuthError, type AuthSession, type AuthUser } from './types'
import { apiRateLimiter } from '@/lib/api/rate-limit'
import { assertAuthSecurityReady, authSecurityPrepared } from '@/lib/database/readiness'
import { authEmailConfiguration, type AuthDelivery } from './email-config'
import { writeDevelopmentAuthEmail } from './email-development'
import { cancelAuthEmails, queueAuthEmail } from './email-delivery'
import { invalidateAccountChallenges, revokeAccountPush, revokeSessionPush } from './credential-state'
import { accountIsActive } from '@/lib/accounts/availability'

export const credentialsSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(8).max(128) }).strict()
export const loginSchema = credentialsSchema.extend({ password: z.string().min(1).max(128) })
const authUserSelect = { id: true, email: true, password_hash: true, staff_role: true, closed_at: true, suspended_at: true } satisfies Prisma.UserSelect
type Account = Prisma.UserGetPayload<{ select: typeof authUserSelect }>

function publicUser(user: Account): AuthUser {
  return { id: user.id, email: user.email, is_anonymous: false, user_metadata: {}, app_metadata: user.staff_role ? { role: user.staff_role } : {} }
}
async function sessionResponse(user: Account, sessionId: string, refreshToken: string): Promise<AuthSession> {
  return { access_token: await accessToken(user.id, sessionId), refresh_token: refreshToken, token_type: 'bearer',
    expires_in: ACCESS_SECONDS, expires_at: Math.floor(Date.now() / 1000) + ACCESS_SECONDS, user: publicUser(user) }
}
async function newSession(user: Account): Promise<AuthSession> {
  const refresh = opaqueToken()
  const current = await withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', user.id)) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Your email or password is incorrect.')
    const account = await tx.user.findUnique({ where: { id: user.id }, select: authUserSelect })
    // Password verification runs outside retries. Serialize session creation
    // with resets, and reject a credential snapshot superseded while hashing.
    if (!accountIsActive(account) || !account || account.password_hash !== user.password_hash || account.email !== user.email) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Your email or password is incorrect.')
    const session = await tx.authSession.create({ data: { user_id: account.id, refresh_hash: tokenHash(refresh), revoked_at: null, expires_at: new Date(Date.now() + REFRESH_SECONDS * 1000) }, select: { id: true } })
    return { account, sessionId: session.id }
  })
  return sessionResponse(current.account, current.sessionId, refresh)
}
export async function registerAccount(input: unknown): Promise<AuthSession> {
  const data = credentialsSchema.parse(input)
  signingKey()
  const passwordHash = await hashPassword(data.password)
  const id = randomUUID()
  try {
    const user = await prisma.user.create({ data: { id, email: data.email, username: defaultAccountHandle(id), account_type: 'individual', password_hash: passwordHash }, select: authUserSelect })
    return newSession(user)
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new AuthError(409, 'ACCOUNT_EXISTS', 'An account with this email already exists. Sign in or reset your password.')
    throw error
  }
}
export async function loginAccount(input: unknown): Promise<AuthSession> {
  const data = loginSchema.parse(input)
  signingKey()
  if (!apiRateLimiter.allow(`password:${tokenHash(data.email)}`, 10)) throw new AuthError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait a minute.')
  const user = await prisma.user.findUnique({ where: { email: data.email }, select: authUserSelect })
  const valid = await verifyPassword(data.password, accountIsActive(user) ? user?.password_hash ?? null : null)
  if (!valid || !user || !accountIsActive(user)) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Your email or password is incorrect.')
  return newSession(user)
}
export async function authenticateAccess(token: string): Promise<{ user: AuthUser; sessionId: string }> {
  const claims = await accessClaims(token)
  const session = await prisma.authSession.findUnique({ where: { id: claims.sessionId }, select: {
    user_id: true, revoked_at: true, expires_at: true, user: { select: authUserSelect },
  } })
  if (!session || !accountIsActive(session.user) || session.user_id !== claims.userId || session.revoked_at || session.expires_at <= new Date()) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  return { user: publicUser(session.user), sessionId: claims.sessionId }
}
export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  // Do not consume the one-use token if this server cannot sign its replacement.
  signingKey()
  const session = await prisma.authSession.findUnique({ where: { refresh_hash: tokenHash(refreshToken) }, select: {
    id: true, user_id: true, revoked_at: true, expires_at: true, user: { select: authUserSelect },
  } })
  if (!session || !accountIsActive(session.user) || session.revoked_at || session.expires_at <= new Date()) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  const replacement = opaqueToken()
  const changed = await prisma.authSession.updateMany({ where: { id: session.id, refresh_hash: tokenHash(refreshToken), revoked_at: null, expires_at: { gt: new Date() } }, data: { refresh_hash: tokenHash(replacement) } })
  if (changed.count !== 1) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  return sessionResponse(session.user, session.id, replacement)
}
export async function revokeSession(sessionId: string, expectedUserId?: string): Promise<boolean> {
  const session = await prisma.authSession.findUnique({ where: { id: sessionId }, select: { user_id: true } })
  if (!session) return true
  if (expectedUserId && session.user_id !== expectedUserId) throw new AuthError(401, 'UNAUTHORIZED', 'Your sign-out proof is unavailable.')
  return withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', session.user_id)) return false
    await tx.authSession.updateMany({ where: { id: sessionId, user_id: session.user_id, revoked_at: null }, data: { revoked_at: new Date() } })
    await revokeSessionPush(tx, session.user_id, sessionId)
    return true
  })
}
export async function revokeAccessToken(token: string): Promise<boolean> {
  const proof = await revocationClaims(token)
  return revokeSession(proof.sessionId, proof.userId)
}
export async function revokeRefreshToken(refreshToken: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) return false
  const session = await prisma.authSession.findUnique({ where: { refresh_hash: tokenHash(refreshToken) }, select: { id: true, user_id: true } })
  if (!session) return false
  return withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', session.user_id)) return false
    // Possession was checked before the lock; revoke the same SID even if a
    // refresh rotated that proved capability while this transaction waited.
    await tx.authSession.updateMany({ where: { id: session.id, user_id: session.user_id, revoked_at: null }, data: { revoked_at: new Date() } })
    await revokeSessionPush(tx, session.user_id, session.id)
    return true
  })
}
export async function changePassword(userId: string, password: string): Promise<void> {
  const checked = credentialsSchema.shape.password.parse(password)
  const passwordHash = await hashPassword(checked)
  const prepared = await authSecurityPrepared()
  await withTransaction(async tx => {
    await lockRecord(tx, 'user', userId)
    if (!accountIsActive(await tx.user.findUnique({ where: { id: userId }, select: { closed_at: true, suspended_at: true } }))) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
    await tx.user.update({ where: { id: userId }, data: { password_hash: passwordHash } })
    await tx.authSession.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: new Date() } })
    await invalidateAccountChallenges(tx, userId, prepared)
    await revokeAccountPush(tx, userId)
  })
}
export async function requestPasswordReset(emailInput: unknown): Promise<{ delivery: AuthDelivery }> {
  const email = credentialsSchema.shape.email.parse(emailInput)
  const configuration = authEmailConfiguration()
  if (configuration.delivery === 'email') await assertAuthSecurityReady()
  if (!apiRateLimiter.allow(`reset:${tokenHash(email)}`, 5)) throw new AuthError(429, 'RATE_LIMITED', 'Too many recovery requests. Please wait a minute.')
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, closed_at: true, suspended_at: true } })
  if (user && accountIsActive(user)) {
    const token = opaqueToken()
    const id = randomUUID(), expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    const payload = { from: configuration.from, to: email, subject: 'Your Rentral password recovery code',
      text: `Reset code: ${token}\n\nEnter this code in Rentral to choose a new password. It expires in 15 minutes. If you did not request it, ignore this email. Rentral will never ask you to share this code.` }
    try {
      if (configuration.delivery === 'email') {
        await withTransaction(async tx => {
          if (!await lockRecord(tx, 'user', user.id)) return
          const current = await tx.user.findUnique({ where: { id: user.id }, select: { email: true, closed_at: true, suspended_at: true } })
          if (current?.email !== email || !accountIsActive(current)) return
          await tx.passwordReset.updateMany({ where: { user_id: user.id, used_at: null }, data: { used_at: new Date() } })
          await cancelAuthEmails(tx, user.id, ['password_reset'])
          await tx.passwordReset.create({ data: { id, user_id: user.id, token_hash: tokenHash(token), used_at: null, expires_at: expiresAt } })
          await queueAuthEmail(tx, { userId: user.id, kind: 'password_reset', dedupeKey: `password-reset:${id}`, expiresAt, payload })
        })
      } else {
        // Preserve the explicitly enabled local developer mailbox without requiring new feature preparation.
        await prisma.passwordReset.create({ data: { id, user_id: user.id, token_hash: tokenHash(token), used_at: null, expires_at: expiresAt } })
        await writeDevelopmentAuthEmail(payload)
      }
    } catch {
      // Provider/job/filesystem outcomes must not disclose whether this address has an account.
      console.error('[auth/recovery] Delivery preparation unavailable')
    }
  }
  return { delivery: configuration.delivery }
}
export async function resetPassword(input: unknown): Promise<void> {
  const data = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: credentialsSchema.shape.password }).strict().parse(input)
  const existing = await prisma.passwordReset.findUnique({ where: { token_hash: tokenHash(data.token) }, select: { id: true, user_id: true } })
  if (!existing) throw new AuthError(400, 'INVALID_RESET', 'This reset code has expired or has already been used.')
  const passwordHash = await hashPassword(data.password)
  const prepared = await authSecurityPrepared()
  await withTransaction(async tx => {
    await lockRecord(tx, 'user', existing.user_id)
    if (!accountIsActive(await tx.user.findUnique({ where: { id: existing.user_id }, select: { closed_at: true, suspended_at: true } }))) throw new AuthError(400, 'INVALID_RESET', 'This reset code has expired or has already been used.')
    const consumed = await tx.passwordReset.updateMany({ where: { id: existing.id, used_at: null, expires_at: { gt: new Date() } }, data: { used_at: new Date() } })
    if (consumed.count !== 1) throw new AuthError(400, 'INVALID_RESET', 'This reset code has expired or has already been used.')
    await tx.user.update({ where: { id: existing.user_id }, data: { password_hash: passwordHash } })
    await tx.authSession.updateMany({ where: { user_id: existing.user_id, revoked_at: null }, data: { revoked_at: new Date() } })
    await invalidateAccountChallenges(tx, existing.user_id, prepared)
    await revokeAccountPush(tx, existing.user_id)
  })
}
