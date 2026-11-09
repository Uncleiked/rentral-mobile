import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ ready: vi.fn(), upsert: vi.fn(), update: vi.fn(), find: vi.fn(), failure: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertLifecycleReady: mocks.ready }))
vi.mock('@/lib/db', () => ({ default: { workerState: { upsert: mocks.upsert, updateMany: mocks.update, findUniqueOrThrow: mocks.find }, workerFailure: { upsert: mocks.failure } } }))
import { dateWorkerCursor, recordWorkerFailure, runLeasedJob } from '@/lib/lifecycle/worker'
beforeEach(() => {
  vi.resetAllMocks(); mocks.ready.mockResolvedValue(undefined); mocks.upsert.mockResolvedValue({}); mocks.update.mockResolvedValue({ count: 1 }); mocks.find.mockResolvedValue({ cursor: {} })
})
it('does not run another worker while a durable lease is held', async () => {
  mocks.update.mockResolvedValue({ count: 0 })
  const operation = vi.fn()
  expect(await runLeasedJob('renewal-reminders', operation)).toBeNull()
  expect(operation).not.toHaveBeenCalled()
})
it('pins heartbeats and cursor acknowledgement to the claimed token and unexpired lease', async () => {
  const result = await runLeasedJob('renewal-reminders', async ({ heartbeat }) => { await heartbeat(); return { result: 2, cursor: { id: 'c7af3d50-a016-475d-8e51-23fd04989436' } } })
  expect(result).toBe(2)
  const claim = mocks.update.mock.calls[0][0].data.lease_token
  expect(mocks.update.mock.calls[1][0].where).toMatchObject({ id: 'renewal-reminders', lease_token: claim, lease_expires_at: { gt: expect.any(Date) } })
  expect(mocks.update.mock.calls[2][0]).toMatchObject({ where: { lease_token: claim }, data: { cursor: { id: 'c7af3d50-a016-475d-8e51-23fd04989436' }, lease_token: null, lease_expires_at: null } })
})
it('never advances a lost lease or overwrites its replacement after an interrupted batch', async () => {
  mocks.update.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 0 })
  await expect(runLeasedJob('renewal-reminders', async () => ({ result: 1, cursor: {} }))).rejects.toThrow('WORKER_LEASE_LOST')
  const claim = mocks.update.mock.calls[0][0].data.lease_token
  expect(mocks.update.mock.calls[2][0]).toEqual({ where: { id: 'renewal-reminders', lease_token: claim }, data: { lease_token: null, lease_expires_at: null, last_error_code: 'BATCH_FAILED' } })
})
it('records durable bounded-code failures per target and refuses partial cursor state', async () => {
  await recordWorkerFailure('renewal-reminders', 'booking', 'target-booking', 'REMINDER_FAILED')
  expect(mocks.failure).toHaveBeenCalledWith({ where: { id: expect.stringMatching(/^[a-f0-9]{64}$/) },
    create: expect.objectContaining({ job: 'renewal-reminders', target_id: 'target-booking', error_code: 'REMINDER_FAILED', attempts: 1 }),
    update: expect.objectContaining({ attempts: { increment: 1 }, status: 'open' }) })
  expect(dateWorkerCursor.safeParse({ id: 'c7af3d50-a016-475d-8e51-23fd04989436' }).success).toBe(false)
})
