import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction } }))
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertAppendOnlyOperation } from '@/lib/database/append-only'
import { localMongoUrl, localMongoDatabaseName, mongoUrl, mongoDatabaseName } from '@/lib/database/config'
import { MONGO_INDEXES } from '@/lib/database/indexes'

beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.useRealTimers())

it('retries database write conflicts but never retries application errors', async () => {
  vi.useFakeTimers()
  mocks.transaction.mockRejectedValueOnce({ code: 'P2034' }).mockResolvedValueOnce('committed')
  const result = withTransaction(async () => 'committed')
  await vi.runAllTimersAsync()
  expect(await result).toBe('committed')
  expect(mocks.transaction).toHaveBeenCalledTimes(2)
  const invalid = new Error('BOOKING_CONFLICT')
  mocks.transaction.mockRejectedValue(invalid)
  await expect(withTransaction(async () => undefined)).rejects.toBe(invalid)
  expect(mocks.transaction).toHaveBeenCalledTimes(3)
})

it('bounds repeated database conflicts to five attempts', async () => {
  vi.useFakeTimers()
  const conflict = { code: 'P2034' }
  mocks.transaction.mockRejectedValue(conflict)
  const result = expect(withTransaction(async () => undefined)).rejects.toBe(conflict)
  await vi.runAllTimersAsync()
  await result
  expect(mocks.transaction).toHaveBeenCalledTimes(5)
})

it('lets a six-second transaction finish without replaying timed-out transactions', async () => {
  vi.useFakeTimers()
  const expired = { code: 'P2028' }
  mocks.transaction.mockImplementation(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { timeout: number }) => {
    let expiry: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => { expiry = setTimeout(() => reject(expired), options.timeout) })
    try {
      // The operation uses no delegate; only the mocked database deadline matters.
      return await Promise.race([operation({} as Prisma.TransactionClient), timedOut])
    } finally { clearTimeout(expiry) }
  })
  const operation = withTransaction(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 6000))
    return 'committed'
  })
  const completed = expect(operation).resolves.toBe('committed')
  await vi.runAllTimersAsync()
  await completed
  expect(mocks.transaction).toHaveBeenCalledOnce()

  mocks.transaction.mockRejectedValue(expired)
  await expect(withTransaction(async () => 'must not replay')).rejects.toBe(expired)
  expect(mocks.transaction).toHaveBeenCalledTimes(2)
})

it('caps acquisition and execution by the time left after a conflict and retry delay', async () => {
  vi.useFakeTimers()
  const started = Date.now()
  const limits: { elapsed: number; maxWait: number; timeout: number }[] = []
  mocks.transaction.mockImplementation(async (_operation: unknown, options: { maxWait: number; timeout: number }) => {
    limits.push({ elapsed: Date.now() - started, ...options })
    if (limits.length === 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 6000))
      throw { code: 'P2034' }
    }
    return 'committed'
  })
  const completed = expect(withTransaction(async () => 'committed')).resolves.toBe('committed')
  await vi.runAllTimersAsync()
  await completed
  expect(limits).toHaveLength(2)
  for (const limit of limits) {
    expect(limit.maxWait).toBeGreaterThan(0)
    expect(limit.maxWait).toBeLessThanOrEqual(5000)
    expect(limit.timeout).toBeGreaterThan(0)
    expect(limit.timeout).toBeLessThanOrEqual(10000)
    expect(limit.maxWait + limit.timeout).toBeLessThanOrEqual(15000 - limit.elapsed)
  }
  expect(limits[1].elapsed).toBeGreaterThan(6000)
  expect(limits[1].maxWait + limits[1].timeout).toBeLessThan(limits[0].maxWait + limits[0].timeout)
})

it('does not open another transaction when a scheduled retry resumes after the total deadline', async () => {
  vi.useFakeTimers()
  const conflict = { code: 'P2034' }
  mocks.transaction.mockRejectedValueOnce(conflict).mockResolvedValue('unexpected late attempt')
  const completed = expect(withTransaction(async () => 'committed')).rejects.toBe(conflict)
  await vi.advanceTimersByTimeAsync(0)
  vi.setSystemTime(Date.now() + 15000)
  await vi.runAllTimersAsync()
  await completed
  expect(mocks.transaction).toHaveBeenCalledOnce()
})

it('locks by an actual revision increment and reports missing documents', async () => {
  const update = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
  // This isolated test supplies only the delegate used at the transaction boundary.
  const tx = { listing: { updateMany: update } } as unknown as Prisma.TransactionClient
  expect(await lockRecord(tx, 'listing', 'listing-id')).toBe(true)
  expect(await lockRecord(tx, 'listing', 'missing')).toBe(false)
  expect(update).toHaveBeenNthCalledWith(1, { where: { id: 'listing-id' }, data: { revision: { increment: 1 } } })
})

