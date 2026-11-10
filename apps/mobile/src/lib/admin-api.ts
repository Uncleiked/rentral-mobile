import { adminCommandReceiptSchema, adminCommandSchema, adminDocumentSchema, type AdminCommand } from '../../../../lib/contracts/admin'
import { api, ApiError } from './api'
import { memberResponse } from './member-api'
import { nativeMediaUrl } from './media-url'

export async function executeAdminCommand(command: AdminCommand, actorId: string) {
  const input = adminCommandSchema.parse(command)
  const receipt = memberResponse(adminCommandReceiptSchema, await api<unknown>('/admin/commands', { method: 'POST', body: input, expectedUserId: actorId }))
  if (receipt.clientId !== input.clientId) throw new ApiError('This administrative result does not match the saved request. Check its receipt before continuing.', 'INVALID_RESPONSE', 200)
  return receipt
}
export async function readAdminCommand(clientId: string, actorId: string) {
  const receipt = memberResponse(adminCommandReceiptSchema, await api<unknown>(`/admin/commands/${encodeURIComponent(clientId)}`, { expectedUserId: actorId }))
  if (receipt.clientId !== clientId) throw new ApiError('This receipt belongs to another administrative request.', 'INVALID_RESPONSE', 200)
  return receipt
}
export async function loadAdminDocument(listingId: string, actorId: string) {
  return memberResponse(adminDocumentSchema, await api<unknown>(`/admin/listings/${encodeURIComponent(listingId)}/document`, { expectedUserId: actorId }))
}
/** Keep private evidence in this backend's signed compliance-file route. */
export function nativeAdminDocumentUrl(value: { url: string; expiresAt: string }, apiOrigin: string): string | null {
  const resolved = nativeMediaUrl(value.url, apiOrigin)
  if (!resolved || Date.parse(value.expiresAt) <= Date.now()) return null
  try {
    const url = new URL(resolved), origin = new URL(apiOrigin)
    if (url.origin !== origin.origin || url.hash || !/^\/api\/v1\/files\/compliance-docs\/[a-f0-9-]{36}\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.(?:pdf|png|jpg|jpeg)$/i.test(url.pathname)
      || !url.searchParams.get('token') || [...url.searchParams.keys()].some(key => key !== 'token') || url.searchParams.getAll('token').length !== 1) return null
    return url.toString()
  } catch { return null }
}
