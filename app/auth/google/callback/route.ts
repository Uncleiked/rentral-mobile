import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireGoogleConfiguration } from '@/lib/auth/google-config'
import { completeVerifiedGoogle } from '@/lib/auth/google-accounts'
import { GOOGLE_FLOW_COOKIE, GOOGLE_FINISH_COOKIE, GOOGLE_FINISH_SECONDS, googleCookieOptions, googleCookieSecure, validateGoogleFlow, exchangeGoogleCode, sealGoogleCookie } from '@/lib/auth/google-oauth'
import { sessionCookies } from '@/lib/auth/cookies'

export async function GET(request: Request): Promise<Response> {
  // Never log the code, Google tokens, account identity or provider error text.
  const store = await cookies(), incoming = new URL(request.url)
  let origin = incoming.origin, response: NextResponse
  try {
    const config = requireGoogleConfiguration(); origin = config.origin
    if (incoming.search.length > 12000 || ['code', 'state', 'error'].some(key => incoming.searchParams.getAll(key).length > 1)) throw new Error('Invalid callback')
    const flow = await validateGoogleFlow(store.get(GOOGLE_FLOW_COOKIE)?.value, incoming.searchParams.get('state'), incoming.origin)
    if (incoming.searchParams.has('error')) {
      response = NextResponse.redirect(new URL('/sign-in?google=cancelled', origin))
    } else {
      const identity = await exchangeGoogleCode(incoming.searchParams.get('code') ?? '', flow)
      const result = await completeVerifiedGoogle(identity, flow.intent)
      if (result.kind === 'session') {
        response = NextResponse.redirect(new URL('/marketplace', origin))
        for (const cookie of sessionCookies(result.session)) response.cookies.set(cookie)
      } else {
        response = NextResponse.redirect(new URL('/auth/google/finish', origin))
        response.cookies.set({ ...googleCookieOptions, secure: googleCookieSecure(), name: GOOGLE_FINISH_COOKIE, value: await sealGoogleCookie(result.challenge, 'finish'), maxAge: GOOGLE_FINISH_SECONDS })
      }
    }
  } catch { response = NextResponse.redirect(new URL('/sign-in?google=failed', origin)) }
  response.cookies.set({ ...googleCookieOptions, secure: origin.startsWith('https:'), name: GOOGLE_FLOW_COOKIE, value: '', maxAge: 0 })
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
