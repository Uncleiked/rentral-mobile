import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/db'
import { createAdminClient } from '@/lib/admin'
import { diditLogBody, diditVerificationStatus, sameDiditEvent, verificationRestrictionRank, IdentityProcessingError, type DiditEnvelope } from './didit-policy'

const sessionEvents = ['status.updated', 'data.updated']
type EventResult = { eventId: string; userId: string | null; needsSync: boolean; applied: boolean; verificationStatus?: string; accountType?: string | null }

function decisionInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull
  const parsed = z.json().parse(value)
  return parsed === null ? Prisma.JsonNull : parsed
}

/** Row lock serializes session changes and event application; no network in SQL. */
export async function applyDiditEvent(event: DiditEnvelope): Promise<EventResult> {
  const sessionId = event.session_id ?? event.business_session_id ?? null
  const sessionEvent = sessionEvents.includes(event.webhook_type)
  if (sessionEvent && (!event.vendor_data || !sessionId || !event.workflow_id || !event.status)) throw new IdentityProcessingError(400, 'missing session fields')
  return prisma.$transaction(async tx => {
    if (sessionEvent && event.vendor_data) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${event.vendor_data} FOR UPDATE`
    const log = await tx.webhookLog.upsert({
      where: { event_id: event.event_id }, update: {},
      create: { event_id: event.event_id, webhook_type: event.webhook_type, status: event.status ?? null,
        session_id: sessionId, raw_body: diditLogBody(event) },
      select: { processed_at: true, metadata_synced_at: true, raw_body: true },
    })
    if (!sameDiditEvent(log.raw_body, event)) throw new IdentityProcessingError(400, 'event identifier conflicts with recorded delivery')
    if (log.processed_at) return { eventId: event.event_id, userId: event.vendor_data ?? null,
      needsSync: !log.metadata_synced_at, applied: false }
    const now = new Date()
    const ignored = async (): Promise<EventResult> => {
      await tx.webhookLog.update({ where: { event_id: event.event_id }, data: { processed_at: now, metadata_synced_at: now, event_created_at: null } })
      return { eventId: event.event_id, userId: event.vendor_data ?? null, needsSync: false, applied: false }
    }
    if (!sessionEvent || !event.vendor_data || !sessionId || !event.workflow_id || !event.status) return ignored()
    const user = await tx.user.findUnique({ where: { id: event.vendor_data }, select: {
      didit_session_id: true, didit_workflow_id: true, verification_kind: true,
      kyc_verified: true, verification_status: true, account_type: true,
    } })
    if (!user) return ignored()
    if (!user.didit_session_id) throw new IdentityProcessingError(503, 'session not ready')
    if (user.didit_session_id !== sessionId || user.didit_workflow_id !== event.workflow_id ||
      (user.verification_kind !== 'kyc' && user.verification_kind !== 'kyb') ||
      (user.verification_kind === 'kyb' && event.session_kind !== 'business') ||
      (user.verification_kind === 'kyc' && event.session_kind === 'business')) return ignored()
    const newest = await tx.webhookLog.findFirst({
      where: { session_id: sessionId, webhook_type: { in: sessionEvents }, processed_at: { not: null }, event_created_at: { not: null } },
      orderBy: { event_created_at: 'desc' }, select: { event_created_at: true },
    })
    const eventTime = new Date(event.created_at * 1000)
    const previousTime = newest?.event_created_at?.getTime()
    const status = diditVerificationStatus(event.status)
    // Didit exposes second-resolution record updates. At a tie, a restriction
    // wins; an approval needs a strictly newer event to restore eligibility.
    if (previousTime !== undefined && (eventTime.getTime() < previousTime ||
      (eventTime.getTime() === previousTime && verificationRestrictionRank(status) <= verificationRestrictionRank(user.verification_status)))) return ignored()
    const changed = await tx.user.updateMany({
      where: { id: event.vendor_data, didit_session_id: sessionId, didit_workflow_id: event.workflow_id },
      data: { kyc_verified: status === 'verified', verification_status: status, didit_decision: decisionInput(event.decision) },
    })
    if (changed.count !== 1) throw new IdentityProcessingError(503, 'session changed; retry')
    // DB application and the ordering marker commit atomically. Auth metadata is
    // a retriable navigation cache; sensitive actions check the current DB row.
    await tx.webhookLog.update({ where: { event_id: event.event_id }, data: { processed_at: now, event_created_at: eventTime, metadata_synced_at: null } })
    return { eventId: event.event_id, userId: event.vendor_data, needsSync: true, applied: true, verificationStatus: status, accountType: user.account_type }
  })
}

const snapshotSelect = {
  id: true, account_type: true, verification_kind: true, verification_status: true,
  kyc_verified: true, username: true, didit_session_id: true, didit_workflow_id: true,
  individualProfile: { select: { id: true } }, organizationProfile: { select: { id: true } },
} satisfies Prisma.UserSelect
type Snapshot = Prisma.UserGetPayload<{ select: typeof snapshotSelect }>

function appMetadata(user: Snapshot) {
  const profile = user.account_type === 'individual' ? user.individualProfile : user.account_type === 'organization' ? user.organizationProfile : null
  return { account_type: user.account_type, verification_kind: user.verification_kind,
    verification_status: user.verification_status, kyc_verified: user.kyc_verified,
    username: user.username, profile_completed: Boolean(profile) }
}

function fingerprint(user: Snapshot): string {
  return JSON.stringify({ ...appMetadata(user), session: user.didit_session_id, workflow: user.didit_workflow_id })
}

export async function reconcileDiditMetadata(userId: string, eventId: string): Promise<void> {
  // Network calls stay outside DB locks. An older in-flight write must reread the
  // current decision and correct itself if a revocation committed while it ran.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await prisma.user.findUnique({ where: { id: userId }, select: snapshotSelect })
    if (!before) throw new IdentityProcessingError(503, 'identity reconciliation unavailable')
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, { app_metadata: appMetadata(before) })
    if (error) throw new IdentityProcessingError(503, 'identity reconciliation unavailable')
    const after = await prisma.user.findUnique({ where: { id: userId }, select: snapshotSelect })
    if (after && fingerprint(before) === fingerprint(after)) {
      await prisma.webhookLog.update({ where: { event_id: eventId }, data: { metadata_synced_at: new Date() } })
      return
    }
  }
  throw new IdentityProcessingError(503, 'identity changed during reconciliation; retry')
}
