import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { assertStaffPermission, hasStaffPermission } from '@/lib/auth/roles'
import { platformEnabled } from '@/lib/platform'
import { appealSafetyNoticeSchema, decideSafetyAppealSchema, independentSafetyReviewer, issueSafetyNoticeSchema, safetyReportSubject } from '@/lib/trust/safety-policy'
import { withTransaction, lockRecord } from '@/lib/database/transactions'

/** An additive cutover gate keeps older, already enabled databases compatible. */
export function safetyEnabled(): boolean {
  return platformEnabled() && process.env.RENTRAL_SAFETY_ENABLED === 'true'
}

function requireSafety(): void { if (!safetyEnabled()) throw new Error('Safety reviews are not available yet.') }

async function requireCurrentStaff(tx: Prisma.TransactionClient, actorId: string): Promise<void> {
  await assertStaffPermission(tx, actorId, 'safety:review')
}

/** Only this bounded boolean is public. Reporter identity and evidence stay private. */
export async function hasActiveSafetyNotice(subjectId: string): Promise<boolean> {
  if (!safetyEnabled()) return false
  return Boolean(await prisma.safetyNotice.findFirst({ where: { subject_id: subjectId, status: 'active' }, select: { id: true } }))
}

export async function issueSafetyNotice(actorId: string, input: unknown): Promise<void> {
  requireSafety()
  const data = issueSafetyNoticeSchema.parse(input)
  if (!await hasStaffPermission(actorId, 'safety:review')) throw new Error('Staff access required.')
  await withTransaction(async tx => {
    await lockRecord(tx, 'dispute', data.disputeId)
    await requireCurrentStaff(tx, actorId)
    const report = await tx.dispute.findUnique({ where: { id: data.disputeId },
      select: { id: true, status: true, opened_by: true, booking: { select: { seeker_id: true, lister_id: true } } } })
    const subject = report ? safetyReportSubject(report) : null
    if (!report || !subject || !['open', 'resolved'].includes(report.status) || !independentSafetyReviewer(actorId, report.booking)) throw new Error('Choose an eligible report involving other members.')
    const notice = await tx.safetyNotice.create({ data: { dispute_id: report.id, subject_id: subject,
      issued_by: actorId, category: data.category, private_reason: data.reason } })
    await tx.adminAudit.create({ data: { actor_id: actorId, action: 'issue_safety_notice', target_type: 'safety_notice',
      target_id: notice.id, reason: data.reason, metadata: { disputeId: report.id, subjectId: subject, category: data.category } } })
    await tx.notification.create({ data: { user_id: subject, kind: 'safety_notice', title: 'A safety review needs your attention',
      body: 'A staff-reviewed safety notice is active on your profile. You can read the reason and submit an appeal.', href: '/marketplace/appeals' } })
  })
}

export async function appealSafetyNotice(appellantId: string, input: unknown): Promise<void> {
  requireSafety()
  const data = appealSafetyNoticeSchema.parse(input)
  await withTransaction(async tx => {
    await lockRecord(tx, 'safetyNotice', data.noticeId)
    // A revoked identity can still seek redress, but a deleted/missing account cannot.
    const account = await tx.user.findUnique({ where: { id: appellantId }, select: { id: true } })
    const notice = await tx.safetyNotice.findFirst({ where: { id: data.noticeId, subject_id: appellantId, status: 'active' },
      select: { id: true, appeal: { select: { id: true } } } })
    if (!account || !notice || notice.appeal) throw new Error('This notice is unavailable or already has an appeal.')
    await tx.safetyAppeal.create({ data: { notice_id: notice.id, appellant_id: appellantId, statement: data.statement } })
    await tx.notification.create({ data: { user_id: appellantId, kind: 'safety_appeal', title: 'Your appeal was received',
      body: 'A different staff reviewer will review your response. The existing notice remains visible while the appeal is pending.', href: '/marketplace/appeals' } })
  })
}