it('keeps money, audit and credit allocations append-only through the server client', () => {
  for (const model of ['LedgerTransaction', 'LedgerEntry', 'AdminAudit', 'HoldCreditAllocation']) {
    for (const operation of ['update', 'updateMany', 'delete', 'deleteMany', 'upsert']) {
      expect(() => assertAppendOnlyOperation(model, operation)).toThrow('APPEND_ONLY_RECORD')
    }
    expect(() => assertAppendOnlyOperation(model, 'create')).not.toThrow()
    expect(() => assertAppendOnlyOperation(model, 'findMany')).not.toThrow()
  }
  expect(() => assertAppendOnlyOperation('Booking', 'update')).not.toThrow()
})

it('blocks nested immutable updates and rebindings without treating Json metadata as ORM writes', () => {
  const relations = { User: { payments: 'PaymentIntent', adminActions: 'AdminAudit' }, PaymentIntent: { ledger: 'LedgerTransaction' }, LedgerTransaction: { entries: 'LedgerEntry' } }
  expect(() => assertAppendOnlyOperation('User', 'update', { data: { adminActions: { connect: { id: 'existing-audit' } } } }, relations)).toThrow('APPEND_ONLY_RECORD')
  expect(() => assertAppendOnlyOperation('User', 'update', { data: { payments: { update: { where: { id: 'payment' }, data: { ledger: { update: { kind: 'tamper' } } } } } } }, relations)).toThrow('APPEND_ONLY_RECORD')
  expect(() => assertAppendOnlyOperation('LedgerTransaction', 'create', { data: { entries: { connect: [{ id: 'existing-entry' }] } } }, relations)).toThrow('APPEND_ONLY_RECORD')
  expect(() => assertAppendOnlyOperation('PaymentIntent', 'update', { data: { metadata: { ledger: { update: 'customer text' } } } }, relations)).not.toThrow()
  expect(() => assertAppendOnlyOperation('PaymentIntent', 'update', { data: { ledger: { create: { entries: { create: [{ amount_kobo: BigInt(100) }] } } } } }, relations)).not.toThrow()
})

it('allows only named local MongoDB targets and never exposes a rejected connection in errors', () => {
  expect(localMongoDatabaseName()).toBe('rentral')
  expect(localMongoUrl('mongodb://localhost:27017/rentral_test')).toBe('mongodb://localhost:27017/rentral_test')
  for (const uri of ['postgresql://user:secret@localhost/db', 'mongodb+srv://secret@host.example/db', 'mongodb://host.example/db']) {
    expect(() => localMongoUrl(uri)).toThrow()
    try { localMongoUrl(uri) } catch (error) { expect(String(error)).not.toContain('secret@') }
  }
})

it('preserves configured MongoDB endpoints and names while normalizing missing names and remote TLS', () => {
  const uri = 'mongodb+srv://fixture:password@cluster.example.net/existing?retryWrites=true'
  expect(mongoUrl(uri)).toBe(uri)
  expect(mongoUrl('mongodb+srv://fixture:password@cluster.example.net/?retryWrites=true', 'chosen')).toBe('mongodb+srv://fixture:password@cluster.example.net/chosen?retryWrites=true')
  expect(mongoUrl('mongodb://host1.example:27017,host2.example:27017/chosen')).toBe('mongodb://host1.example:27017,host2.example:27017/chosen?tls=true')
  expect(mongoDatabaseName('mongodb://localhost/', 'chosen')).toBe('chosen')
  expect(() => mongoUrl('mongodb://remote.example/db?tls=false')).toThrow('require TLS')
  expect(() => mongoUrl('mongodb+srv://cluster.example.net/db?tlsAllowInvalidCertificates=true')).toThrow('validate TLS')
})

it('uses partial unique indexes for nullable keys and preserves message/save/payment idempotency', () => {
  for (const [collection, field] of [['User', 'username'], ['MediaAsset', 'mux_asset_id'], ['MediaAsset', 'playback_id'], ['PaymentIntent', 'provider_transaction_id'], ['Notification', 'dedupe_key']]) {
    expect(MONGO_INDEXES.find(index => index.collection === collection && field in index.keys)?.options).toMatchObject({ unique: true, partialFilterExpression: { [field]: { $type: 'string' } } })
  }
  for (const [collection, keys] of [['SavedListing', ['user_id', 'listing_id']], ['Message', ['sender_id', 'client_id']], ['Conversation', ['listing_id', 'seeker_id']], ['PaymentIntent', ['idempotency_key']]] as const) {
    expect(MONGO_INDEXES.some(index => index.collection === collection && index.options.unique && keys.every(key => key in index.keys))).toBe(true)
  }
  const names = MONGO_INDEXES.map(index => `${index.collection}:${index.options.name}`)
  expect(new Set(names).size).toBe(names.length)
})
