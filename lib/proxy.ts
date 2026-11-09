import { NextResponse, type NextRequest } from 'next/server'
import { authRedirect } from '@/lib/auth-policy'
import { authenticateAccess } from '@/lib/auth/service'
import { refreshWebSession } from '@/lib/auth/web-refresh'
import { ACCESS_COOKIE, REFRESH_COOKIE, sessionCookies } from '@/lib/auth/cookies'
import { AuthError, type AuthUser } from '@/lib/auth/types'

function devOrigin(request: NextRequest): string | null {
  if (process.env.NODE_ENV === 'production') return null
  try {
    const origin = new URL(request.headers.get('origin') ?? '')
    return origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ? origin.origin : null
  } catch { return null }
}
export async function updateSession(request: NextRequest) {
  if (/^\/api\/v1(?:\/|$)/.test(request.nextUrl.pathname)) {
    const origin = devOrigin(request)
    const response = request.method === 'OPTIONS' && origin ? new NextResponse(null, { status: 204 }) : NextResponse.next({ request })
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Upload-Path, Range')
      response.headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length')
      response.headers.append('Vary', 'Origin')
    }
    return response
  }
  if (request.nextUrl.pathname === '/api/internal/media-worker' || request.nextUrl.pathname === '/api/internal/lifecycle-worker') return NextResponse.next({ request })
  let user: AuthUser | null = null
  let refreshed: Awaited<ReturnType<typeof refreshWebSession>> | null = null
  const token = request.cookies.get(ACCESS_COOKIE)?.value
  let canRefresh = !token
  if (token) {
    try { user = (await authenticateAccess(token)).user }
    catch (error) { canRefresh = error instanceof AuthError && error.status === 401 }
  }
  if (!user && canRefresh && request.cookies.has(REFRESH_COOKIE)) {
    try {
      refreshed = await refreshWebSession(request.cookies.get(REFRESH_COOKIE)!.value)
      user = refreshed.user
      for (const cookie of sessionCookies(refreshed)) request.cookies.set(cookie.name, cookie.value)
    } catch { /* A losing rotation must not erase another response's new cookies. */ }
  }
  const destination = authRedirect(request.nextUrl.pathname, user)
  const response = destination ? NextResponse.redirect(new URL(destination, request.url)) : NextResponse.next({ request })
  if (refreshed) for (const cookie of sessionCookies(refreshed)) response.cookies.set(cookie)
  if (destination) response.headers.set('Cache-Control', 'private, no-store')
  return response
}
