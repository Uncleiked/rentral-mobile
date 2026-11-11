'use server'

import { cookies, headers } from 'next/headers'
import { assertGoogleAuthReady } from '@/lib/database/readiness'
import { requireGoogleConfiguration } from '@/lib/auth/google-config'
import { googleCookieOptions, googleCookieSecure, GOOGLE_FINISH_COOKIE, GOOGLE_FLOW_COOKIE, GOOGLE_FLOW_SECONDS, readGoogleFinish, startGoogleFlow } from '@/lib/auth/google-oauth'
import { finishGoogleAccount } from '@/lib/auth/google-accounts'
import { sessionCookies } from '@/lib/auth/cookies'
import { AuthError } from '@/lib/auth/types'
import { z } from 'zod'
import { apiRateLimiter } from '@/lib/api/rate-limit'
import { tokenHash } from '@/lib/auth/token'

async function assertOrigin(): Promise<void> {
  const origin = (await headers()).get('origin'), config = requireGoogleConfiguration()
  if (origin !== config.origin) throw new AuthError(403, 'ORIGIN_REJECTED', 'Open sign-in from the configured Rentral address.')
}
function message(error: unknown): string {
  return error instanceof AuthError ? error.message : error instanceof z.ZodError ? 'Check the account details and try again.' : 'Google sign-in is temporarily unavailable. You can still use email and password.'
}
export async function startGoogleSignIn(input: unknown): Promise<{ url: string } | { error: string }> {
  try {
    await assertOrigin()
    const remote = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    if (!apiRateLimiter.allow('google-start:' + tokenHash(remote), 15)) throw new AuthError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait a minute.')
    await assertGoogleAuthReady()
    const flow = await startGoogleFlow(input), store = await cookies()
    store.set({ ...googleCookieOptions, secure: googleCookieSecure(), name: GOOGLE_FINISH_COOKIE, value: '', maxAge: 0 })
    store.set({ ...googleCookieOptions, secure: googleCookieSecure(), name: GOOGLE_FLOW_COOKIE, value: flow.cookie, maxAge: GOOGLE_FLOW_SECONDS })
    return { url: flow.url }
  } catch (error) { return { error: message(error) } }
}
export async function finishGoogleSignIn(form: FormData): Promise<{ success: true; redirectTo: string } | { error: string }> {
  try {
    await assertOrigin()
    const store = await cookies(), challenge = await readGoogleFinish(store.get(GOOGLE_FINISH_COOKIE)?.value)
    const accountType = form.get('accountType'), password = form.get('password')
    if (typeof password === 'string' && password.length > 128) throw new AuthError(400, 'INVALID_CREDENTIALS', 'Check your password and try again.')
    const session = await finishGoogleAccount(challenge, { password: typeof password === 'string' ? password : undefined,
      accountType: accountType === 'individual' || accountType === 'organization' ? accountType : undefined, termsAccepted: form.get('termsAccepted') === 'on' })
    for (const cookie of sessionCookies(session)) store.set(cookie)
    store.set({ ...googleCookieOptions, secure: googleCookieSecure(), name: GOOGLE_FINISH_COOKIE, value: '', maxAge: 0 })
    return { success: true, redirectTo: '/marketplace' }
  } catch (error) { return { error: message(error) } }
}
