import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { googleConfiguration } from '@/lib/auth/google-config'
import { exchangeGoogleCode, readGoogleFinish, sealGoogleCookie, startGoogleFlow, validateGoogleFlow } from '@/lib/auth/google-oauth'

const clientId = '1234567890-rentral.apps.googleusercontent.com', nonce = 'n'.repeat(43)
let pair: Awaited<ReturnType<typeof generateKeyPair>>, jwk: Awaited<ReturnType<typeof exportJWK>>
beforeAll(async () => { pair = await generateKeyPair('RS256'); jwk = { ...await exportJWK(pair.publicKey), kid: 'fixture-key', alg: 'RS256', use: 'sig' } })
beforeEach(() => {
  vi.stubEnv('JWT_SECRET', 'google-cookie-fixture-key-that-is-long-enough')
  vi.stubEnv('GOOGLE_AUTH_ENABLED', 'true'); vi.stubEnv('GOOGLE_CLIENT_ID', clientId); vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fixture-client-secret')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })
async function identityToken(changes: Record<string, unknown> = {}) {
  return new SignJWT({ sub: 'google-subject-123', email: 'google@example.test', email_verified: true, nonce, ...changes })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' }).setIssuer('https://accounts.google.com').setAudience(Array.isArray(changes.aud) ? changes.aud as string[] : clientId).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey)
}
function provider(token: string) {
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.redirect).toBe('error'); expect(init.cache).toBe('no-store')
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] })
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const form = new URLSearchParams(init.body as URLSearchParams)
    expect(form.get('redirect_uri')).toBe('http://localhost:3000/auth/google/callback')
    expect(form.get('code_verifier')).toBe('v'.repeat(43))
    return Response.json({ id_token: token, access_token: 'discarded-provider-access-token' })
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
describe('Google web configuration and encrypted browser binding', () => {
  it('remains disabled without explicit setup and rejects invalid origins', () => {
    expect(googleConfiguration()?.callback).toBe('http://localhost:3000/auth/google/callback')
    vi.stubEnv('GOOGLE_AUTH_ENABLED', 'false'); expect(googleConfiguration()).toBeNull()
    vi.stubEnv('GOOGLE_AUTH_ENABLED', 'true'); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://rentral.example'); expect(googleConfiguration()).toBeNull()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://rentral.example/path'); expect(googleConfiguration()).toBeNull()
  })
  it('uses nonce, state, PKCE and a trusted configured callback', async () => {
    const flow = await startGoogleFlow({ mode: 'signup', accountType: 'organization', termsAccepted: true })
    const url = new URL(flow.url), state = url.searchParams.get('state')
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/google/callback')
    expect(flow.cookie).not.toContain('organization')
    const decoded = await validateGoogleFlow(flow.cookie, state, 'http://localhost:3000')
    expect(decoded.intent).toEqual({ mode: 'signup', accountType: 'organization', termsAccepted: true })
    await expect(validateGoogleFlow(flow.cookie, 'x'.repeat(43), 'http://localhost:3000')).rejects.toMatchObject({ code: 'GOOGLE_EXPIRED' })
    await expect(validateGoogleFlow(flow.cookie, state, 'https://evil.example')).rejects.toMatchObject({ code: 'GOOGLE_EXPIRED' })
    await expect(readGoogleFinish(flow.cookie)).rejects.toMatchObject({ code: 'GOOGLE_EXPIRED' })
  })
  it('rejects missing signup choices and tampered or expired continuation cookies', async () => {
    await expect(startGoogleFlow({ mode: 'signup' })).rejects.toThrow()
    const cookie = await sealGoogleCookie({ kind: 'new', identity: { subject: 'subject', email: 'one@example.test' } }, 'finish')
    expect(await readGoogleFinish(cookie)).toMatchObject({ kind: 'new' })
    await expect(readGoogleFinish(cookie.slice(0, -10) + 'tampered')).rejects.toMatchObject({ code: 'GOOGLE_EXPIRED' })
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 301000)
    await expect(readGoogleFinish(cookie)).rejects.toMatchObject({ code: 'GOOGLE_EXPIRED' })
  })
})
describe('server verified Google ID tokens', () => {
  it('returns only verified subject/email and discards provider tokens', async () => {
    provider(await identityToken())
    expect(await exchangeGoogleCode('one-use-code', { verifier: 'v'.repeat(43), nonce })).toEqual({ subject: 'google-subject-123', email: 'google@example.test' })
  })
  it.each([{ nonce: 'wrong-nonce' }, { email_verified: false }, { azp: 'another-client' }, { sub: 'invalid subject' }, { aud: [clientId, 'another-client'] }])('rejects invalid claims: %j', async claims => {
    provider(await identityToken(claims))
    await expect(exchangeGoogleCode('one-use-code', { verifier: 'v'.repeat(43), nonce })).rejects.toMatchObject({ code: 'GOOGLE_FAILED' })
  })
  it('rejects unsigned/tampered tokens and provider failures without exposing their bodies', async () => {
    provider('not-a-signed-token')
    await expect(exchangeGoogleCode('one-use-code', { verifier: 'v'.repeat(43), nonce })).rejects.toMatchObject({ code: 'GOOGLE_FAILED' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret provider error', { status: 500 })))
    await expect(exchangeGoogleCode('one-use-code', { verifier: 'v'.repeat(43), nonce })).rejects.toThrow('Google sign-in could not be verified.')
  })
})