export async function decideSafetyAppeal(actorId: string, input: unknown): Promise<void> {
  requireSafety()
  const data = decideSafetyAppealSchema.parse(input)
  if (!await hasStaffPermission(actorId, 'safety:review')) throw new Error('Staff access required.')
  const target = await prisma.safetyAppeal.findUnique({ where: { id: data.appealId }, select: { notice_id: true } })
  if (!target) throw new Error('Appeal not found.')
  await withTransaction(async tx => {
    // All appeal paths lock notice first, avoiding a notice/appeal lock inversion.
    await lockRecord(tx, 'safetyNotice', target.notice_id)
    await lockRecord(tx, 'safetyAppeal', data.appealId)
    await requireCurrentStaff(tx, actorId)
    const appeal = await tx.safetyAppeal.findUnique({ where: { id: data.appealId }, include: {
      notice: { include: { dispute: { select: { booking: { select: { seeker_id: true, lister_id: true } } } } } },
    } })
    if (!appeal || appeal.status !== 'pending' || appeal.notice.status !== 'active' ||
      !independentSafetyReviewer(actorId, appeal.notice.dispute.booking, appeal.notice.issued_by)) throw new Error('An independent reviewer must decide a pending appeal.')
    const now = new Date()
    await tx.safetyAppeal.update({ where: { id: appeal.id }, data: { status: data.decision, decided_by: actorId, decision_reason: data.reason, decided_at: now } })
    if (data.decision === 'removed') await tx.safetyNotice.update({ where: { id: appeal.notice_id }, data: { status: 'removed', removed_at: now } })
    await tx.adminAudit.create({ data: { actor_id: actorId, action: `safety_appeal_${data.decision}`, target_type: 'safety_appeal',
      target_id: appeal.id, reason: data.reason, metadata: { noticeId: appeal.notice_id, subjectId: appeal.appellant_id } } })
    await tx.notification.create({ data: { user_id: appeal.appellant_id, kind: 'safety_appeal', title: 'Your safety appeal has a decision',
      body: data.decision === 'removed' ? 'The reviewed notice has been removed from your public profile.' : 'The notice remains active. Open your appeal to read the reviewer’s decision.', href: '/marketplace/appeals' } })
  })
}

export async function getOwnSafetyNotices(userId: string) {
  if (!safetyEnabled()) return []
  return prisma.safetyNotice.findMany({ where: { subject_id: userId }, orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, category: true, private_reason: true, status: true, createdAt: true, removed_at: true,
      appeal: { select: { statement: true, status: true, decision_reason: true, decided_at: true, createdAt: true } } } })
}

export async function getSafetyAdminQueue(actorId: string) {
  if (!safetyEnabled()) return null
  if (!await hasStaffPermission(actorId, 'safety:review')) throw new Error('Staff access required.')
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true } })
  if (!actor) return null
  const [reports, appeals] = await Promise.all([
    prisma.dispute.findMany({ where: { status: { in: ['open', 'resolved'] }, safetyNotices: { none: {} },
      booking: { seeker_id: { not: actorId }, lister_id: { not: actorId } } }, orderBy: { createdAt: 'asc' }, take: 50,
      select: { id: true, reason: true, opened_by: true, booking_id: true, booking: { select: {
        seeker_id: true, lister_id: true, seeker: { select: { username: true } }, lister: { select: { username: true } },
      } } } }),
    prisma.safetyAppeal.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, take: 50,
      select: { id: true, statement: true, createdAt: true, notice: { select: { private_reason: true, category: true,
        issued_by: true, subject: { select: { username: true } }, dispute: { select: { reason: true, booking: { select: { seeker_id: true, lister_id: true } } } } } } } }),
  ])
  return { reports, appeals: appeals.filter(item => independentSafetyReviewer(actorId, item.notice.dispute.booking, item.notice.issued_by)) }
}
