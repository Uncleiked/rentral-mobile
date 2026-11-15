import type { Prisma } from '@prisma/client'
import { Prisma as RuntimePrisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const ready = vi.hoisted(() => ({ mongo: vi.fn(), capture: vi.fn(), financial: vi.fn(), lifecycle: vi.fn(), matching: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertMongoReady: ready.mongo, assertCaptureReady: ready.capture, assertFinancialReady: ready.financial, assertLifecycleReady: ready.lifecycle, assertMatchingReady: ready.matching }))
import { lockActiveAccount, lockRecordRevision, type RevisionLockModel } from '@/lib/database/revision-lock'
const models: RevisionLockModel[] = ['conversation', 'user', 'listing', 'listingCapture', 'booking', 'paymentIntent', 'mediaAsset', 'dispute', 'safetyNotice', 'safetyAppeal', 'renewal', 'leaseTermination', 'workerState', 'paymentRecipient', 'financialOperation', 'providerReceipt', 'matchProfile', 'matchConnection', 'matchReport', 'commercialOrder', 'sponsoredCampaign', 'pushDevice', 'pushDelivery']
const acknowledged = { ok: 1, n: 1, nModified: 1 }
const client = (command = vi.fn().mockResolvedValue(acknowledged)) => ({ tx: { $runCommandRaw: command } as unknown as Prisma.TransactionClient, command })
beforeEach(() => { vi.resetAllMocks(); for (const fn of Object.values(ready)) fn.mockResolvedValue(undefined) })

describe('bounded scalar revision locks', () => {
  it('uses one transaction command with exact active-account conditions and no ORM relation update', async () => {
    const { tx, command } = client()
    expect(await lockActiveAccount(tx, 'member')).toBe(true)
    expect(command).toHaveBeenCalledOnce()
    expect(command).toHaveBeenCalledWith({ update: 'User', updates: [{ q: { _id: 'member', closed_at: null, suspended_at: null }, u: { $inc: { revision: { $numberLong: '1' } }, $currentDate: { updatedAt: true } }, multi: false, upsert: false }] })
    expect(ready.mongo).toHaveBeenCalledOnce()
  })
  it('reports a missing or inactive record without creating it', async () => {
    const { tx } = client(vi.fn().mockResolvedValue({ ok: 1, n: 0, nModified: 0 }))
    expect(await lockActiveAccount(tx, 'missing')).toBe(false)
    expect(await lockRecordRevision(tx, 'listing', 'missing')).toBe(false)
  })
  it.each([null, {}, { ...acknowledged, ok: 0 }, { ...acknowledged, n: 2, nModified: 2 }, { ...acknowledged, nModified: 0 }, { ...acknowledged, n: '1' }, { ...acknowledged, writeErrors: [{}] }, { ...acknowledged, writeConcernError: {} }])('rejects an unconfirmed command outcome %j', async result => {
    const { tx } = client(vi.fn().mockResolvedValue(result))
    await expect(lockRecordRevision(tx, 'user', 'member')).rejects.toThrow('REVISION_LOCK_UNCONFIRMED')
  })
  it('rejects arbitrary or immutable collections and non-string identifiers before any database call', async () => {
    const { tx, command } = client()
    for (const model of ['AdminAudit', 'MutationReceipt', '__proto__', 'User', 'storageObject']) await expect(lockRecordRevision(tx, model as RevisionLockModel, 'member')).rejects.toThrow('INVALID_REVISION_LOCK')
    await expect(lockActiveAccount(tx, { $ne: null } as unknown as string)).rejects.toThrow('INVALID_REVISION_LOCK')
    expect(command).not.toHaveBeenCalled()
  })
  it('retains each model readiness gate and stamps only schema-declared automatic timestamps', async () => {
    for (const model of models) {
      vi.clearAllMocks(); const { tx, command } = client(); await lockRecordRevision(tx, model, 'record')
      const raw = command.mock.calls[0][0], schema = RuntimePrisma.dmmf.datamodel.models.find(value => value.name === raw.update)!
      expect(schema).toBeDefined(); expect(schema.fields.some(field => field.name === 'revision')).toBe(true)
      expect(Boolean(raw.updates[0].u.$currentDate)).toBe(schema.fields.some(field => field.name === 'updatedAt' && field.isUpdatedAt))
      const gate = model === 'listingCapture' ? ready.capture : ['paymentRecipient', 'financialOperation', 'providerReceipt'].includes(model) ? ready.financial : ['leaseTermination', 'workerState'].includes(model) ? ready.lifecycle : ['matchProfile', 'matchConnection', 'matchReport'].includes(model) ? ready.matching : ready.mongo
      expect(gate).toHaveBeenCalledOnce(); expect(Object.values(ready).reduce((sum, fn) => sum + fn.mock.calls.length, 0)).toBe(1)
    }
  })
  it('fails closed when the required database preparation is unavailable', async () => {
    ready.financial.mockRejectedValue(new Error('DATABASE_SETUP_REQUIRED')); const { tx, command } = client()
    await expect(lockRecordRevision(tx, 'financialOperation', 'operation')).rejects.toThrow('DATABASE_SETUP_REQUIRED'); expect(command).not.toHaveBeenCalled()
  })
  it('preserves a real Prisma write conflict for the existing bounded transaction retry', async () => {
    const conflict = { code: 'P2034' }; const { tx } = client(vi.fn().mockRejectedValue(conflict))
    await expect(lockActiveAccount(tx, 'member')).rejects.toBe(conflict)
  })
})
