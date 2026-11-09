import { z } from 'zod'
import { assertMatchingReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertStaffPermission } from '@/lib/auth/roles'
import type { ArchiveQuery } from '@/lib/api/archive'
import { archiveBoundary, nextArchiveCursor } from '@/lib/api/archive'
import { matchingModerationSchema, matchingReportInputSchema, MatchingError } from './policy'
import { lockMatchingUsers, matchingUnavailable } from './access'
import { ownMatchingReportsSchema } from './contracts'

/** Existing participants retain a reporting route after contact/visibility ends. */
export async function matchingReportContext(actor: string, id: string): Promise<{ profileId: string; connectionId: string }> {
  await assertMatchingReady(); z.uuid().parse(id)
  return withTransaction(async tx => {
    const connection = await tx.matchConnection.findUnique({ where: { id }, select: { id: true, lower_user_id: true, upper_user_id: true } })
    if (!connection || ![connection.lower_user_id, connection.upper_user_id].includes(actor)) throw matchingUnavailable()
    const other = connection.lower_user_id === actor ? connection.upper_user_id : connection.lower_user_id
    const profile = await tx.matchProfile.findUnique({ where: { user_id: other }, select: { id: true } })
    if (!profile) throw matchingUnavailable()
    return { profileId: z.uuid().parse(profile.id), connectionId: id }
  })
}

export async function openMatchingReport(actor: string, input: unknown): Promise<string> {
  await assertMatchingReady()
  const data = matchingReportInputSchema.parse(input)
  return withTransaction(async tx => {
    const profile = await tx.matchProfile.findUnique({ where: { id: data.profileId }, select: { user_id: true } })
    if (!profile || profile.user_id === actor) throw matchingUnavailable()
    await lockMatchingUsers(tx, actor, profile.user_id)
    // Reporting/redress remains possible after withdrawal or blocking. No hidden
    // message or withdrawn profile contents are returned by this path.
    if (data.connectionId) {
      const connection = await tx.matchConnection.findUnique({ where: { id: data.connectionId } })
      if (!connection || ![connection.lower_user_id, connection.upper_user_id].includes(actor) ||
        ![connection.lower_user_id, connection.upper_user_id].includes(profile.user_id)) throw matchingUnavailable()
      if (data.messageId) {
        const message = await tx.matchMessage.findFirst({ where: { id: data.messageId, connection_id: data.connectionId, sender_id: profile.user_id }, select: { id: true } })
        if (!message) throw matchingUnavailable()
      }
    }
    const existing = await tx.matchReport.findFirst({ where: { opened_by: actor, subject_id: profile.user_id, status: 'open' } })
    if (existing) {
      if (existing.reason === data.reason && existing.connection_id === (data.connectionId ?? null) && existing.evidence_message_id === (data.messageId ?? null)) return existing.id
      throw new MatchingError('You already have an open report about this contact. Review your report history.', 'MATCH_REPORT_EXISTS')
    }
    if (await tx.matchReport.count({ where: { opened_by: actor, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 10) throw new MatchingError('You have reached the daily report limit. Try another day.', 'REPORT_RATE_LIMITED', 429)
    const report = await tx.matchReport.create({ data: { opened_by: actor, subject_id: profile.user_id, reason: data.reason,
      connection_id: data.connectionId ?? null, evidence_message_id: data.messageId ?? null } })
    await tx.notification.create({ data: { user_id: actor, kind: 'match_report', title: 'Your Squat-Mates report was received',
      body: 'Your private report is awaiting independent review.', href: '/marketplace/squat-mates/reports', dedupe_key: `match-report:${report.id}` } })
    return report.id
  })
}
export async function ownMatchingReports(actor: string, query: ArchiveQuery) {
  await assertMatchingReady()
  return withTransaction(async tx => {
    const rows = await tx.matchReport.findMany({ where: { opened_by: actor, ...archiveBoundary(query.cursor) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1,
      select: { id: true, reason: true, status: true, createdAt: true, reviewed_at: true, resolution: true } })
    const result = ownMatchingReportsSchema.safeParse({ items: rows.slice(0, query.limit).map(report => ({ id: report.id, reason: report.reason, status: report.status,
      createdAt: report.createdAt.toISOString(), reviewedAt: report.reviewed_at?.toISOString() ?? null, resolution: report.resolution })),
      nextCursor: nextArchiveCursor(rows, query.limit), limit: query.limit })
    if (!result.success) throw new MatchingError('Your report history could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
    return result.data
  })
}
export async function reviewMatchingReport(actor: string, id: string, input: unknown): Promise<void> {
  await assertMatchingReady()
  z.uuid().parse(id)
  const data = matchingModerationSchema.parse(input)
  await withTransaction(async tx => {
    const target = await tx.matchReport.findUnique({ where: { id }, select: { opened_by: true, subject_id: true } })
    if (!target) throw matchingUnavailable()
    await lockMatchingUsers(tx, target.opened_by, target.subject_id)
    await lockRecord(tx, 'matchReport', id)
    await assertStaffPermission(tx, actor, 'safety:review')
    if ([target.opened_by, target.subject_id].includes(actor)) throw new MatchingError('An independent reviewer must decide this report.', 'INDEPENDENT_REVIEW_REQUIRED')
    const report = await tx.matchReport.findUnique({ where: { id } })
    if (!report || report.status !== 'open') throw new MatchingError('This report has already been reviewed.', 'MATCH_REPORT_CLOSED')
    const now = new Date()
    if (data.decision === 'restrict') {
      const profile = await tx.matchProfile.findUnique({ where: { user_id: report.subject_id }, select: { id: true } })
      if (!profile) throw matchingUnavailable()
      await lockRecord(tx, 'matchProfile', profile.id)
      await tx.matchProfile.update({ where: { id: profile.id }, data: { moderation_status: 'restricted', moderation_reason: data.reason, moderated_by: actor, moderated_at: now } })
      await tx.notification.create({ data: { user_id: report.subject_id, kind: 'match_review', title: 'Review your Squat-Mates profile',
        body: 'Your matching profile has a review update. Open your preferences to read the decision.', href: '/marketplace/squat-mates' } })
    }
    await tx.matchReport.update({ where: { id }, data: { status: 'resolved', reviewed_by: actor, reviewed_at: now, resolution: data.reason } })
    await tx.adminAudit.create({ data: { actor_id: actor, action: `match_report_${data.decision}`, target_type: 'match_report', target_id: id, reason: data.reason,
      metadata: { publicSafetyNoticeCreated: false } } })
    await tx.notification.create({ data: { user_id: report.opened_by, kind: 'match_report', title: 'Your Squat-Mates report has an update',
      body: 'An independent reviewer recorded a decision. Open your report history to read it.', href: '/marketplace/squat-mates/reports' } })
  })
}
