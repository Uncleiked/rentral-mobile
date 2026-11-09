import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Client = { findOne: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
const state = vi.hoisted(() => ({ clients: [] as Client[], nextRead: (() => Promise.resolve({ schemaVersion: 1 })) as () => Promise<unknown> }))

vi.mock('mongodb', () => ({
  MongoClient: class {
    findOne = vi.fn().mockImplementation(() => state.nextRead())
    close = vi.fn().mockResolvedValue(undefined)
    constructor() { state.clients.push(this) }
    db() { return { collection: () => ({ findOne: this.findOne }) } }
  },
}))
vi.mock('@/lib/database/config', () => ({
  mongoUrl: (value: string) => value,
  mongoDatabaseName: () => 'owned_readiness_fixture',
}))

import { assertMongoReady, assertStorageClaimsReady, assertFinancialReady, assertLifecycleReady, lifecyclePrepared, closeMongoReadiness, assertMediaUploadReady, assertCommercialReady, assertMessagingActivityReady, commercialPrepared } from '@/lib/database/readiness'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

describe('Mongo readiness recovery', () => {
  beforeEach(() => {
    vi.stubEnv('MONGODB_URL', 'mongodb://fixture-a/owned_readiness_fixture')
    state.clients.length = 0
    state.nextRead = () => Promise.resolve({ schemaVersion: 1 })
  })
  afterEach(async () => { await closeMongoReadiness(); vi.unstubAllEnvs(); vi.useRealTimers() })

  it('keeps core accounts available but blocks storage claims until their feature preparation is recorded', async () => {
    vi.useFakeTimers()
    await assertMongoReady()
    await expect(assertStorageClaimsReady()).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
    expect(state.clients[0].findOne).toHaveBeenCalledOnce()
    state.nextRead = () => Promise.resolve({ schemaVersion: 1, storageClaimsVersion: 1 })
    vi.advanceTimersByTime(5001)
    await assertStorageClaimsReady()
    expect(state.clients).toHaveLength(1)
    expect(state.clients[0].findOne).toHaveBeenCalledTimes(2)
  })

  it('rejects an incompatible storage feature version without disabling core authentication', async () => {
    state.nextRead = () => Promise.resolve({ schemaVersion: 1, storageClaimsVersion: 2 })
    await assertMongoReady()
    await expect(assertStorageClaimsReady()).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
  })
  it('prepares media transport, commercial billing and conversation activity independently of core auth', async () => {
    vi.useFakeTimers()
    await assertMongoReady()
    await expect(assertMediaUploadReady()).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
    await expect(assertCommercialReady()).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
    await expect(assertMessagingActivityReady()).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
    expect(await commercialPrepared()).toBe(false)
    state.nextRead = () => Promise.resolve({ schemaVersion: 1, mediaUploadVersion: 1, commercialVersion: 1, messagingActivityVersion: 1 })
    vi.advanceTimersByTime(5001)
    await assertMediaUploadReady(); await assertCommercialReady(); await assertMessagingActivityReady()
    expect(await commercialPrepared()).toBe(true)
  })

  it('keeps existing accounts and storage available while new money/lifecycle collections remain unprepared', async () => {
    vi.useFakeTimers()
    state.nextRead = () => Promise.resolve({ schemaVersion: 1, storageClaimsVersion: 1 })
    await assertStorageClaimsReady()
    expect(await lifecyclePrepared()).toBe(false)
    await expect(assertFinancialReady()).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
    await expect(assertLifecycleReady()).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
    state.nextRead = () => Promise.resolve({ schemaVersion: 1, storageClaimsVersion: 1, financialVersion: 1, lifecycleVersion: 1 })
    vi.advanceTimersByTime(5001)
    await assertFinancialReady(); await assertLifecycleReady()
    expect(await lifecyclePrepared()).toBe(true)
    expect(state.clients).toHaveLength(1)
  })

  it('discards a failed connection and recovers on the next request, then caches only a successful marker', async () => {
    vi.useFakeTimers()
    state.nextRead = () => Promise.reject(new Error('Initial connection failed'))
    await expect(assertMongoReady()).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE', status: 503 })
    expect(state.clients).toHaveLength(1)
    expect(state.clients[0].close).toHaveBeenCalledOnce()

    state.nextRead = () => Promise.resolve({ schemaVersion: 1 })
    await assertMongoReady()
    await assertMongoReady()
    expect(state.clients).toHaveLength(2)
    expect(state.clients[1].findOne).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(5001)
    await assertMongoReady()
    expect(state.clients[1].findOne).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent failing reads and creates one replacement client for concurrent retries', async () => {
    const read = deferred<unknown>()
    state.nextRead = () => read.promise
    const failures = Promise.allSettled([assertMongoReady(), assertMongoReady()])
    await Promise.resolve()
    expect(state.clients).toHaveLength(1)
    expect(state.clients[0].findOne).toHaveBeenCalledOnce()
    read.reject(new Error('Connection failed'))
    expect((await failures).every(result => result.status === 'rejected')).toBe(true)
    expect(state.clients[0].close).toHaveBeenCalledOnce()

    state.nextRead = () => Promise.resolve({ schemaVersion: 1 })
    await Promise.all([assertMongoReady(), assertMongoReady()])
    expect(state.clients).toHaveLength(2)
    expect(state.clients[1].findOne).toHaveBeenCalledOnce()
  })

  it('keeps missing or stale setup markers fail-closed while reusing a healthy connection after setup', async () => {
    state.nextRead = () => Promise.resolve(null)
    await expect(assertMongoReady()).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
    state.nextRead = () => Promise.resolve({ schemaVersion: 0 })
    await expect(assertMongoReady()).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
    expect(state.clients).toHaveLength(1)
    expect(state.clients[0].close).not.toHaveBeenCalled()
    state.nextRead = () => Promise.resolve({ schemaVersion: 1 })
    await assertMongoReady()
    expect(state.clients).toHaveLength(1)
    expect(state.clients[0].findOne).toHaveBeenCalledTimes(3)
  })

  it('preserves the safe availability error when failed-client cleanup also rejects', async () => {
    const read = deferred<unknown>()
    state.nextRead = () => read.promise
    const result = expect(assertMongoReady()).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    await Promise.resolve()
    state.clients[0].close.mockRejectedValueOnce(new Error('Cleanup failed'))
    read.reject(new Error('Connection failed'))
    await result
    state.nextRead = () => Promise.resolve({ schemaVersion: 1 })
    await assertMongoReady()
    expect(state.clients).toHaveLength(2)
  })

  it('does not let a late old-URI failure evict or clear a new connection and its readiness cache', async () => {
    const oldRead = deferred<unknown>()
    state.nextRead = () => oldRead.promise
    const oldResult = expect(assertMongoReady()).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    await Promise.resolve()
    state.nextRead = () => Promise.resolve({ schemaVersion: 1 })
    vi.stubEnv('MONGODB_URL', 'mongodb://fixture-b/owned_readiness_fixture')
    await assertMongoReady()
    expect(state.clients).toHaveLength(2)
    oldRead.reject(new Error('Old connection failed late'))
    await oldResult
    await assertMongoReady()
    expect(state.clients).toHaveLength(2)
    expect(state.clients[1].close).not.toHaveBeenCalled()
    expect(state.clients[1].findOne).toHaveBeenCalledOnce()
  })
})
