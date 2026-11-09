import { SignJWT, jwtVerify } from 'jose'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { AuthError } from './types'

export const ACCESS_SECONDS = 15 * 60
export const REFRESH_SECONDS = 30 * 24 * 60 * 60
const ISSUER = 'rentral'
const AUDIENCE = 'rentral-app'

export function signingKey(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new AuthError(503, 'AUTH_UNAVAILABLE', 'Sign-in is not configured on this server.')
  return new TextEncoder().encode(secret)
}
export function opaqueToken(): string { return randomBytes(32).toString('base64url') }
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex') }
export async function accessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId).setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(`${ACCESS_SECONDS}s`).sign(signingKey())
}
export async function accessClaims(token: string): Promise<{ userId: string; sessionId: string }> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error('Missing session')
    return { userId: payload.sub, sessionId: payload.sid }
  } catch (error) {
    if (error instanceof AuthError) throw error
    throw new AuthError(401, 'UNAUTHORIZED', 'Your sign-in has expired. Please sign in again.')
  }
}

const revocationProofSchema = z.object({ sub: z.string().uuid(), sid: z.string().uuid(), iss: z.literal(ISSUER), aud: z.literal(AUDIENCE), iat: z.number().int().nonnegative(), exp: z.number().int().positive() }).strict()
/** A signed, bounded SAME-SID revocation capability only. Never use this for
 * authentication, API identity, refresh, authorization or issuing a new token. */
export async function revocationClaims(token: string): Promise<{ userId: string; sessionId: string }> {
  try {
    if (token.length > 4096) throw new Error('Invalid proof')
    const { payload, protectedHeader } = await jwtVerify(token, signingKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'], clockTolerance: REFRESH_SECONDS })
    const data = revocationProofSchema.parse(payload), now = Math.floor(Date.now() / 1000)
    if (protectedHeader.typ !== 'JWT' || data.iat > now + 60 || data.iat < now - REFRESH_SECONDS || data.exp <= data.iat || data.exp - data.iat > ACCESS_SECONDS + 1) throw new Error('Invalid proof')
    return { userId: data.sub, sessionId: data.sid }
  } catch (error) {
    if (error instanceof AuthError) throw error
    throw new AuthError(401, 'UNAUTHORIZED', 'Your sign-out proof is unavailable. Refresh account status before trying again.')
  }
}
