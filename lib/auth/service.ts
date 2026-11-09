import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { defaultAccountHandle, isUniqueConstraintError } from '@/lib/accounts/bootstrap'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { hashPassword, verifyPassword } from './password'
import { ACCESS_SECONDS, REFRESH_SECONDS, accessClaims, accessToken, opaqueToken, signingKey, tokenHash } from './token'
import { AuthError, type AuthSession, type AuthUser } from './types'
import { apiRateLimiter } from '@/lib/api/rate-limit'

export const credentialsSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(8).max(128) }).strict()
export const loginSchema = credentialsSchema.extend({ password: z.string().min(1).max(128) })
const authUserSelect = { id: true, email: true, password_hash: true, staff_role: true } satisfies Prisma.UserSelect
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
    if (!account || account.password_hash !== user.password_hash) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Your email or password is incorrect.')
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
  const valid = await verifyPassword(data.password, user?.password_hash ?? null)
  if (!valid || !user) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Your email or password is incorrect.')
  return newSession(user)
}
export async function authenticateAccess(token: string): Promise<{ user: AuthUser; sessionId: string }> {
  const claims = await accessClaims(token)
  const session = await prisma.authSession.findUnique({ where: { id: claims.sessionId }, select: {
    user_id: true, revoked_at: true, expires_at: true, user: { select: authUserSelect },
  } })
  if (!session || session.user_id !== claims.userId || session.revoked_at || session.expires_at <= new Date()) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  return { user: publicUser(session.user), sessionId: claims.sessionId }
}
export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  // Do not consume the one-use token if this server cannot sign its replacement.
  signingKey()
  const session = await prisma.authSession.findUnique({ where: { refresh_hash: tokenHash(refreshToken) }, select: {
    id: true, user_id: true, revoked_at: true, expires_at: true, user: { select: authUserSelect },
  } })
  if (!session || session.revoked_at || session.expires_at <= new Date()) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  const replacement = opaqueToken()
  const changed = await prisma.authSession.updateMany({ where: { id: session.id, refresh_hash: tokenHash(refreshToken), revoked_at: null, expires_at: { gt: new Date() } }, data: { refresh_hash: tokenHash(replacement) } })
  if (changed.count !== 1) throw new AuthError(401, 'UNAUTHORIZED', 'Please sign in again.')
  return sessionResponse(session.user, session.id, replacement)
}
export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.authSession.updateMany({ where: { id: sessionId, revoked_at: null }, data: { revoked_at: new Date() } })
}
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) return
  await prisma.authSession.updateMany({ where: { refresh_hash: tokenHash(refreshToken), revoked_at: null }, data: { revoked_at: new Date() } })
}
export async function changePassword(userId: string, password: string): Promise<void> {
  const checked = credentialsSchema.shape.password.parse(password)
  const passwordHash = await hashPassword(checked)
  await withTransaction(async tx => {
    await lockRecord(tx, 'user', userId)
    await tx.user.update({ where: { id: userId }, data: { password_hash: passwordHash } })
    await tx.authSession.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: new Date() } })
    await tx.passwordReset.updateMany({ where: { user_id: userId, used_at: null }, data: { used_at: new Date() } })
  })
}
export async function requestPasswordReset(emailInput: unknown): Promise<{ delivery: 'development-outbox' }> {
  const email = credentialsSchema.shape.email.parse(emailInput)
  if (process.env.NODE_ENV === 'production' || process.env.AUTH_DEV_EMAIL_OUTBOX !== 'true') throw new AuthError(503, 'RECOVERY_UNAVAILABLE', 'Password recovery is not configured. Contact the Rentral operator.')
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (user) {
    const token = opaqueToken()
    await prisma.passwordReset.create({ data: { user_id: user.id, token_hash: tokenHash(token), used_at: null, expires_at: new Date(Date.now() + 15 * 60 * 1000) } })
    const directory = path.resolve(process.env.RENTRAL_STORAGE_DIR || path.join(process.cwd(), 'storage'), 'mail-outbox')
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, `${randomUUID()}.txt`), `Rentral local password recovery\nEmail: ${email}\nReset code: ${token}\nExpires in15 minutes. This private file is never served by the upload API.\n`, { encoding: 'utf8', mode: 0o600 })
  }
  return { delivery: 'development-outbox' }
}
export async function resetPassword(input: unknown): Promise<void> {
  const data = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: credentialsSchema.shape.password }).strict().parse(input)
  const existing = await prisma.passwordReset.findUnique({ where: { token_hash: tokenHash(data.token) }, select: { id: true, user_id: true } })
  if (!existing) throw new AuthError(400, 'INVALID_RESET', 'This reset code has expired or has already been used.')
  const passwordHash = await hashPassword(data.password)
  await withTransaction(async tx => {
    await lockRecord(tx, 'user', existing.user_id)
    const consumed = await tx.passwordReset.updateMany({ where: { id: existing.id, used_at: null, expires_at: { gt: new Date() } }, data: { used_at: new Date() } })
    if (consumed.count !== 1) throw new AuthError(400, 'INVALID_RESET', 'This reset code has expired or has already been used.')
    await tx.user.update({ where: { id: existing.user_id }, data: { password_hash: passwordHash } })
    await tx.authSession.updateMany({ where: { user_id: existing.user_id, revoked_at: null }, data: { revoked_at: new Date() } })
    await tx.passwordReset.updateMany({ where: { user_id: existing.user_id, used_at: null }, data: { used_at: new Date() } })
  })
}
