import { z } from 'zod'
import { accountEmailChangeRequestSchema, accountEmailChangeResultSchema, accountEmailConfirmSchema, accountEmailConfirmResultSchema, accountPasswordSchema, accountPasswordResultSchema, accountSessionRevocationSchema } from '../../../../lib/contracts/account-security'
import { api, ApiError } from './api'
import { memberResponse } from './member-api'
import { config, configurationError } from './config'

function validatedInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input)
  if (!result.success) throw new ApiError('Check the email address, password requirements or confirmation-code format.', 'INVALID_INPUT', 400)
  return result.data
}

export async function changeAccountPassword(input: z.infer<typeof accountPasswordSchema>, actorId: string) {
  const body = validatedInput(accountPasswordSchema, input)
  return memberResponse(accountPasswordResultSchema, await api<unknown>('/auth/password', { method: 'POST', body, expectedUserId: actorId }))
}
export async function requestAccountEmailChange(input: z.infer<typeof accountEmailChangeRequestSchema>, actorId: string) {
  const body = validatedInput(accountEmailChangeRequestSchema, input)
  const result = memberResponse(accountEmailChangeResultSchema, await api<unknown>('/auth/email-change', { method: 'POST', body, expectedUserId: actorId }))
  if (result.pending.newEmail !== body.newEmail) throw new ApiError('This email-change request could not be confirmed. Refresh your account before trying again.', 'INVALID_RESPONSE', 200)
  return result
}
export async function cancelAccountEmailChange(actorId: string) {
  return memberResponse(z.object({ cancelled: z.literal(true) }).strict(), await api<unknown>('/auth/email-change', { method: 'DELETE', expectedUserId: actorId }))
}
export async function revokeAccountSession(id: string, current: boolean, actorId: string) {
  const result = memberResponse(accountSessionRevocationSchema, await api<unknown>(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', expectedUserId: actorId }))
  if (result.current !== current) throw new ApiError('This session change could not be confirmed. Refresh your sessions before continuing.', 'INVALID_RESPONSE', 200)
  return result
}
export async function revokeAllAccountSessions(actorId: string) {
  const result = memberResponse(accountSessionRevocationSchema, await api<unknown>('/auth/sessions', { method: 'DELETE', expectedUserId: actorId }))
  if (result.signInRequired !== true) throw new ApiError('This sign-out result could not be confirmed. Refresh your account before continuing.', 'INVALID_RESPONSE', 200)
  return result
}

/** Capability-only public endpoint. The one-use code never enters a URL or storage. */
export async function confirmAccountEmailChange(token: string) {
  if (configurationError) throw new ApiError(configurationError, 'CONFIGURATION_REQUIRED', 503)
  const body = validatedInput(accountEmailConfirmSchema, { token })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${config.apiUrl}/api/v1/auth/email-change/confirm`, { method: 'POST', credentials: 'omit', signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    let payload: unknown
    try { payload = await response.json() } catch { throw new ApiError('This confirmation response could not be read. Your code may have been used; check your account before retrying.', 'INVALID_RESPONSE', response.status) }
    if (!response.ok || !payload || typeof payload !== 'object' || !('success' in payload) || payload.success !== true || !('data' in payload)) {
      throw new ApiError(payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'This confirmation could not be completed.', 'CONFIRMATION_FAILED', response.status)
    }
    const result = memberResponse(accountEmailConfirmResultSchema, payload.data)
    if (result.signInRequired !== (result.status === 'completed')) throw new ApiError('The email-change status could not be confirmed. Check your account before continuing.', 'INVALID_RESPONSE', 200)
    return result
  } catch (failure) {
    if (failure instanceof ApiError) throw failure
    throw new ApiError(`Could not confirm the email change at ${config.apiUrl}. The code may already have been used. Check your account before retrying.`, 'NETWORK_ERROR', 0)
  } finally { clearTimeout(timeout) }
}
