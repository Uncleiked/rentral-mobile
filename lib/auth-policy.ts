export type AuthIdentity = { app_metadata?: Record<string, unknown>; is_anonymous?: boolean } | null

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export function authRedirect(pathname: string, user: AuthIdentity): string | null {
  const publicPages = ['/', '/sign-in', '/forgot-password', '/reset-password', '/auth/callback', '/help', '/terms', '/privacy', '/insights']
  if (publicPages.includes(pathname) || matchesRoute(pathname, '/api/webhooks')) return null
  // Versioned APIs perform bearer/cookie authorization and return JSON errors.
  if (matchesRoute(pathname, '/api/v1')) return null
  // Retired verification initiation returns JSON 410, including for old clients.
  if (pathname === '/api/verify') return null
  // This media route returns its own non-cacheable 401/404, never an HTML login page.
  if (/^\/api\/listings\/[^/]+\/source$/.test(pathname)) return null
  if (!user || user.is_anonymous) return '/sign-in'
  // Account authentication is sufficient. Profile details and historical KYC
  // decisions are never prerequisites for entering the marketplace.
  return matchesRoute(pathname, '/onboarding') ? '/marketplace' : null
}

// Only local absolute paths can become post-auth redirects.
export function safeAuthNext(value: string | null, origin: string): URL {
  const fallback = new URL('/marketplace', origin)
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return fallback
  try {
    const candidate = new URL(value, origin)
    return candidate.origin === fallback.origin ? candidate : fallback
  } catch {
    return fallback
  }
}
