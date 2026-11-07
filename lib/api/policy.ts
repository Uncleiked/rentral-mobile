export function apiBearer(header: string | null): { mode: 'cookie' } | { mode: 'bearer'; token: string } | null {
  if (header === null) return { mode: 'cookie' }
  if (header.length > 8192) return null
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(header)
  return match ? { mode: 'bearer', token: match[1] } : null
}

function localOrigin(origin: string): boolean {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname) } catch { return false }
}

export function cookieMutationOriginAllowed(request: Request, configuredAppUrl: string | undefined, environment: string | undefined): boolean {
  const supplied = request.headers.get('origin')
  if (!supplied || supplied === 'null') return false
  try {
    if (new URL(supplied).origin !== supplied) return false
    const requestOrigin = new URL(request.url).origin
    const expected = configuredAppUrl ? new URL(configuredAppUrl).origin : requestOrigin
    if (supplied === expected) return true
    // Separate local ports are allowed only when both the configured app and the
    // actual request are loopback origins, never on a deployed production app.
    return environment !== 'production' && supplied === requestOrigin && localOrigin(expected) && localOrigin(requestOrigin)
  } catch { return false }
}
