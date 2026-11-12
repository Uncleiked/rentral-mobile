import { z } from 'zod'
import { ownMatchProfileSchema } from './contracts'

export class MatchingRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message) }
}
/** Same-origin cookie requests. Mutations are deliberately never retried here. */
export function createMatchingRequest(actorId: string | null) {
 return async function matchingRequest<S extends z.ZodType>(path: string, schema: S, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<z.infer<S>> {
  if (!actorId) throw new MatchingRequestError('Sign in and reload this page before changing matching preferences.', 401, 'UNAUTHORIZED')
  const mutation = Boolean(options.method && options.method !== 'GET')
  let response: Response
  try { response = await fetch(`/api/v1/${path}`, { method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-Rentral-Account': actorId, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: options.signal ?? AbortSignal.timeout(20000) }) }
  catch { throw new MatchingRequestError(mutation ? 'The update could not be confirmed. Refresh the relevant history before trying again.' : 'This page could not be loaded. Check your connection and refresh.', 0, 'NETWORK_UNCONFIRMED') }
  let data: unknown
  try { data = await response.json() } catch { throw new MatchingRequestError('The response could not be verified. Refresh before trying again.', 503, 'INVALID_RESPONSE') }
  const envelope = z.object({ success: z.literal(true), data: z.unknown() }).safeParse(data)
  const result = envelope.success ? schema.safeParse(envelope.data.data) : null
  if (response.ok && result?.success) return result.data
  const failure = z.object({ success: z.literal(false), error: z.string().max(500), code: z.string().max(100) }).safeParse(data)
  throw new MatchingRequestError(failure.success ? failure.data.error : 'The response could not be verified. Refresh before trying again.', response.status, failure.success ? failure.data.code : 'INVALID_RESPONSE')
 }
}
export const matchingIdSchema = z.object({ id: z.uuid() }).strict()
export const matchingProfileResultSchema = z.object({ profile: ownMatchProfileSchema.nullable(), canDiscover: z.boolean() }).strict()
export const matchingButton = 'inline-flex min-h-11 max-w-full whitespace-normal break-words items-center justify-center rounded-xl bg-accent-primary px-5 py-3 text-sm font-semibold text-text-inverse hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50'
export const matchingSecondary = 'inline-flex min-h-11 max-w-full whitespace-normal break-words items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm text-text-secondary hover:bg-surface-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover disabled:opacity-50'
export const matchingField = 'mt-2 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary'
export function matchingNaira(kobo: string): string {
  const amount = BigInt(kobo), whole = amount / BigInt(100), fraction = (amount % BigInt(100)).toString().padStart(2, '0')
  return `${whole}.${fraction}`
}
export function matchingMoney(kobo: string): string {
  const [whole, fraction] = matchingNaira(kobo).split('.')
  return `₦${new Intl.NumberFormat('en-NG').format(BigInt(whole))}.${fraction}`
}
