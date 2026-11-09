import { config, configurationError } from './config'
import { getSession, invalidateSession } from './auth'

export class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal; expectedUserId?: string } = {}): Promise<T> {
  if (configurationError) throw new ApiError(configurationError, 'CONFIGURATION_REQUIRED', 503)
  const session = await getSession()
  if (!session) throw new ApiError('Please sign in again.', 'UNAUTHORIZED', 401)
  if (options.expectedUserId && session.user.id !== options.expectedUserId) throw new ApiError('Your signed-in account changed. Reopen this screen before continuing.', 'ACCOUNT_CHANGED', 409)
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 20000)
  try {
    const response = await fetch(`${config.apiUrl}/api/v1${path}`, {
      method: options.method ?? 'GET', signal: controller.signal, credentials: 'omit',
      headers: { Authorization: `Bearer ${session.access_token}`, Accept: 'application/json', ...(options.expectedUserId ? { 'X-Rentral-Account': options.expectedUserId } : {}), ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    })
    if (response.status === 401) {
      try { await invalidateSession(session.access_token) }
      catch { throw new ApiError('Your sign-in has expired, but secure storage could not be cleared. Try signing out again.', 'SESSION_CLEAR_FAILED', 401) }
    }
    let payload: unknown
    try { payload = await response.json() }
    catch { throw new ApiError('Rentral returned an unexpected response. Refresh to check its status.', 'INVALID_RESPONSE', response.status) }
    if (!payload || typeof payload !== 'object' || !('success' in payload)) throw new ApiError('Rentral returned an unexpected response.', 'INVALID_RESPONSE', response.status)
    if (!response.ok || payload.success !== true || !('data' in payload)) {
      const message = 'error' in payload && typeof payload.error === 'string' ? payload.error : 'This request could not be completed.'
      throw new ApiError(message, 'code' in payload && typeof payload.code === 'string' ? payload.code : 'REQUEST_FAILED', response.status)
    }
    // The server owns the versioned JSON contract; this is the external-data boundary.
    return payload.data as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(controller.signal.aborted ? 'The request was interrupted. Refresh to check its status.' : 'Could not reach Rentral. Check your connection and try again.', 'NETWORK_ERROR', 0)
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.' }
