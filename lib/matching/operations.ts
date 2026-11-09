import { z } from 'zod'
import { assertMatchingReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertStaffPermission, hasStaffPermission } from '@/lib/auth/roles'
import { archiveBoundary, archiveQuerySchema, nextArchiveCursor } from '@/lib/api/archive'
import { lockMatchingUsers, matchingUnavailable } from './access'
import { MatchingError } from './policy'

export const matchingStaffQuerySchema = archiveQuerySchema.safeExtend({ queue: z.enum(['reports', 'restricted']).default('reports') })
export async function requireMatchingReviewer(actor: string): Promise<void> {
  if (!await hasStaffPermission(actor, 'safety:review')) throw new Error('Staff access required.')
}
export async function matchingStaffQueue(actor: string, input: z.infer<typeof matchingStaffQuerySchema>) {
  await assertMatchingReady(); await requireMatchingReviewer(actor)
  return withTransaction(async tx => {
    if (input.queue === 'reports') {
      const rows = await tx.matchReport.findMany({ where: { status: 'open', opened_by: { not: actor }, subject_id: { not: actor }, ...archiveBoundary(input.cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 })
      const page = rows.slice(0, input.limit), ids = [...new Set(page.flatMap(report => [report.opened_by, report.subject_id]))]
      const users = ids.length ? await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }) : []
      const evidenceIds = page.flatMap(report => report.evidence_message_id ? [report.evidence_message_id] : []), connectionIds = page.flatMap(report => report.connection_id ? [report.connection_id] : [])
      const contacts = connectionIds.length ? await tx.matchConnection.findMany({ where: { id: { in: connectionIds } }, select: { id: true, lower_user_id: true, upper_user_id: true }, take: page.length }) : []
      const evidence = evidenceIds.length ? await tx.matchMessage.findMany({ where: { id: { in: evidenceIds }, connection_id: { in: connectionIds } },
        select: { id: true, connection_id: true, sender_id: true, body: true, createdAt: true }, take: page.length }) : []
      return { queue: input.queue, items: page.map(report => {
        const contact = contacts.find(connection => connection.id === report.connection_id)
        const message = evidence.find(candidate => candidate.id === report.evidence_message_id && candidate.connection_id === report.connection_id && candidate.sender_id === report.subject_id)
        const bound = contact && [contact.lower_user_id, contact.upper_user_id].includes(report.opened_by) && [contact.lower_user_id, contact.upper_user_id].includes(report.subject_id)
        return { id: report.id, reason: report.reason, createdAt: report.createdAt.toISOString(),
          reporter: users.find(user => user.id === report.opened_by)?.username ?? null, subject: users.find(user => user.id === report.subject_id)?.username ?? null,
          evidence: message && bound ? { body: message.body, createdAt: message.createdAt.toISOString() } : null }
      }), nextCursor: nextArchiveCursor(rows, input.limit), limit: input.limit }
    }
    const rows = await tx.matchProfile.findMany({ where: { moderation_status: 'restricted', user_id: { not: actor }, ...(input.cursor ? { OR: [
      { updatedAt: { lt: input.cursor.createdAt } }, { updatedAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
    ] } : {}) }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1,
    select: { id: true, user_id: true, bio: true, moderation_reason: true, moderated_by: true, moderated_at: true, updatedAt: true } })
    const page = rows.slice(0, input.limit), users = page.length ? await tx.user.findMany({ where: { id: { in: page.map(profile => profile.user_id) } }, select: { id: true, username: true } }) : []
    const last = page.at(-1)
    return { queue: input.queue, items: page.map(profile => ({ id: profile.id, username: users.find(user => user.id === profile.user_id)?.username ?? null,
      bio: profile.bio, reason: profile.moderation_reason, moderatedAt: profile.moderated_at?.toISOString() ?? null, canRestore: profile.moderated_by !== actor })),
      nextCursor: rows.length > input.limit && last ? `${last.updatedAt.toISOString()}~${last.id}` : null, limit: input.limit }
  })
}

export async function restoreMatchingProfile(actor: string, id: string, input: unknown): Promise<void> {
  await assertMatchingReady(); z.uuid().parse(id)
  const reason = z.string().trim().min(30).max(2000).parse(input)
  await withTransaction(async tx => {
    const initial = await tx.matchProfile.findUnique({ where: { id }, select: { user_id: true, moderated_by: true, moderated_at: true } })
    if (!initial?.moderated_by || !initial.moderated_at) throw matchingUnavailable()
    const original = await tx.matchReport.findFirst({ where: { subject_id: initial.user_id, status: 'resolved', reviewed_by: initial.moderated_by, reviewed_at: initial.moderated_at }, select: { id: true, opened_by: true } })
    if (!original) throw new MatchingError('Locate the original reviewed report before restoring this profile.', 'REVIEW_CASE_REQUIRED')
    await lockMatchingUsers(tx, original.opened_by, initial.user_id)
    await lockRecord(tx, 'matchReport', original.id); await lockRecord(tx, 'matchProfile', id)
    await assertStaffPermission(tx, actor, 'safety:review')
    if ([original.opened_by, initial.user_id, initial.moderated_by].includes(actor)) throw new MatchingError('A different reviewer independent of both participants must review restoration.', 'INDEPENDENT_REVIEW_REQUIRED')
    const current = await tx.matchProfile.findUnique({ where: { id } })
    if (!current || current.moderation_status !== 'restricted' || current.moderated_by !== initial.moderated_by || current.moderated_at?.getTime() !== initial.moderated_at.getTime()) throw new MatchingError('This review state changed. Refresh the queue before continuing.', 'MATCH_REVIEW_CHANGED')
    await tx.matchProfile.update({ where: { id }, data: { moderation_status: 'clear', moderation_reason: reason, moderated_by: actor, moderated_at: new Date() } })
    await tx.adminAudit.create({ data: { actor_id: actor, action: 'matching_profile_restore', target_type: 'match_profile', target_id: id, reason, metadata: { reportId: original.id } } })
    await tx.notification.create({ data: { user_id: current.user_id, kind: 'match_review', title: 'Your Squat-Mates review was updated',
      body: 'Open your matching preferences to review your current visibility choice.', href: '/marketplace/squat-mates' } })
  })
}
