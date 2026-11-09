import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { assertLifecycleReady, MongoReadinessError } from '@/lib/database/readiness'
import { hasStaffPermission } from '@/lib/auth/roles'
import { createStorageAdmin } from '@/lib/local-storage/adapter'
import { StorageError } from '@/lib/local-storage/policy'
import { LifecycleError } from '@/lib/lifecycle/policy'
import { ApiError, apiFailure } from './http'
import { archiveBoundary, archiveQuerySchema, nextArchiveCursor } from './archive'
import { renewalDto, terminationDto } from '@/lib/contracts/lifecycle'

const participants = { select: { seeker_id: true, lister_id: true } } as const
const renewalSelect = { id: true, booking_id: true, reference: true, recipient_route: true, status: true, original_ends_at: true,
  requested_ends_at: true, evidence_path: true, host_confirmed_at: true, host_confirmed_by: true, reviewed_at: true,
  decision_reason: true, createdAt: true, booking: participants } satisfies Prisma.RenewalSelect
const terminationSelect = { id: true, booking_id: true, requested_by: true, reason: true, status: true, original_ends_at: true,
  requested_end_at: true, evidence_path: true, counterparty_decision: true, counterparty_decided_at: true, counterparty_reason: true,
  reviewed_at: true, decision_reason: true, released_at: true, createdAt: true, booking: participants } satisfies Prisma.LeaseTerminationSelect
type RenewalRow = Prisma.RenewalGetPayload<{ select: typeof renewalSelect }>
type TerminationRow = Prisma.LeaseTerminationGetPayload<{ select: typeof terminationSelect }>
export const leaseArchiveQuerySchema = archiveQuerySchema.safeExtend({ bookingId: z.uuid().optional() })
export type LeaseArchiveQuery = z.infer<typeof leaseArchiveQuerySchema>
export type LifecycleRouteContext = { params: Promise<{ id: string }> }
export function createdLeaseRequest(id: unknown): { id: string } {
  const result = z.uuid().safeParse(id)
  if (!result.success) throw new ApiError(503, 'LEASE_UPDATE_UNCONFIRMED', 'The new request could not be verified. Refresh your history before trying again.')
  return { id: result.data }
}

