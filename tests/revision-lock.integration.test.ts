import { randomUUID } from 'node:crypto'
import { Int32, Long, MongoClient } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import prisma from '@/lib/db'
import { localMongoDatabaseName, localMongoUrl } from '@/lib/database/config'
import { ensureMongoIndexes } from '@/lib/database/indexes'
import { closeMongoReadiness } from '@/lib/database/readiness'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { lockActiveAccount } from '@/lib/database/revision-lock'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { assertGalleryPermission } from '@/lib/listings/gallery'
import { writeOwnedListingScalars } from '@/lib/listings/scalar-write'
import { claimStorageObjects, removeStoredObjects, storageObjectId, type PreparedStorageObject } from '@/lib/storage-claims/service'
const uri = process.env.RENTRAL_TEST_MONGO_URI, owner = process.env.RENTRAL_TEST_MONGO_OWNER

describe.skipIf(!uri)('owned real Mongo revision-lock semantics', () => {
  let client: MongoClient
  beforeAll(async () => {
    if (!uri || !owner || !/^[a-f0-9]{32}$/.test(owner) || localMongoDatabaseName(uri) !== `rentral_test_${owner}` || process.env.MONGODB_URL !== uri || process.env.DATABASE_URL !== uri) throw new Error('Use only the explicitly owned loopback fixture.')
    client = new MongoClient(localMongoUrl(uri)); await client.connect(); const db = client.db(localMongoDatabaseName(uri))
    const existing = await db.listCollections({}, { nameOnly: true }).toArray(), marker = await db.collection<{ _id: string }>('_FixtureOwnership').findOne({ _id: owner })
    if (!marker && existing.length) throw new Error('Missing fixture ownership marker.')
    if (!marker) await db.collection<{ _id: string }>('_FixtureOwnership').insertOne({ _id: owner })
    await ensureMongoIndexes(db)
  }, 20000)
  afterAll(async () => { await prisma.$disconnect(); await closeMongoReadiness(); await client?.close() })
  const db = () => client.db(localMongoDatabaseName(uri!))
  async function person(fields: Record<string, unknown> = {}) { const id = randomUUID(); await db().collection('User').insertOne({ _id: id, email: id + '@fixture.invalid', revision: Long.ZERO, updatedAt: new Date(0), ...fields } as never); return id }
  async function value(id: string) { return db().collection('User').findOne({ _id: id } as never) }

  it('keeps missing, BSON Int32 and BSON Int64 revisions integral and stamps updatedAt', async () => {
    for (const initial of [undefined, new Int32(7), Long.fromNumber(9)]) {
      const id = await person(initial === undefined ? {} : { revision: initial }); if (initial === undefined) await db().collection('User').updateOne({ _id: id } as never, { $unset: { revision: '' } })
      expect(await withTransaction(tx => lockActiveAccount(tx, id))).toBe(true)
      const row = await value(id); expect(row?.revision).toBe((initial === undefined ? 0 : Number(initial)) + 1); expect(row?.updatedAt.getTime()).toBeGreaterThan(0)
      const types = await db().collection('User').aggregate([{ $match: { _id: id } }, { $project: { revisionType: { $type: '$revision' } } }]).next()
      expect(types?.revisionType).toBe('long')
    }
  })
  it('rolls back both revision and timestamp when work fails after acquiring the lock', async () => {
    const id = await person(); const original = await value(id)
    await expect(withTransaction(async tx => { await assertActiveAccounts(tx, [id]); throw new Error('OWNED_ROLLBACK') })).rejects.toThrow('OWNED_ROLLBACK')
    const after = await value(id); expect(after?.revision).toBe(original?.revision); expect(after?.updatedAt).toEqual(original?.updatedAt)
  })
  it('accepts legacy missing/null activity dates and refuses missing, closed and suspended accounts', async () => {
    for (const fields of [{}, { closed_at: null, suspended_at: null }]) { const id = await person(fields); expect(await withTransaction(tx => lockActiveAccount(tx, id))).toBe(true) }
    for (const fields of [{ closed_at: new Date() }, { suspended_at: new Date() }, { closed_at: new Date(), suspended_at: new Date() }]) { const id = await person(fields); expect(await withTransaction(tx => lockActiveAccount(tx, id))).toBe(false); expect((await value(id))?.revision).toBe(0) }
    expect(await withTransaction(tx => lockRecord(tx, 'user', randomUUID()))).toBe(false)
  })
  it('rejects malformed stored availability dates at the database validation boundary', async () => {
    for (const fields of [{ closed_at: [null] }, { suspended_at: [null] }, { closed_at: 'invalid-date' }]) {
      await expect(person(fields)).rejects.toMatchObject({ code: 121 })
    }
  })
  it('serializes an active account check against concurrent closure, with no work after closure', async () => {
    const id = await person(); let release!: () => void, acquired!: () => void, completedWork = 0
    const gate = new Promise<void>(resolve => { release = resolve }), locked = new Promise<void>(resolve => { acquired = resolve })
    const closing = withTransaction(async tx => { expect(await lockRecord(tx, 'user', id)).toBe(true); await tx.$runCommandRaw({ update: 'User', updates: [{ q: { _id: id }, u: { $currentDate: { closed_at: true } }, multi: false }] }); acquired(); await gate })
    await locked
    const activity = expect(withTransaction(async tx => { await assertActiveAccounts(tx, [id]); completedWork += 1 })).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
    await new Promise(resolve => setTimeout(resolve, 100)); release(); await closing; await activity
    expect(completedWork).toBe(0); expect((await value(id))?.closed_at).toBeInstanceOf(Date)
  }, 20000)
  it('serializes permission revocation with participant activity in the same transaction', async () => {
    const id = await person({ gallery_upload_allowed: true, gallery_permission_revision: 3 }); let release!: () => void, acquired!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), locked = new Promise<void>(resolve => { acquired = resolve })
    const revocation = withTransaction(async tx => { await lockRecord(tx, 'user', id); await tx.$runCommandRaw({ update: 'User', updates: [{ q: { _id: id }, u: { $set: { gallery_upload_allowed: false } }, multi: false }] }); acquired(); await gate })
    await locked
    const readAfterLock = withTransaction(tx => assertGalleryPermission(tx, id, 3))
    const result = expect(readAfterLock).rejects.toMatchObject({ code: 'GALLERY_PERMISSION_REQUIRED' }); await new Promise(resolve => setTimeout(resolve, 100)); release(); await revocation; await result
  }, 20000)
  it('checks a gallery regrant against the exact current epoch without approving a stale listing', async () => {
    const id = await person({ gallery_upload_allowed: true, gallery_permission_revision: 3 })
    expect(await withTransaction(tx => assertGalleryPermission(tx, id, 3))).toBe(3)
    await db().collection('User').updateOne({ _id: id } as never, { $set: { gallery_permission_revision: 4 } })
    await expect(withTransaction(tx => assertGalleryPermission(tx, id, 3))).rejects.toMatchObject({ code: 'GALLERY_PERMISSION_REQUIRED' })
    expect(await withTransaction(tx => assertGalleryPermission(tx, id, 4))).toBe(4)
  })

  async function storedPhoto(ownerId: string): Promise<PreparedStorageObject> {
    const path = ownerId + '/' + randomUUID() + '/photo.jpg', id = storageObjectId('listings-media', path)
    const object = { id, bucket: 'listings-media' as const, path, digest: 'a'.repeat(64), sizeBytes: 100, contentType: 'image/jpeg' }
    await prisma.storageObject.create({ data: { id, bucket: object.bucket, path, owner_id: ownerId, state: 'available', digest: object.digest, size_bytes: object.sizeBytes, content_type: object.contentType } })
    return object
  }
  it('claims every gallery file in a batch and rolls all claims back if one file became unavailable', async () => {
    const ownerId = await person(), one = await storedPhoto(ownerId), two = await storedPhoto(ownerId)
    await prisma.storageObject.update({ where: { id: two.id }, data: { state: 'deleting' } })
    await expect(withTransaction(async tx => { await claimStorageObjects(tx, ownerId, [one, two]); await tx.listing.create({ data: { lister_id: ownerId, category: 'house', poster_path: one.path } }) })).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
    expect((await prisma.storageObject.findUniqueOrThrow({ where: { id: one.id } })).revision).toBe(0)
    expect(await prisma.listing.count({ where: { lister_id: ownerId } })).toBe(0)
    await prisma.storageObject.update({ where: { id: two.id }, data: { state: 'available' } })
    await withTransaction(tx => claimStorageObjects(tx, ownerId, [one, two]))
    expect((await prisma.storageObject.findUniqueOrThrow({ where: { id: one.id } })).revision).toBe(1)
  })
  it('keeps a batched gallery attachment atomic with deletion of its secondary photo', async () => {
    const ownerId = await person(), one = await storedPhoto(ownerId), two = await storedPhoto(ownerId)
    let release!: () => void, acquired!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), locked = new Promise<void>(resolve => { acquired = resolve })
    const attachment = withTransaction(async tx => { await claimStorageObjects(tx, ownerId, [one, two]); acquired(); await gate; await tx.listing.create({ data: { lister_id: ownerId, category: 'house', poster_path: two.path } }) })
    await locked
    const deletion = expect(removeStoredObjects(ownerId, 'listings-media', [two.path])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
    await new Promise(resolve => setTimeout(resolve, 100)); release(); await attachment; await deletion
    expect((await prisma.storageObject.findUniqueOrThrow({ where: { id: two.id } })).state).toBe('available')
  }, 20000)

  it('preserves arbitrary JSON literally through native and Prisma reads, including Extended JSON and operator-like keys', async () => {
    const ownerId = await person(), listing = await prisma.listing.create({ data: { lister_id: ownerId, category: 'house', listing_status: 'draft' } })
    const metadata = JSON.parse('{"$date":"2030-01-01T00:00:00.000Z","nested":{"$numberLong":"12"},"__proto__":{"polluted":true},"a.b":["$ROOT",{"$literal":"$ROOT"}],"empty":{},"fraction":1.25,"nil":null}')
    const at = new Date('2026-11-15T12:00:00.000Z')
    await withTransaction(async tx => { await lockRecord(tx, 'listing', listing.id); await writeOwnedListingScalars(tx, listing.id, ownerId, { asset_metadata: metadata, text_address: '$ROOT', gallery_permission_revision: 3, fee_waived_at: at }, true) })
    const native = await db().collection('Listing').findOne({ _id: listing.id } as never), orm = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })
    expect(native?.asset_metadata).toEqual(metadata); expect(orm.asset_metadata).toEqual(metadata); expect(orm.text_address).toBe('$ROOT'); expect(orm.fee_waived_at).toEqual(at)
    expect(native?.lister_id).toBe(ownerId); expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    const types = await db().collection('Listing').aggregate([{ $match: { _id: listing.id } }, { $project: { epoch: { $type: '$gallery_permission_revision' }, feeDate: { $type: '$fee_waived_at' } } }]).next()
    expect(types).toMatchObject({ epoch: 'long', feeDate: 'date' })
  })
  it('keeps owner and draft predicates on scalar writes and rolls metadata/status changes back with the parent transaction', async () => {
    const ownerId = await person(), listing = await prisma.listing.create({ data: { lister_id: ownerId, category: 'house', listing_status: 'draft', asset_metadata: { original: true } } })
    await expect(withTransaction(tx => writeOwnedListingScalars(tx, listing.id, 'another-owner', { text_address: 'wrong owner' }, true))).rejects.toThrow('LISTING_WRITE_UNCONFIRMED')
    await expect(withTransaction(async tx => { await lockRecord(tx, 'listing', listing.id); await writeOwnedListingScalars(tx, listing.id, ownerId, { asset_metadata: { changed: true }, listing_status: 'pending_verification' }, true); throw new Error('OWNED_SCALAR_ROLLBACK') })).rejects.toThrow('OWNED_SCALAR_ROLLBACK')
    const after = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } }); expect(after.asset_metadata).toEqual({ original: true }); expect(after.listing_status).toBe('draft'); expect(after.revision).toBe(listing.revision)
    await prisma.listing.update({ where: { id: listing.id }, data: { listing_status: 'active' } })
    await expect(withTransaction(tx => writeOwnedListingScalars(tx, listing.id, ownerId, { text_address: 'stale draft' }, true))).rejects.toThrow('LISTING_WRITE_UNCONFIRMED')
  })

})
