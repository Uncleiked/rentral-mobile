import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ leased: vi.fn(), failure: vi.fn(), expired: vi.fn(), group: vi.fn(), leases: vi.fn(), fresh: vi.fn(), users: vi.fn(), terminations: vi.fn(),
  notification: vi.fn(), prune: vi.fn(), release: vi.fn(), emails: vi.fn(), remove: vi.fn(), financial: vi.fn(), authEmail: vi.fn(), authReady: vi.fn(), pushDispatch: vi.fn(), pushReceipts: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertLifecycleReady: async () => undefined, authSecurityPrepared: mocks.authReady }))
vi.mock('@/lib/db', () => ({ default: { booking: { groupBy: mocks.group, findMany: mocks.leases }, user: { findMany: mocks.users },
  leaseTermination: { findMany: mocks.terminations }, marketEvent: { deleteMany: mocks.remove } } }))
vi.mock('@/lib/lifecycle/worker', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/lifecycle/worker')>(), runLeasedJob: mocks.leased, recordWorkerFailure: mocks.failure }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: async () => true, withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ booking: { findFirst: mocks.fresh } }) }))
vi.mock('@/lib/bookings/service', () => ({ expireListingReservations: mocks.expired }))
vi.mock('@/lib/operations/notifications', () => ({ ensureNotification: mocks.notification }))
vi.mock('@/lib/analytics/service', () => ({ pruneAnalyticsSubjects: mocks.prune }))
vi.mock('@/lib/lifecycle/service', () => ({ releaseTermination: mocks.release }))
vi.mock('@/lib/lifecycle/email', () => ({ sendLifecycleEmails: mocks.emails }))
vi.mock('@/lib/payments/financial-receipts', () => ({ runFinancialReconciliationBatch: mocks.financial }))
vi.mock('@/lib/auth/email-delivery', () => ({ runAuthEmailDeliveryBatch: mocks.authEmail }))
vi.mock('@/lib/push/worker', () => ({ pushDispatchBatch: mocks.pushDispatch, pushReceiptBatch: mocks.pushReceipts }))
import { runLifecycleBatch } from '@/lib/lifecycle/batch'

const at = new Date('2030-01-01T10:00:00Z')
const leases = Array.from({ length: 60 }, (_, index) => ({ id: `${index.toString(16).padStart(8, '0')}-a016-475d-8e51-23fd04989436`,
  seeker_id: 'renter', ends_at: new Date(at.getTime() + 10 * 86400000) }))
let cursors: Record<string, unknown>
let sent: Set<string>
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(at)
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('LIFECYCLE_WORKER_ENABLED', 'true')
  cursors = {}; sent = new Set()
  mocks.leased.mockImplementation(async (job: string, work: (context: unknown) => Promise<{ result: number; cursor: unknown }>) => {
    const result = await work({ cursor: cursors[job] ?? {}, heartbeat: async () => undefined })
    cursors[job] = result.cursor; return result.result
  })
  mocks.group.mockResolvedValue([]); mocks.users.mockResolvedValue([]); mocks.terminations.mockResolvedValue([]); mocks.remove.mockResolvedValue({ count: 0 }); mocks.emails.mockResolvedValue(0)
  mocks.financial.mockResolvedValue({ receipts: 0, operations: 0 })
  mocks.authEmail.mockResolvedValue({ sent: 0, expired: 0 })
  mocks.authReady.mockResolvedValue(true)
  mocks.pushDispatch.mockResolvedValue({ result: { queued: 0, submitted: 0, uncertain: 0 }, cursor: {} })
  mocks.pushReceipts.mockResolvedValue({ result: { confirmed: 0, failed: 0, uncertain: 0, pruned: 0 }, cursor: {} })
  mocks.failure.mockResolvedValue(undefined)
  mocks.leases.mockImplementation(async ({ where, take }: { where: { OR?: [{ ends_at: { gt: Date } }, { id: { gt: string } }] }; take: number }) => leases.filter(lease => !where.OR || lease.id > where.OR[1].id.gt).slice(0, take))
  mocks.fresh.mockImplementation(async ({ where }: { where: { id: string } }) => leases.find(lease => lease.id === where.id))
  mocks.notification.mockImplementation(async (_tx: unknown, notification: { dedupe_key: string }) => {
    if (sent.has(notification.dedupe_key)) return false
    sent.add(notification.dedupe_key); return true
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

it('isolates push submission failures from receipt recovery and core progress', async () => {
  mocks.pushDispatch.mockRejectedValue(new Error('Owned fixture push outage'))
  mocks.pushReceipts.mockResolvedValue({ result: { confirmed: 2, failed: 0, uncertain: 1, pruned: 0 }, cursor: {} })
  const result = await runLifecycleBatch()
  expect(result.failedJobs).toEqual(['push-dispatch'])
  expect(result.push).toEqual({ queued: 0, submitted: 0, confirmed: 2, failed: 0, uncertain: 1, prunedMetadata: 0 })
  expect(result.reminders).toBe(25)
  expect(mocks.failure).toHaveBeenCalledWith('push-dispatch', 'worker_job', 'push-dispatch', 'BATCH_FAILED')
})

it('advances past already-reminded early records so later eligible leases are not starved', async () => {
  expect((await runLifecycleBatch()).reminders).toBe(25)
  expect((await runLifecycleBatch()).reminders).toBe(25)
  expect((await runLifecycleBatch()).reminders).toBe(10)
  expect(sent.size).toBe(60)
  expect(cursors['renewal-reminders']).toEqual({})
  expect((await runLifecycleBatch()).reminders).toBe(0)
  expect(sent.size).toBe(60)
})
it('records a poison-row incident while continuing to later leases and maintaining its cursor', async () => {
  const healthy = mocks.notification.getMockImplementation()
  mocks.notification.mockImplementation(async (tx: unknown, notification: { dedupe_key: string }) => {
    if (notification.dedupe_key.includes(leases[0].id)) throw new Error('Synthetic row failure')
    return healthy?.(tx, notification)
  })
  for (let index = 0; index < 3; index += 1) await runLifecycleBatch()
  expect(sent.size).toBe(59)
  expect(mocks.failure).toHaveBeenCalledWith('renewal-reminders', 'booking', leases[0].id, 'REMINDER_FAILED')
})
it('rechecks eligibility after acquiring the booking lock instead of reminding a stale candidate', async () => {
  mocks.fresh.mockResolvedValue(null)
  expect((await runLifecycleBatch()).reminders).toBe(0)
  expect(mocks.notification).not.toHaveBeenCalled()
})

it('isolates financial/provider and email failures from reservation/reminder/retention progress', async () => {
  mocks.financial.mockRejectedValue(new Error('Provider unavailable')); mocks.emails.mockRejectedValue(new Error('Sender unavailable'))
  const result = await runLifecycleBatch()
  expect(result.reminders).toBe(25)
  expect(result.failedJobs).toEqual(['notification-email', 'financial-reconciliation'])
  expect(mocks.failure).toHaveBeenCalledWith('financial-reconciliation', 'worker_job', 'financial-reconciliation', 'BATCH_FAILED')
  expect(mocks.remove).toHaveBeenCalled()
})
it('keeps an unprepared optional auth-email feature out of the core worker', async () => {
  mocks.authReady.mockResolvedValue(false)
  const result = await runLifecycleBatch()
  expect(result.authEmail).toEqual({ sent: 0, expired: 0 })
  expect(mocks.authEmail).not.toHaveBeenCalled()
  expect(result.failedJobs).toEqual([])
})