function assertParticipant(userId: string, booking: { seeker_id: string; lister_id: string }): void {
  if (![booking.seeker_id, booking.lister_id].includes(userId)) throw new ApiError(404, 'NOT_FOUND', 'This lease request is unavailable.')
}
function publicRenewal(row: RenewalRow, userId: string) {
  assertParticipant(userId, row.booking)
  const needsDetails = !row.original_ends_at || !row.requested_ends_at || !row.evidence_path
  const parsed = renewalDto.safeParse({ id: row.id, bookingId: row.booking_id, reference: row.reference, recipientRoute: row.recipient_route,
    status: row.status, role: userId === row.booking.seeker_id ? 'renter' : 'host', originalEndsAt: row.original_ends_at?.toISOString() ?? null,
    requestedEndsAt: row.requested_ends_at?.toISOString() ?? null, needsDetails, evidenceEndpoint: row.evidence_path ? `/api/v1/renewals/${row.id}/evidence` : null,
    hostConfirmedAt: row.host_confirmed_at?.toISOString() ?? null, reviewedAt: row.reviewed_at?.toISOString() ?? null, decisionReason: row.decision_reason,
    createdAt: row.createdAt.toISOString(), paymentProviderVerified: false,
    actions: { confirm: userId === row.booking.lister_id && row.status === 'pending_counterparty' && !needsDetails },
  })
  if (!parsed.success) throw new ApiError(503, 'LEASE_DATA_UNAVAILABLE', 'This lease request could not be verified. Refresh before continuing.')
  return parsed.data
}
function publicTermination(row: TerminationRow, userId: string) {
  assertParticipant(userId, row.booking)
  const parsed = terminationDto.safeParse({ id: row.id, bookingId: row.booking_id, role: userId === row.booking.seeker_id ? 'renter' : 'host',
    requestedBy: row.requested_by === row.booking.seeker_id ? 'renter' : 'host', reason: row.reason, status: row.status,
    originalEndsAt: row.original_ends_at.toISOString(), requestedEndAt: row.requested_end_at.toISOString(), evidenceEndpoint: row.evidence_path ? `/api/v1/terminations/${row.id}/evidence` : null,
    counterpartyDecision: row.counterparty_decision, counterpartyDecidedAt: row.counterparty_decided_at?.toISOString() ?? null, counterpartyReason: row.counterparty_reason,
    reviewedAt: row.reviewed_at?.toISOString() ?? null, decisionReason: row.decision_reason, releasedAt: row.released_at?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
    actions: { confirm: userId !== row.requested_by && row.status === 'pending_counterparty' },
  })
  if (!parsed.success || ![row.booking.seeker_id, row.booking.lister_id].includes(row.requested_by)) throw new ApiError(503, 'LEASE_DATA_UNAVAILABLE', 'This lease request could not be verified. Refresh before continuing.')
  return parsed.data
}
export async function renewalForApi(userId: string, id: string) {
  await assertLifecycleReady()
  const row = await prisma.renewal.findFirst({ where: { id, booking: { OR: [{ seeker_id: userId }, { lister_id: userId }] } }, select: renewalSelect })
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'This renewal is unavailable.')
  return publicRenewal(row, userId)
}
export async function terminationForApi(userId: string, id: string) {
  await assertLifecycleReady()
  const row = await prisma.leaseTermination.findFirst({ where: { id, booking: { OR: [{ seeker_id: userId }, { lister_id: userId }] } }, select: terminationSelect })
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'This termination request is unavailable.')
  return publicTermination(row, userId)
}
export async function renewalsForApi(userId: string, query: LeaseArchiveQuery) {
  await assertLifecycleReady()
  const rows = await prisma.renewal.findMany({ where: { booking: { OR: [{ seeker_id: userId }, { lister_id: userId }] },
    ...(query.bookingId ? { booking_id: query.bookingId } : {}), ...archiveBoundary(query.cursor) }, select: renewalSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 })
  return { items: rows.slice(0, query.limit).map(row => publicRenewal(row, userId)), nextCursor: nextArchiveCursor(rows, query.limit), limit: query.limit }
}
export async function terminationsForApi(userId: string, query: LeaseArchiveQuery) {
  await assertLifecycleReady()
  const rows = await prisma.leaseTermination.findMany({ where: { booking: { OR: [{ seeker_id: userId }, { lister_id: userId }] },
    ...(query.bookingId ? { booking_id: query.bookingId } : {}), ...archiveBoundary(query.cursor) }, select: terminationSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 })
  return { items: rows.slice(0, query.limit).map(row => publicTermination(row, userId)), nextCursor: nextArchiveCursor(rows, query.limit), limit: query.limit }
}
export async function leaseEvidenceForApi(userId: string, id: string, kind: 'renewal' | 'termination'): Promise<{ url: string; expiresAt: string }> {
  await assertLifecycleReady()
  const select = { evidence_path: true, booking: participants }
  const row = kind === 'renewal' ? await prisma.renewal.findUnique({ where: { id }, select }) : await prisma.leaseTermination.findUnique({ where: { id }, select })
  const participant = row && [row.booking.seeker_id, row.booking.lister_id].includes(userId)
  if (!row?.evidence_path || (!participant && !await hasStaffPermission(userId, kind === 'renewal' ? 'renewal:review' : 'termination:review'))) throw new ApiError(404, 'NOT_FOUND', 'This supporting evidence is unavailable.')
  const signed = await createStorageAdmin().storage.from('compliance-docs').createSignedUrl(row.evidence_path, 300)
  if (signed.error || !signed.data) throw new ApiError(503, 'EVIDENCE_UNAVAILABLE', 'This supporting file could not be opened. Please refresh.')
  return { url: signed.data.signedUrl, expiresAt: new Date(Date.now() + 300000).toISOString() }
}
export function lifecycleFailure(error: unknown, scope: string, uncertain = false): Response {
  if (error instanceof MongoReadinessError) return apiFailure(new ApiError(503, error.code, error.message), scope)
  if (error instanceof StorageError) return apiFailure(new ApiError(error.status, error.code, error.message), scope)
  if (error instanceof LifecycleError) return apiFailure(new ApiError(409, 'LEASE_REQUEST_UNAVAILABLE', error.message), scope)
  if (error instanceof Error && error.message === 'Staff access required.') return apiFailure(new ApiError(403, 'FORBIDDEN', 'Staff access required.'), scope)
  if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return apiFailure(new ApiError(409, 'ALREADY_SUBMITTED', 'This lease reference or request was already submitted.'), scope)
  if (uncertain && !(error instanceof ApiError) && !(error instanceof z.ZodError)) return apiFailure(new ApiError(503, 'LEASE_UPDATE_UNCONFIRMED', 'The lease update could not be confirmed. Refresh your requests before trying again.'), scope)
  return apiFailure(error, scope)
}
