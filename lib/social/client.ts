import { z } from 'zod'

export class SocialRequestError extends Error {
  constructor(message: string, readonly status = 0, readonly code = 'UNCONFIRMED') { super(message) }
}
/** Ambient cookies authenticate; an optional rendered actor only restricts that session. */
export async function socialRequest<T>(path: string, schema: z.ZodType<T>, body?: unknown, actorId?: string, method?: 'GET' | 'POST' | 'PATCH'): Promise<T> {
  let response: Response
  try { response = await fetch(path, { method: method ?? (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { ...(actorId ? { 'X-Rentral-Account': actorId } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }
  catch { throw new SocialRequestError('Your connection was interrupted. Check the current status or retry the same request.') }
  const envelope: unknown = await response.json().catch(() => null)
  const failure = z.object({ success: z.literal(false), error: z.string().max(1000), code: z.string().max(100).optional() }).safeParse(envelope)
  if (failure.success) throw new SocialRequestError(failure.data.error, response.status, failure.data.code)
  const success = z.object({ success: z.literal(true), data: schema }).safeParse(envelope)
  if (!response.ok || !success.success) throw new SocialRequestError('This response could not be confirmed. Refresh the current status before another change.', response.status, 'INVALID_RESPONSE')
  return success.data.data
}
export function socialError(error: unknown): string {
  if (error instanceof SocialRequestError && error.code === 'DATABASE_SETUP_REQUIRED') return 'Community features are being prepared. Please try again later.'
  return error instanceof Error ? error.message.slice(0, 1000) : 'This request could not be completed. Please try again.'
}
