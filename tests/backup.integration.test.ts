import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { BSON, MongoClient } from 'mongodb'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localMongoDatabaseName, localMongoUrl } from '@/lib/database/config'
import { ensureMongoIndexes } from '@/lib/database/indexes'
import { MONGO_SETUP_COLLECTION, MONGO_SETUP_ID } from '@/lib/database/metadata'
import { captureBackup } from '@/lib/backup/capture'
import { verifyEncryptedArchive } from '@/lib/backup/archive'
import { verifyOwnedRestore } from '@/lib/backup/restore'
import { createLocalStorage } from '@/lib/local-storage/core'

const uri = process.env.RENTRAL_TEST_MONGO_URI, owner = process.env.RENTRAL_TEST_MONGO_OWNER
const fixture = describe.skipIf(!uri)
fixture('owned encrypted backup and quarantined restoration', () => {
  let native: MongoClient, source: PrismaClient, root: string, sourceName: string, archive: string, userId: string
  const key = Buffer.alloc(32, 61)
  beforeAll(async () => {
    if (!uri || !owner || !/^[a-f0-9]{32}$/.test(owner) || localMongoDatabaseName(uri) !== `rentral_test_${owner}` || process.env.MONGODB_URL !== uri || process.env.DATABASE_URL !== uri) throw new Error('Only the exact owned loopback replica fixture is permitted.')
    native = new MongoClient(localMongoUrl(uri)); await native.connect()
    if (!await native.db(localMongoDatabaseName(uri)).collection<{ _id: string }>('_FixtureOwnership').findOne({ _id: owner })) throw new Error('Owned fixture marker missing.')
    sourceName = `rentral_backup_${owner}`
    if (await native.db(sourceName).listCollections().hasNext()) throw new Error('Backup source namespace already exists.')
    await native.db(sourceName).collection<{ _id: string }>('_FixtureOwnership').insertOne({ _id: owner })
    await ensureMongoIndexes(native.db(sourceName))
    const sourceUri = new URL(uri); sourceUri.pathname = `/${sourceName}`
    source = new PrismaClient({ datasources: { db: { url: sourceUri.href } } })
    const artifacts = resolve('test-results'); await mkdir(artifacts, { recursive: true }); root = await mkdtemp(join(artifacts, 'owned-backup-fixture-'))
    const storage = join(root, 'source-storage'); await mkdir(storage)
    const user = await source.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, username: `backup_${randomUUID().slice(0, 12)}`, password_hash: 'fixture-private-hash-never-logged', analytics_consent: true } }); userId = user.id
    const path = `${user.id}/avatar.png`, png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6XIAAAAASUVORK5CYII=', 'base64'))
    const store = createLocalStorage(storage); await store.upload('profile-avatars', path, new Blob([png]).stream(), 'image/png'); await store.remove('profile-avatars', `${user.id}/deleted.png`)
    await source.storageObject.create({ data: { id: createHash('sha256').update(`profile-avatars\0${path}`).digest('hex'), bucket: 'profile-avatars', path, owner_id: user.id, state: 'available', digest: createHash('sha256').update(png).digest('hex'), size_bytes: png.length, content_type: 'image/png' } })
    const payment = await source.paymentIntent.create({ data: { user_id: user.id, kind: 'listing_fee', reference: randomUUID(), idempotency_key: randomUUID(), amount_kobo: 100000n, customer_email: user.email, status: 'succeeded', provider_environment: 'test', paid_at: new Date(), provider_transaction_id: '999999' } })
    await source.ledgerTransaction.create({ data: { payment_id: payment.id, kind: 'provider_collection', currency: 'NGN', business_key: `provider_collection:${payment.id}`, entries: { create: [
      { account_key: 'provider:collections', direction: 'debit', amount_kobo: 100000n, currency: 'NGN' }, { account_key: `customer:${user.id}`, direction: 'credit', amount_kobo: 100000n, currency: 'NGN' },
    ] } } })
    await source.authSession.create({ data: { user_id: user.id, refresh_hash: createHash('sha256').update('owned-backup-refresh').digest('hex'), revoked_at: null, expires_at: new Date(Date.now() + 86400000) } })
    await source.passwordReset.create({ data: { user_id: user.id, token_hash: createHash('sha256').update('owned-backup-reset').digest('hex'), used_at: null, expires_at: new Date(Date.now() + 600000) } })
    await source.authEmailDelivery.create({ data: { user_id: user.id, kind: 'password_reset', dedupe_key: randomUUID(), encrypted_payload: 'owned-nonlive-ciphertext-fixture', key_id: 'a'.repeat(16), status: 'pending', expires_at: new Date(Date.now() + 600000) } })
    const notification = await source.notification.create({ data: { user_id: user.id, kind: 'account', title: 'Owned backup fixture', body: 'No provider delivery occurs.' } })
    const deviceId = randomUUID(), now = new Date()
    await native.db(sourceName).collection<{ _id: string; [key: string]: unknown }>('PushDevice').insertOne({ _id: deviceId, revision: 0, user_id: user.id, installation_id: randomUUID(), token_hash: createHash('sha256').update('owned-push-token').digest('hex'), proof_hash: createHash('sha256').update('owned-push-proof').digest('hex'), platform: 'ios', status: 'active', token_ciphertext: 'owned-nonlive-token-ciphertext', token_iv: 'owned-iv', token_tag: 'owned-tag', opted_in_at: now, revoked_at: null, createdAt: now, updatedAt: now })
    await native.db(sourceName).collection<{ _id: string; [key: string]: unknown }>('PushDelivery').insertOne({ _id: randomUUID(), revision: 0, notification_id: notification.id, device_id: deviceId, user_id: user.id, status: 'ticketed', ticket_id: 'owned-nonlive-ticket', attempts: 1, createdAt: now, updatedAt: now })
    await mkdir(join(storage, 'mail-outbox')); await writeFile(join(storage, 'mail-outbox', 'owned.json'), '{"code":"owned-expired-mailbox-fixture"}')
    await native.db(sourceName).collection('BsonProof').insertOne({ amount: BSON.Long.MAX_VALUE, ordinaryLong: BSON.Long.fromNumber(100000), binary: new BSON.Binary(Buffer.from([0, 255, 17])) })
    archive = join(root, 'snapshot.rentral')
    await captureBackup({ client: native, databaseName: sourceName, storageRoot: storage, output: archive, key, acknowledgeQuiesced: true })
  }, 30000)
  afterAll(async () => {
    const staged = process.env.RENTRAL_TEST_BACKUP_ARCHIVE
    if (archive && staged) {
      const expected = resolve('test-results', `owned-backup-cli-${owner}`, 'snapshot.rentral')
      if (!owner || resolve(staged) !== expected || await readFile(join(resolve(staged, '..'), '.owner'), 'utf8') !== owner) throw new Error('Unowned backup fixture staging path.')
      await copyFile(archive, staged, constants.COPYFILE_EXCL)
    }
    await source?.$disconnect(); await native?.close()
    if (root) { if (!resolve(root).startsWith(`${resolve('test-results')}${sep}`) || !root.includes('owned-backup-fixture-')) throw new Error('Unsafe backup fixture cleanup.'); await rm(root, { recursive: true, force: true }) }
  })
  it('round-trips typed money, binary files, tombstones, indexes and validators while revoking restored capabilities', async () => {
    const restoreOwner = randomBytes(16).toString('hex'), target = new URL(uri!); target.pathname = `/rentral_restore_${restoreOwner}`
    const restored = join(root, `rentral-restore-${restoreOwner}`)
    const result = await verifyOwnedRestore({ archive, key, targetUri: target.href, configuredUri: uri!, owner: restoreOwner, restoreRoot: restored })
    expect(result.journals).toBe(1); expect(result.storageClaims).toBe(1); expect(result.files).toBeGreaterThanOrEqual(3)
    const db = native.db(`rentral_restore_${restoreOwner}`, { promoteLongs: false })
    expect(await db.collection('AuthSession').findOne({ user_id: userId })).toMatchObject({ revoked_at: expect.any(Date) })
    expect(await db.collection('PasswordReset').findOne({ user_id: userId })).toMatchObject({ used_at: expect.any(Date) })
    expect(await db.collection('AuthEmailDelivery').findOne({ user_id: userId })).toMatchObject({ status: 'expired', encrypted_payload: null })
    expect(await db.collection('PushDevice').findOne({ user_id: userId })).toMatchObject({ status: 'revoked', token_ciphertext: null, token_iv: null, token_tag: null })
    expect(await db.collection('PushDelivery').findOne({ user_id: userId })).toMatchObject({ status: 'skipped', error_code: 'RESTORE_QUARANTINE' })
    await expect(readFile(join(restored, 'storage', 'mail-outbox', 'owned.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await source.authSession.findFirst({ where: { user_id: userId } })).toMatchObject({ revoked_at: null })
    expect(await source.user.findUnique({ where: { id: userId } })).toMatchObject({ analytics_consent: true })
    expect(await db.collection('User').findOne({ email: { $regex: '@fixture.invalid$' } })).toMatchObject({ analytics_consent: false, password_hash: null, staff_role: null })
    const marker = await db.collection<{ _id: string; schemaVersion: number }>(MONGO_SETUP_COLLECTION).findOne({ _id: MONGO_SETUP_ID })
    expect(marker).toMatchObject({ schemaVersion: 0, restorationRequired: true })
    await expect(ensureMongoIndexes(db)).rejects.toThrow('RESTORE_QUARANTINED_SETUP_REFUSED')
    expect(await db.collection<{ _id: string; schemaVersion: number }>(MONGO_SETUP_COLLECTION).findOne({ _id: MONGO_SETUP_ID })).toMatchObject({ schemaVersion: 0 })
    const proof = await db.collection('BsonProof').findOne()
    expect(BSON.Long.isLong(proof?.ordinaryLong)).toBe(true); expect(proof?.amount.toString()).toBe(BSON.Long.MAX_VALUE.toString())
    expect(proof?.binary).toBeInstanceOf(BSON.Binary)
    const store = createLocalStorage(join(restored, 'storage'))
    expect((await store.info('profile-avatars', `${userId}/avatar.png`)).contentType).toBe('image/png')
    const png = await readFile(join(root, 'source-storage', 'profile-avatars', userId, 'avatar.png'))
    await expect(store.upload('profile-avatars', `${userId}/deleted.png`, new Blob([png]).stream(), 'image/png')).rejects.toMatchObject({ code: 'FILE_NAME_USED' })
    const user = await db.collection('User').findOne({ email: { $regex: '@fixture.invalid$' } })
    await expect(db.collection<{ _id: string; [key: string]: unknown }>('User').insertOne({ ...user!, _id: randomUUID() })).rejects.toMatchObject({ code: 11000 })
    await expect(db.collection('User').updateOne({ email: user!.email }, { $set: { email: 99 } })).rejects.toMatchObject({ code: 121 })
  }, 30000)
  it('rejects tampering before it creates the isolated target database or restore directory', async () => {
    const bytes = await readFile(archive), changed = Buffer.from(bytes); changed[Math.floor(changed.length / 2)] ^= 1
    const path = join(root, 'tampered.rentral'); await writeFile(path, changed)
    const restoreOwner = randomBytes(16).toString('hex'), target = new URL(uri!); target.pathname = `/rentral_restore_${restoreOwner}`
    await expect(verifyOwnedRestore({ archive: path, key, targetUri: target.href, configuredUri: uri!, owner: restoreOwner, restoreRoot: join(root, `rentral-restore-${restoreOwner}`) })).rejects.toThrow()
    expect(await native.db(`rentral_restore_${restoreOwner}`).listCollections().hasNext()).toBe(false)
    expect((await verifyEncryptedArchive(archive, key)).documents).toBeGreaterThan(0)
  })
})
