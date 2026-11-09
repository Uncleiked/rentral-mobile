import { z } from 'zod'
class AccountSecurityClientError extends Error {}

/** Browser-only transport: account settings use same-origin HttpOnly cookies and strict response schemas. */
export async function accountSecurityRequest<T>(path: string, schema: z.ZodType<T>, options: { method?: string; body?: unknown; expectedUserId?: string; signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000)
  const abort = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(`/api/v1/auth${path}`, { method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.expectedUserId ? { 'X-Rentral-Account': options.expectedUserId } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) })
    const raw: unknown = await response.json()
    const envelope = z.object({ success: z.boolean(), error: z.string().optional(), code: z.string().optional(), data: z.unknown().optional() }).safeParse(raw)
    if (!envelope.success) throw new AccountSecurityClientError('Rentral returned an unexpected response. Refresh before continuing.')
    if (!response.ok || !envelope.data.success) throw new AccountSecurityClientError(envelope.data.code === 'DATABASE_SETUP_REQUIRED'
      ? 'Account settings are temporarily unavailable. Your sign-in is still active.' : envelope.data.error ?? 'This account request could not be completed.')
    const result = schema.safeParse(envelope.data.data)
    if (!result.success) throw new AccountSecurityClientError('The account response could not be verified. Refresh before continuing.')
    return result.data
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The result could not be confirmed. Refresh your account status before trying again.')
    throw error instanceof AccountSecurityClientError ? error : new Error('The result could not be confirmed. Check your connection and refresh account status before trying again.')
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
}
