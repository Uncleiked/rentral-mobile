import { z } from 'zod'
export class CommercialRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message) }
}
export function createCommercialRequest(actorId: string | null) {
 return async function commercialRequest<S extends z.ZodType>(path: string, schema: S, method = 'GET', body?: unknown): Promise<z.infer<S>> {
  if (!actorId) throw new CommercialRequestError('Sign in and reload this page before changing purchases.', 401, 'UNAUTHORIZED')
  let response: Response
  try { response = await fetch(`/api/v1/${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { 'X-Rentral-Account': actorId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }
  catch { throw new CommercialRequestError(method === 'GET' ? 'Purchase records could not load. Refresh in a moment.' : 'The update could not be confirmed. Check the original purchase or campaign before trying again.', 0, 'NETWORK_UNCONFIRMED') }
  let value: unknown
  try { value = await response.json() } catch { throw new CommercialRequestError('The response could not be verified. Refresh before trying again.', 503, 'INVALID_RESPONSE') }
  const envelope = z.object({ success: z.literal(true), data: z.unknown() }).safeParse(value)
  const result = envelope.success ? schema.safeParse(envelope.data.data) : null
  if (response.ok && result?.success) return result.data
  const failure = z.object({ success: z.literal(false), code: z.string().max(100), error: z.string().max(500) }).safeParse(value)
  throw new CommercialRequestError(failure.success ? failure.data.error : 'Purchase details could not be verified. Refresh before paying.', response.status || 503, failure.success ? failure.data.code : 'INVALID_RESPONSE')
 }
}
export const commercialButton = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50'
export const commercialSecondary = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm text-text-secondary hover:bg-surface-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50'
export const commercialField = 'mt-1 block min-h-11 w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary'
export function commercialNaira(kobo: string): string { const value = BigInt(kobo); return `₦${(value / BigInt(100)).toLocaleString('en-NG')}.${(value % BigInt(100)).toString().padStart(2, '0')}` }
