import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { EncryptJWT, jwtDecrypt, jwtVerify, createLocalJWKSet, type JSONWebKeySet } from 'jose'
import { z } from 'zod'
import { signingKey } from './token'
import { AuthError } from './types'
import { requireGoogleConfiguration } from './google-config'

export const GOOGLE_FLOW_COOKIE = 'rentral_google_flow'
export const GOOGLE_FINISH_COOKIE = 'rentral_google_finish'
export const GOOGLE_FLOW_SECONDS = 600
export const GOOGLE_FINISH_SECONDS = 300
const tokenText = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const googleIdentitySchema = z.object({ subject: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/), email: z.string().trim().toLowerCase().email().max(254) }).strict()
export type GoogleIdentity = z.infer<typeof googleIdentitySchema>
const intentSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('signin') }).strict(),
  z.object({ mode: z.literal('signup'), accountType: z.enum(['individual', 'organization']), termsAccepted: z.literal(true) }).strict(),
])
export const googleStartSchema = intentSchema
export type GoogleIntent = z.infer<typeof intentSchema>
const flowSchema = z.object({ state: tokenText, nonce: tokenText, verifier: tokenText, origin: z.string().url(), intent: intentSchema })
const finishSchema = z.object({ identity: googleIdentitySchema, kind: z.enum(['new', 'link']), userId: z.uuid().optional(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional() })
export type GoogleFinish = z.infer<typeof finishSchema>
const cookieKey = () => createHash('sha256').update(signingKey()).update('rentral.google.cookies.v1').digest()
export const googleCookieOptions = { httpOnly: true, sameSite: 'lax' as const, path: '/auth/google' }
export function googleCookieSecure(): boolean { return requireGoogleConfiguration().origin.startsWith('https:') }
export async function sealGoogleCookie(value: Record<string, unknown>, purpose: 'flow' | 'finish'): Promise<string> {
  return new EncryptJWT(value).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuer('rentral-google').setAudience(purpose)
    .setIssuedAt().setExpirationTime(purpose === 'flow' ? '10m' : '5m').encrypt(cookieKey())
}
async function openGoogleCookie(value: string | undefined, purpose: 'flow' | 'finish') {
  if (!value || value.length > 6000) throw new AuthError(400, 'GOOGLE_EXPIRED', 'This Google sign-in has expired. Start again.')
  try { return (await jwtDecrypt(value, cookieKey(), { issuer: 'rentral-google', audience: purpose, keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] })).payload }
  catch { throw new AuthError(400, 'GOOGLE_EXPIRED', 'This Google sign-in has expired. Start again.') }
}
export async function readGoogleFinish(value: string | undefined): Promise<GoogleFinish> {
  try { return finishSchema.parse(await openGoogleCookie(value, 'finish')) }
  catch { throw new AuthError(400, 'GOOGLE_EXPIRED', 'This Google sign-in has expired. Start again.') }
}
export async function startGoogleFlow(input: unknown): Promise<{ url: string; cookie: string }> {
  const intent = googleStartSchema.parse(input), config = requireGoogleConfiguration()
  const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url')
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback, response_type: 'code', scope: 'openid email profile',
    state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString()
  return { url: url.href, cookie: await sealGoogleCookie({ state, nonce, verifier, origin: config.origin, intent }, 'flow') }
}
export async function validateGoogleFlow(value: string | undefined, state: string | null, requestOrigin: string) {
  try {
    const flow = flowSchema.parse(await openGoogleCookie(value, 'flow')), config = requireGoogleConfiguration()
    if (!state || state.length !== flow.state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(flow.state)) ||
      requestOrigin !== config.origin || flow.origin !== config.origin) throw new Error('Invalid flow')
    return flow
  } catch { throw new AuthError(400, 'GOOGLE_EXPIRED', 'This Google sign-in has expired. Start again.') }
}
async function boundedJson(url: string, init: RequestInit, maximum = 32768): Promise<unknown> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: controller.signal })
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Provider unavailable') }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > maximum) { await reader.cancel(); throw new Error('Provider response too large') }; chunks.push(part.value) }
    } finally { reader.releaseLock() }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally { clearTimeout(timer) }
}
let keys: { expires: number; value: JSONWebKeySet } | undefined
async function googleKeys(): Promise<ReturnType<typeof createLocalJWKSet>> {
  if (!keys || keys.expires <= Date.now()) {
    const schema = z.object({ keys: z.array(z.object({ kty: z.literal('RSA'), kid: z.string().min(1).max(200), use: z.literal('sig').optional(), alg: z.literal('RS256').optional(), n: z.string().min(100).max(1500), e: z.string().min(1).max(20) }).passthrough()).min(1).max(10) }).strict()
    const value = schema.parse(await boundedJson('https://www.googleapis.com/oauth2/v3/certs', {}))
    keys = { value, expires: Date.now() + 5 * 60 * 1000 }
  }
  return createLocalJWKSet(keys.value)
}
export async function exchangeGoogleCode(code: string, flow: { verifier: string; nonce: string }): Promise<GoogleIdentity> {
  const config = requireGoogleConfiguration()
  if (!code || code.length > 8192 || /[\u0000-\u001f]/.test(code)) throw new AuthError(400, 'GOOGLE_FAILED', 'Google sign-in could not be completed. Start again.')
  try {
    const body = z.object({ id_token: z.string().min(1).max(12000) }).passthrough().parse(await boundedJson('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.callback, grant_type: 'authorization_code', code_verifier: flow.verifier }),
    }))
    const { payload } = await jwtVerify(body.id_token, await googleKeys(), { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: config.clientId,
      algorithms: ['RS256'], maxTokenAge: '10m', clockTolerance: 5, requiredClaims: ['sub', 'iat', 'exp', 'nonce', 'email', 'email_verified'] })
    if (payload.nonce !== flow.nonce || payload.email_verified !== true || (payload.azp !== undefined && payload.azp !== config.clientId) || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId)) throw new Error('Invalid identity')
    return googleIdentitySchema.parse({ subject: payload.sub, email: payload.email })
  } catch { throw new AuthError(400, 'GOOGLE_FAILED', 'Google sign-in could not be verified. Please try again.') }
}
