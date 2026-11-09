import prisma from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { platformEnabled } from '@/lib/platform'
import { expireListingReservations } from '@/lib/bookings/service'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { ensureNotification } from '@/lib/operations/notifications'
import { pruneAnalyticsSubjects } from '@/lib/analytics/service'
import { releaseTermination } from './service'
import { runLeasedJob, recordWorkerFailure, dateWorkerCursor, idWorkerCursor, type LifecycleJob, type WorkerContext } from './worker'
import { sendLifecycleEmails } from './email'
import { runFinancialReconciliationBatch } from '@/lib/payments/financial-receipts'
import { runAuthEmailDeliveryBatch } from '@/lib/auth/email-delivery'
import { authSecurityPrepared } from '@/lib/database/readiness'
import { activeAccountWhere } from '@/lib/accounts/availability'
import { pushDispatchBatch, pushReceiptBatch } from '@/lib/push/worker'

const BATCH_SIZE = 25
export async function runLifecycleBatch(): Promise<{ expiredListings: number; reminders: number; emails: number; prunedEvents: number; prunedMappings: number; releasedLeases: number;
  financial: { receipts: number; operations: number }; authEmail: { sent: number; expired: number }; push: { queued: number; submitted: number; confirmed: number; uncertain: number; failed: number; prunedMetadata: number }; failedJobs: LifecycleJob[] }> {
  if (!platformEnabled() || process.env.LIFECYCLE_WORKER_ENABLED !== 'true') throw new Error('WORKER_DISABLED')
  const now = new Date()
  const failedJobs: LifecycleJob[] = []
  async function guardedJob<T>(job: LifecycleJob, operation: (context: WorkerContext) => Promise<{ result: T; cursor: Prisma.InputJsonObject }>, fallback: T): Promise<T> {
    try { return await runLeasedJob(job, operation) ?? fallback }
    catch {
      failedJobs.push(job)
      await recordWorkerFailure(job, 'worker_job', job, 'BATCH_FAILED').catch(() => undefined)
      return fallback
    }
  }
  const expiredListings = await guardedJob('reservation-expiry', async ({ cursor, heartbeat }) => {
    const position = idWorkerCursor.parse(cursor ?? {})
    const expirationFilter = { expires_at: { lte: now }, OR: [{ status: 'awaiting_payment' }, { status: 'confirmed', kind: 'hold' }] }
    const candidates = await prisma.booking.groupBy({ by: ['listing_id'], where: { ...expirationFilter, ...(position.id ? { listing_id: { gt: position.id } } : {}) },
      orderBy: { listing_id: 'asc' }, take: BATCH_SIZE })
    let expired = 0
    for (const candidate of candidates) {
      await heartbeat()
      try { expired += await withTransaction(async tx => {
        if (!await lockRecord(tx, 'listing', candidate.listing_id)) return 0
        const pending = await tx.booking.findFirst({ where: { listing_id: candidate.listing_id, ...expirationFilter }, select: { id: true } })
        if (!pending) return 0
        await expireListingReservations(tx, candidate.listing_id, now)
        return 1
      }) } catch { await recordWorkerFailure('reservation-expiry', 'listing', candidate.listing_id, 'EXPIRY_FAILED') }
    }
    const last = candidates.at(-1)
    return { result: expired, cursor: candidates.length === BATCH_SIZE && last ? { id: last.listing_id } : {} }
  }, 0)
  const reminders = await guardedJob('renewal-reminders', async ({ cursor, heartbeat }) => {
    const position = dateWorkerCursor.parse(cursor ?? {})
    const leases = await prisma.booking.findMany({ where: { kind: 'rental', status: { in: ['confirmed', 'completed'] }, listing: { category: 'house' }, seeker: { is: activeAccountWhere },
      starts_at: { lte: new Date(now.getTime() - 300 * 86400000) }, ends_at: { gt: now, lte: new Date(now.getTime() + 30 * 86400000) },
      ...(position.id && position.date ? { OR: [{ ends_at: { gt: new Date(position.date) } }, { ends_at: new Date(position.date), id: { gt: position.id } }] } : {}),
    }, select: { id: true, seeker_id: true, ends_at: true }, take: BATCH_SIZE, orderBy: [{ ends_at: 'asc' }, { id: 'asc' }] })
    let created = 0
    for (const lease of leases) {
      await heartbeat()
      try { created += await withTransaction(async tx => {
        if (!await lockRecord(tx, 'booking', lease.id)) return 0
        const current = await tx.booking.findFirst({ where: { id: lease.id, kind: 'rental', status: { in: ['confirmed', 'completed'] }, listing: { category: 'house' }, seeker: { is: activeAccountWhere },
          starts_at: { lte: new Date(now.getTime() - 300 * 86400000) }, ends_at: { gt: now, lte: new Date(now.getTime() + 30 * 86400000) } },
          select: { seeker_id: true, ends_at: true } })
        if (!current) return 0
        return await ensureNotification(tx, { user_id: current.seeker_id, kind: 'renewal', title: 'Your lease is nearing renewal',
          body: 'Submit the proposed extension dates and supporting evidence. External references do not become verified payments automatically.',
          href: '/marketplace/renewals', dedupe_key: `renewal:${lease.id}:${current.ends_at.toISOString()}` }) ? 1 : 0
      }) } catch { await recordWorkerFailure('renewal-reminders', 'booking', lease.id, 'REMINDER_FAILED') }
    }
    const last = leases.at(-1)
    return { result: created, cursor: leases.length === BATCH_SIZE && last ? { id: last.id, date: last.ends_at.toISOString() } : {} }
  }, 0)
  const releasedLeases = await guardedJob('termination-release', async ({ cursor, heartbeat }) => {
    const position = dateWorkerCursor.parse(cursor ?? {})
    const candidates = await prisma.leaseTermination.findMany({ where: { status: 'approved', requested_end_at: { lte: now },
      ...(position.id && position.date ? { OR: [{ requested_end_at: { gt: new Date(position.date) } }, { requested_end_at: new Date(position.date), id: { gt: position.id } }] } : {}),
    }, select: { id: true, requested_end_at: true }, take: BATCH_SIZE, orderBy: [{ requested_end_at: 'asc' }, { id: 'asc' }] })
    let released = 0
    for (const candidate of candidates) {
      await heartbeat()
      try { if (await releaseTermination(candidate.id)) released += 1 }
      catch { await recordWorkerFailure('termination-release', 'lease_termination', candidate.id, 'RELEASE_FAILED') }
    }
    const last = candidates.at(-1)
    return { result: released, cursor: candidates.length === BATCH_SIZE && last ? { id: last.id, date: last.requested_end_at.toISOString() } : {} }
  }, 0)
  const prunedMappings = await guardedJob('analytics-retention', async ({ cursor, heartbeat }) => {
    const position = idWorkerCursor.parse(cursor ?? {})
    const users = await prisma.user.findMany({ where: position.id ? { id: { gt: position.id } } : {}, select: { id: true }, take: BATCH_SIZE, orderBy: { id: 'asc' } })
    let pruned = 0
    for (const user of users) {
      await heartbeat()
      try { if (await pruneAnalyticsSubjects(user.id, now)) pruned += 1 }
      catch { await recordWorkerFailure('analytics-retention', 'user', user.id, 'MAPPING_PRUNE_FAILED') }
    }
    const last = users.at(-1)
    return { result: pruned, cursor: users.length === BATCH_SIZE && last ? { id: last.id } : {} }
  }, 0)
  const authEmail = await guardedJob('auth-email-delivery', async ({ heartbeat }) => {
    if (!await authSecurityPrepared()) return { result: { sent: 0, expired: 0 }, cursor: {} }
    await heartbeat()
    return { result: await runAuthEmailDeliveryBatch(5), cursor: {} }
  }, { sent: 0, expired: 0 })
  let emails = 0
  try { emails = await sendLifecycleEmails() }
  catch {
    failedJobs.push('notification-email')
    await recordWorkerFailure('notification-email', 'worker_job', 'notification-email', 'BATCH_FAILED').catch(() => undefined)
  }
  const financial = await guardedJob('financial-reconciliation', async ({ heartbeat }) => {
    await heartbeat()
    // Keep the provider portion bounded within this job's two-minute lease.
    return { result: await runFinancialReconciliationBatch(2), cursor: {} }
  }, { receipts: 0, operations: 0 })
  const pushDispatch = await guardedJob('push-dispatch', context => pushDispatchBatch(context,
    (type, id, code) => recordWorkerFailure('push-dispatch', type, id, code)), { queued: 0, submitted: 0, uncertain: 0 })
  const pushReceipts = await guardedJob('push-receipts', context => pushReceiptBatch(context,
    (type, id, code) => recordWorkerFailure('push-receipts', type, id, code)), { confirmed: 0, failed: 0, uncertain: 0, pruned: 0 })
  const push = { queued: pushDispatch.queued, submitted: pushDispatch.submitted, confirmed: pushReceipts.confirmed, failed: pushReceipts.failed, uncertain: pushDispatch.uncertain + pushReceipts.uncertain, prunedMetadata: pushReceipts.pruned }
  const pruned = await prisma.marketEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 86400000) } } })
  return { expiredListings, reminders, emails, prunedEvents: pruned.count, prunedMappings, releasedLeases, financial, authEmail, push, failedJobs }
}
