import { z } from 'zod'
import prisma from '@/lib/db'
import { assertLifecycleReady } from '@/lib/database/readiness'
import { withTransaction } from '@/lib/database/transactions'
import { assertStaffPermission, hasStaffPermission } from '@/lib/auth/roles'
import { LifecycleError } from './policy'

export const lifecycleQueueSchema = z.object({ queue: z.enum(['renewals', 'terminations', 'failures']).default('renewals'),
  limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().max(180).optional(),
}).strict()
export type LifecycleQueueQuery = z.infer<typeof lifecycleQueueSchema>
export async function requireLifecycleStaff(actorId: string, permission: 'renewal:review' | 'termination:review' | 'operations:read' | 'operations:manage'): Promise<void> {
  if (!await hasStaffPermission(actorId, permission)) throw new Error('Staff access required.')
}
function queueCursor(query: LifecycleQueueQuery): { date: Date; id: string } | null {
  if (!query.cursor) return null
  const [date, id, ...extra] = query.cursor.split('~')
  const valid = z.object({ date: z.string().datetime({ offset: true }), id: query.queue === 'failures' ? z.string().regex(/^[a-f0-9]{64}$/) : z.uuid() }).strict().parse({ date, id })
  if (extra.length) throw new LifecycleError('This archive cursor is unavailable.')
  return { date: new Date(valid.date), id: valid.id }
}
export async function lifecycleOperationsQueue(actorId: string, input: LifecycleQueueQuery) {
  await assertLifecycleReady()
  const position = queueCursor(input)
  if (input.queue === 'failures') {
    await requireLifecycleStaff(actorId, 'operations:read')
    const rows = await prisma.workerFailure.findMany({ where: { status: 'open', ...(position ? { OR: [
      { last_occurred_at: { lt: position.date } }, { last_occurred_at: position.date, id: { lt: position.id } },
    ] } : {}) }, take: input.limit + 1, orderBy: [{ last_occurred_at: 'desc' }, { id: 'desc' }],
    select: { id: true, job: true, target_type: true, target_id: true, error_code: true, attempts: true, first_occurred_at: true, last_occurred_at: true } })
    const page = rows.slice(0, input.limit), last = page.at(-1)
    return { queue: input.queue, items: page.map(row => ({ id: row.id, job: row.job, targetType: row.target_type, targetId: row.target_id,
      errorCode: row.error_code, attempts: row.attempts, firstOccurredAt: row.first_occurred_at.toISOString(), lastOccurredAt: row.last_occurred_at.toISOString() })),
      nextCursor: rows.length > input.limit && last ? `${last.last_occurred_at.toISOString()}~${last.id}` : null, limit: input.limit }
  }
  await requireLifecycleStaff(actorId, input.queue === 'renewals' ? 'renewal:review' : 'termination:review')
  const where = { status: { in: ['pending_counterparty', 'pending_review'] }, booking: { seeker_id: { not: actorId }, lister_id: { not: actorId } },
    ...(position ? { OR: [{ createdAt: { lt: position.date } }, { createdAt: position.date, id: { lt: position.id } }] } : {}) }
  const commonSelect = { id: true, booking_id: true, status: true, evidence_path: true, original_ends_at: true, createdAt: true } as const
  if (input.queue === 'renewals') {
    const rows = await prisma.renewal.findMany({ where, take: input.limit + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { ...commonSelect, requested_ends_at: true, reference: true, recipient_route: true, host_confirmed_at: true } })
    const page = rows.slice(0, input.limit), last = page.at(-1)
    return { queue: input.queue, items: page.map(row => ({ id: row.id, bookingId: row.booking_id, status: row.status,
      reference: row.reference, recipientRoute: row.recipient_route, originalEndsAt: row.original_ends_at?.toISOString() ?? null,
      requestedEndsAt: row.requested_ends_at?.toISOString() ?? null, hostConfirmedAt: row.host_confirmed_at?.toISOString() ?? null,
      evidenceEndpoint: row.evidence_path ? `/api/v1/renewals/${row.id}/evidence` : null, createdAt: row.createdAt.toISOString() })),
      nextCursor: rows.length > input.limit && last ? `${last.createdAt.toISOString()}~${last.id}` : null, limit: input.limit }
  }
  const rows = await prisma.leaseTermination.findMany({ where, take: input.limit + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { ...commonSelect, requested_end_at: true, reason: true, counterparty_decision: true, counterparty_reason: true } })
  const page = rows.slice(0, input.limit), last = page.at(-1)
  return { queue: input.queue, items: page.map(row => ({ id: row.id, bookingId: row.booking_id, status: row.status, reason: row.reason,
    originalEndsAt: row.original_ends_at.toISOString(), requestedEndAt: row.requested_end_at.toISOString(), counterpartyDecision: row.counterparty_decision,
    counterpartyReason: row.counterparty_reason, evidenceEndpoint: row.evidence_path ? `/api/v1/terminations/${row.id}/evidence` : null, createdAt: row.createdAt.toISOString() })),
    nextCursor: rows.length > input.limit && last ? `${last.createdAt.toISOString()}~${last.id}` : null, limit: input.limit }
}

export async function acknowledgeWorkerFailure(actorId: string, id: string, input: unknown): Promise<void> {
  await assertLifecycleReady()
  const reason = z.string().trim().min(30).max(2000).parse(input)
  await withTransaction(async tx => {
    await assertStaffPermission(tx, actorId, 'operations:manage')
    const changed = await tx.workerFailure.updateMany({ where: { id, status: 'open' }, data: { status: 'resolved', resolved_by: actorId, resolved_at: new Date(), resolution: reason } })
    if (changed.count !== 1) throw new LifecycleError('This incident is unavailable or has already been reviewed.')
    await tx.adminAudit.create({ data: { actor_id: actorId, action: 'worker_incident_reviewed', target_type: 'worker_failure', target_id: id, reason,
      metadata: { underlyingStateChanged: false } } })
  })
}
