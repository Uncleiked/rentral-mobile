import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { authRedirect } from '@/lib/auth-policy'

export async function updateSession(request: NextRequest) {
  // This exact service route authenticates its own bearer secret, not a browser
  // cookie. It must remain reachable by the scheduler when Auth is unavailable.
  if (request.nextUrl.pathname === '/api/internal/media-worker' ||
      request.nextUrl.pathname === '/api/internal/lifecycle-worker' ||
      /^\/api\/v1(?:\/|$)/.test(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const { data: { user } } = await supabase.auth.getUser()
  const destination = authRedirect(request.nextUrl.pathname, user)
  if (destination) {
    const response = NextResponse.redirect(new URL(destination, request.url))
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie)
    for (const header of ['cache-control', 'expires', 'pragma']) {
      const value = supabaseResponse.headers.get(header)
      if (value) response.headers.set(header, value)
    }
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }

  return supabaseResponse
}
