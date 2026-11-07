export type AuthIdentity = { app_metadata?: Record<string, unknown> } | null

export function onboardingComplete(user: AuthIdentity): boolean {
  const metadata = user?.app_metadata
  return metadata?.kyc_verified === true && metadata.profile_completed === true &&
    typeof metadata.username === 'string' && metadata.username.trim().length > 0
}

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

export function authRedirect(pathname: string, user: AuthIdentity): string | null {
  const publicPages = ['/', '/sign-in', '/forgot-password', '/reset-password', '/auth/callback', '/help', '/terms', '/privacy', '/insights']
  if (publicPages.includes(pathname) || matchesRoute(pathname, '/api/webhooks')) return null
  // Versioned APIs perform bearer/cookie authorization and return JSON errors.
  if (matchesRoute(pathname, '/api/v1')) return null
  // This media route returns its own non-cacheable 401/404, never an HTML login page.
  if (/^\/api\/listings\/[^/]+\/source$/.test(pathname)) return null
  if (!user) return '/sign-in'
  // Redress must stay available to authenticated accounts after KYC revocation.
  // This exact workspace performs its own subject-scoped authorization.
  if (matchesRoute(pathname, '/marketplace/appeals')) return null
  const isOnboarding = matchesRoute(pathname, '/onboarding')
  if (!onboardingComplete(user) && !isOnboarding && !matchesRoute(pathname, '/api/verify')) {
    return '/onboarding'
  }
  return onboardingComplete(user) && isOnboarding ? '/marketplace' : null
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
