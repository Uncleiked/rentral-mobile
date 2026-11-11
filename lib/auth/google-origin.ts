import { AuthError } from './types'

const internalHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])
function invalid(): never {
  throw new AuthError(400, 'GOOGLE_EXPIRED', 'This Google sign-in has expired. Start again.')
}

/** Next may construct request.url from its internal bind address. Resolve only
 * an exact configured Host, never an arbitrary forwarded host or redirect input. */
export function googleCallbackOrigin(request: Request, configuredOrigin: string, vercel = process.env.VERCEL === '1'): string {
  const configured = new URL(configuredOrigin)
  const incoming = new URL(request.url)
  const host = request.headers.get('host')
  if (host && host.toLowerCase() !== configured.host.toLowerCase()) invalid()
  if (incoming.origin === configured.origin) return configured.origin
  if (!host || !internalHosts.has(incoming.hostname)) invalid()
  if (incoming.protocol === configured.protocol) return configured.origin
  if (configured.protocol === 'https:' && incoming.protocol === 'http:' && vercel && request.headers.get('x-forwarded-proto') === 'https') return configured.origin
  return invalid()
}
