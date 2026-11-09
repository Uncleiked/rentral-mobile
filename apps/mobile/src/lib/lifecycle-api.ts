import { z } from 'zod'
import { renewalDto, terminationDto, renewalRequestSchema, terminationRequestSchema, lifecycleCounterpartySchema } from '../../../../lib/contracts/lifecycle'
import { api, ApiError } from './api'
import { memberResponse } from './member-api'
import { nativeMediaUrl } from './media-url'
import { config } from './config'
import { previewPrivateDocument } from './private-document'

export type LeaseRequestKind = 'renewal' | 'termination'
const path = (kind: LeaseRequestKind) => kind === 'renewal' ? '/renewals' : '/terminations'
export function leaseRequestInput(kind: LeaseRequestKind, value: unknown) {
  const parsed = kind === 'renewal' ? renewalRequestSchema.safeParse(value) : terminationRequestSchema.safeParse(value)
  if (!parsed.success) throw new Error(kind === 'renewal' ? 'Check the proposed date, supporting document and payment reference (6–150 letters, numbers or ordinary reference punctuation).' : 'Check the proposed date and supporting document, and give a reason of 20–4000 characters.')
  return parsed.data
}
export function leaseRequestedInstant(date: string, time: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), clock = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match || !clock) throw new Error('Use YYYY-MM-DD for the date and HH:MM for the time on this device.')
  const [year, month, day, hour, minute] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(clock[1]), Number(clock[2])]
  const value = new Date(year, month - 1, day, hour, minute)
  if (year < 2020 || year > 2100 || value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day || value.getHours() !== hour || value.getMinutes() !== minute) throw new Error('Choose a valid calendar date and time on this device.')
  return value.toISOString()
}
export async function submitLeaseRequest(kind: LeaseRequestKind, value: unknown, actorId: string): Promise<{ id: string }> {
  const body = leaseRequestInput(kind, value)
  return memberResponse(z.object({ id: z.uuid() }).strict(), await api<unknown>(path(kind), { method: 'POST', body, expectedUserId: actorId }))
}
export async function decideLeaseRequest(kind: LeaseRequestKind, id: string, value: unknown, actorId: string) {
  const body = lifecycleCounterpartySchema.parse(value)
  const result = await api<unknown>(`${path(kind)}/${encodeURIComponent(z.uuid().parse(id))}`, { method: 'PATCH', body, expectedUserId: actorId })
  const parsed = kind === 'renewal' ? memberResponse(renewalDto, result) : memberResponse(terminationDto, result)
  if (parsed.id !== id) throw new ApiError('This lease decision could not be confirmed. Refresh your history.', 'INVALID_RESPONSE', 200)
  return parsed
}
export function leaseEvidenceOwner(value: string, origin = config.apiUrl): { url: string; ownerId: string } {
  const resolved = nativeMediaUrl(value, origin)
  if (!resolved) throw new Error('Request a fresh supporting document link.')
  const url = new URL(resolved)
  const owner = /^\/api\/v1\/files\/compliance-docs\/([^/]+)\//.exec(url.pathname)?.[1]
  if (url.origin !== new URL(origin).origin || !owner || !z.uuid().safeParse(owner).success) throw new Error('This supporting document link could not be confirmed.')
  return { url: url.href, ownerId: owner }
}
export async function openLeaseEvidence(kind: LeaseRequestKind, id: string, actorId: string): Promise<void> {
  const result = memberResponse(z.object({ url: z.string().url(), expiresAt: z.string().datetime({ offset: true }) }).strict(),
    await api<unknown>(`${path(kind)}/${encodeURIComponent(z.uuid().parse(id))}/evidence`, { expectedUserId: actorId }))
  if (Date.parse(result.expiresAt) <= Date.now()) throw new Error('This document link expired. Request it again.')
  const evidence = leaseEvidenceOwner(result.url)
  // The participant-authorized server may return the counterparty's evidence.
  await previewPrivateDocument(evidence.url, evidence.ownerId)
}
