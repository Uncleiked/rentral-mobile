import type { z } from 'zod'
import { api, ApiError } from './api'
import { analyticsPrivacySchema, memberProfileSchema, readNotificationSchema, submittedSchema, withdrawnHistorySchema } from './member-contracts'

export function memberResponse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError('Rentral returned a response that could not be confirmed. Refresh before continuing.', 'INVALID_RESPONSE', 200)
  return result.data
}
export async function memberGet<T extends z.ZodType>(path: string, schema: T, signal?: AbortSignal, expectedUserId?: string): Promise<z.infer<T>> {
  return memberResponse(schema, await api<unknown>(path, { signal, ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function saveMemberProfile(body: { username?: string; bio?: string | null; avatarUrl?: string | null }) {
  return memberResponse(memberProfileSchema, await api<unknown>('/me', { method: 'PATCH', body }))
}
export async function markNotificationRead(id: string) {
  const result = memberResponse(readNotificationSchema, await api<unknown>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', body: {} }))
  if (result.id !== id) throw new ApiError('This notification update could not be confirmed. Refresh before continuing.', 'INVALID_RESPONSE', 200)
  return result
}
export async function submitBookingFeedback(id: string, input: { rating: number; comment: string } | { reason: string }) {
  return memberResponse(submittedSchema, await api<unknown>(`/bookings/${encodeURIComponent(id)}/${'rating' in input ? 'review' : 'reports'}`, { method: 'POST', body: input }))
}
export async function setMemberAnalyticsConsent(allowed: boolean, expectedUserId?: string) {
  return memberResponse(analyticsPrivacySchema, await api<unknown>('/privacy/analytics', { method: 'PATCH', body: { allowed }, ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function removeMemberAnalyticsHistory(expectedUserId?: string) {
  return memberResponse(withdrawnHistorySchema, await api<unknown>('/privacy/analytics/history', { method: 'DELETE', ...(expectedUserId ? { expectedUserId } : {}) }))
}
export async function submitSafetyAppeal(id: string, statement: string) {
  return memberResponse(submittedSchema, await api<unknown>(`/safety/notices/${encodeURIComponent(id)}/appeal`, { method: 'POST', body: { statement } }))
}
