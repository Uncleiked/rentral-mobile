import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { BSON, MongoClient, type CreateCollectionOptions, type Db, type Document, type IndexDescription } from 'mongodb'
import { localMongoDatabaseName, localMongoUrl, mongoDatabaseName, mongoUrl } from '../database/config.ts'
import { MONGO_SETUP_COLLECTION, MONGO_SETUP_ID } from '../database/metadata.ts'
import { assertNoSymlinks, pathWithin } from './capture.ts'
import { BackupError, safeBackupPath, withVerifiedBackup, type BackupSummary } from './archive.ts'
import { createLocalStorage } from '../local-storage/core.ts'
import { storageBucket, type StorageBucket } from '../local-storage/policy.ts'
import { verifyGalleryReferences } from './gallery.ts'

function integer(value: unknown): bigint {
  if (BSON.Long.isLong(value)) return value.toBigInt()
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value)
  throw new BackupError('INVALID_JOURNAL_AMOUNT')
}
async function verifyJournals(db: Db): Promise<number> {
  let count = 0
  const cursor = db.collection('LedgerTransaction').find({}, { batchSize: 50 })
  try {
    for await (const journal of cursor) {
      const rows = await db.collection('LedgerEntry').find({ transaction_id: journal._id }).limit(1001).toArray()
      if (rows.length < 2 || rows.length > 1000) throw new BackupError('JOURNAL_ENTRY_COUNT_INVALID')
      let debit = 0n, credit = 0n
      for (const row of rows) {
        const amount = integer(row.amount_kobo)
        if (amount <= 0n || row.currency !== journal.currency || !['debit', 'credit'].includes(row.direction)) throw new BackupError('JOURNAL_BINDING_INVALID')
        if (row.direction === 'debit') debit += amount; else credit += amount
      }
      if (debit !== credit) throw new BackupError('UNBALANCED_JOURNAL')
      count += 1
    }
  } finally { await cursor.close() }
  const orphan = await db.collection('LedgerEntry').aggregate([{ $lookup: { from: 'LedgerTransaction', localField: 'transaction_id', foreignField: '_id', as: 'journal' } }, { $match: { journal: { $size: 0 } } }, { $limit: 1 }]).hasNext()
  if (orphan) throw new BackupError('ORPHAN_JOURNAL_ENTRY')
  return count
}
async function verifyStorageClaims(db: Db, storage: string): Promise<number> {
  let count = 0
  const store = createLocalStorage(storage)
  async function verifyFile(bucket: StorageBucket, path: string, ownerId: unknown) {
    if (typeof ownerId !== 'string' || path.split('/')[0] !== ownerId) throw new BackupError('STORAGE_REFERENCE_OWNER_INVALID')
    const info = await store.info(bucket, path)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(join(storage, bucket, ...safeBackupPath(path)))) hash.update(chunk)
    if (hash.digest('hex') !== info.digest) throw new BackupError('STORAGE_FILE_DIGEST_MISMATCH')
    return info
  }
  const cursor = db.collection<{ _id: string; [key: string]: unknown }>('StorageObject').find({ state: 'available' }, { batchSize: 50 })
  try {
    for await (const object of cursor) {
      if (typeof object.bucket !== 'string' || !['listings-media', 'compliance-docs', 'profile-avatars'].includes(object.bucket) || typeof object.path !== 'string') throw new BackupError('STORAGE_CLAIM_INVALID')
      const bucket = storageBucket(object.bucket), info = await verifyFile(bucket, object.path, object.owner_id)
      if (object._id !== createHash('sha256').update(`${bucket}\0${object.path.toLowerCase()}`).digest('hex') || info.digest !== object.digest || info.size !== object.size_bytes || info.contentType !== object.content_type) throw new BackupError('STORAGE_CLAIM_DIGEST_MISMATCH')
      count += 1
    }
  } finally { await cursor.close() }
  // Legacy references may predate persistent claims. Verify those too, without
  // fetching external URLs or assuming missing bytes can be regenerated.
  const listings = db.collection('Listing').find({}, { projection: { lister_id: 1, listing_status: 1, video_path: 1, poster_path: 1, document_path: 1, capture_id: 1, media_source: 1, gallery_media: 1, gallery_media_paths: 1, gallery_permission_revision: 1 }, batchSize: 50 })
  try { for await (const listing of listings) {
    for (const field of ['video_path', 'poster_path', 'document_path']) if (typeof listing[field] === 'string') await verifyFile(field === 'document_path' ? 'compliance-docs' : 'listings-media', listing[field], listing.lister_id)
    await verifyGalleryReferences(listing, (path, owner) => verifyFile('listings-media', path, owner), id => db.collection<{ _id: string; [key: string]: unknown }>('StorageObject').findOne({ _id: id }))
  } }
  finally { await listings.close() }
  const avatars = db.collection('User').find({ avatar_url: { $type: 'string' } }, { projection: { avatar_url: 1 }, batchSize: 50 })
  try { for await (const user of avatars) if (user.avatar_url.startsWith('/api/v1/files/profile-avatars/')) await verifyFile('profile-avatars', user.avatar_url.slice('/api/v1/files/profile-avatars/'.length), user._id) }
  finally { await avatars.close() }
  const media = db.collection('MediaAsset').find({}, { projection: { source_path: 1, listing_id: 1 }, batchSize: 50 })
  try {
    for await (const asset of media) {
      const listing = await db.collection('Listing').findOne({ _id: asset.listing_id }, { projection: { lister_id: 1 } })
      if (!listing || typeof asset.source_path !== 'string') throw new BackupError('MEDIA_SOURCE_UNAVAILABLE')
      await verifyFile('listings-media', asset.source_path, listing.lister_id)
    }
  } finally { await media.close() }
  const captures = db.collection('ListingCapture').find({ state: 'sealed' }, { batchSize: 50 })
  try {
    for await (const capture of captures) {
      if (typeof capture.video_path !== 'string' || typeof capture.video_digest !== 'string') throw new BackupError('CAPTURE_VIDEO_UNAVAILABLE')
      const info = await verifyFile('listings-media', capture.video_path, capture.owner_id)
      if (info.digest !== capture.video_digest) throw new BackupError('CAPTURE_VIDEO_DIGEST_MISMATCH')
    }
  } finally { await captures.close() }
  return count
}

/** Restore ONLY into an owned fresh loopback namespace. The resulting database
 * remains deliberately unready and cannot be switched into service by this tool. */
export async function verifyOwnedRestore(input: { archive: string; key: Buffer; targetUri: string; configuredUri: string; owner: string; restoreRoot: string; workspaceRoot?: string; configuredStorageRoot?: string }): Promise<BackupSummary & { journals: number; storageClaims: number }> {
  if (!/^[a-f0-9]{32}$/.test(input.owner)) throw new BackupError('RESTORE_OWNER_REQUIRED')
  const targetUri = localMongoUrl(input.targetUri), configured = mongoUrl(input.configuredUri)
  if (targetUri === configured || localMongoDatabaseName(targetUri) === mongoDatabaseName(configured) || localMongoDatabaseName(targetUri) !== `rentral_restore_${input.owner}`) throw new BackupError('UNOWNED_OR_CONFIGURED_RESTORE_TARGET')
  const root = resolve(input.restoreRoot), workspace = resolve(input.workspaceRoot ?? process.cwd())
  const currentStorage = resolve(input.configuredStorageRoot ?? process.env.RENTRAL_STORAGE_DIR ?? 'storage')
  if (!pathWithin(workspace, root) || root === workspace || pathWithin(currentStorage, root) || pathWithin(root, currentStorage) || basename(root) !== `rentral-restore-${input.owner}`) throw new BackupError('UNOWNED_RESTORE_DIRECTORY')
  await assertNoSymlinks(dirname(root))
  return withVerifiedBackup(input.archive, input.key, async archive => {
  const summary = archive.summary
  const client = new MongoClient(targetUri, { maxPoolSize: 2, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 })
  const definitions: { name: string; indexes: Document[] }[] = []
  let currentFile: Awaited<ReturnType<typeof open>> | null = null
  let skipFile = false
  try {
    await client.connect()
    const db = client.db(localMongoDatabaseName(targetUri))
    if (await db.listCollections({}, { nameOnly: true }).hasNext()) throw new BackupError('RESTORE_DATABASE_NOT_EMPTY')
    await mkdir(root, { mode: 0o700 }); await writeFile(join(root, '.owner'), input.owner, { flag: 'wx', mode: 0o600 })
    const storage = join(root, 'storage'); await mkdir(storage, { mode: 0o700 })
    await db.collection<{ _id: string }>('_RestoreOwnership').insertOne({ _id: input.owner })
    const verification = db.collection<{ _id: string; status: string; [key: string]: unknown }>('_RestoreVerification')
    await verification.insertOne({ _id: input.owner, status: 'incomplete', providerMutationsAllowed: false, privacyReviewRequired: true })
    for await (const record of archive.records()) {
      if (record.type === 'header' && record.sourceDatabase === db.databaseName) throw new BackupError('SOURCE_DATABASE_IS_RESTORE_TARGET')
      if (record.type === 'collection') {
        if (['_RestoreOwnership', '_RestoreVerification', '_FixtureOwnership'].includes(record.name)) throw new BackupError('RESERVED_COLLECTION_IN_ARCHIVE')
        if (Object.keys(record.options).some(key => !['validator', 'validationLevel', 'validationAction', 'collation'].includes(key))) throw new BackupError('UNSUPPORTED_COLLECTION_OPTIONS')
        const options = BSON.EJSON.deserialize(record.options, { relaxed: false }) as CreateCollectionOptions
        await db.createCollection(record.name, options)
        definitions.push({ name: record.name, indexes: record.indexes })
      } else if (record.type === 'document') {
        // Never restore a runtime-ready marker, even briefly.
        if (record.collection !== MONGO_SETUP_COLLECTION) await db.collection(record.collection).insertOne(BSON.EJSON.deserialize(record.value, { relaxed: false }))
      } else if (record.type === 'file') {
        // Codes in the developer mailbox are revoked historical capabilities,
        // not uploaded evidence. Authenticate them, but never restore live copies.
        skipFile = safeBackupPath(record.path)[0] === 'mail-outbox'
        if (skipFile) continue
        const path = join(storage, ...safeBackupPath(record.path))
        if (!pathWithin(storage, path)) throw new BackupError('UNSAFE_ARCHIVE_PATH')
        await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await assertNoSymlinks(dirname(path))
        currentFile = await open(path, 'wx', 0o600)
      } else if (record.type === 'chunk') {
        if (skipFile) continue
        if (!currentFile) throw new BackupError('ORPHAN_FILE_CHUNK')
        const bytes = Buffer.from(record.data, 'base64'); let offset = 0
        while (offset < bytes.length) {
          const result = await currentFile.write(bytes, offset, bytes.length - offset, null)
          if (!result.bytesWritten) throw new BackupError('RESTORE_FILE_WRITE_FAILED')
          offset += result.bytesWritten
        }
      } else if (record.type === 'file-end') { await currentFile?.close(); currentFile = null; skipFile = false }
    }
    for (const definition of definitions) {
      for (const encoded of definition.indexes) {
        const index = BSON.EJSON.deserialize(encoded, { relaxed: false }) as Document
        if (index.name === '_id_') continue
        if (typeof index.name !== 'string' || !index.key || typeof index.key !== 'object' || Array.isArray(index.key)) throw new BackupError('INVALID_INDEX_SPECIFICATION')
        const spec = Object.fromEntries(Object.entries(index).filter(([key]) => key !== 'v' && key !== 'ns'))
        await db.collection(definition.name).createIndexes([spec as IndexDescription])
      }
    }
    const journals = await verifyJournals(db), storageClaims = await verifyStorageClaims(db, storage), now = new Date()
    // These are capability revocations in the new isolated target, never source writes.
    await db.collection('AuthSession').updateMany({}, { $set: { revoked_at: now, updatedAt: now } })
    await db.collection('PasswordReset').updateMany({}, { $set: { used_at: now } })
    await db.collection('EmailChange').updateMany({ status: 'pending' }, { $set: { status: 'cancelled', updatedAt: now } })
    await db.collection('AuthEmailDelivery').updateMany({}, { $set: { status: 'expired', encrypted_payload: null, lease_token: null, lease_expires_at: null, updatedAt: now } })
    await db.collection('PushDevice').updateMany({}, { $set: { status: 'revoked', token_ciphertext: null, token_iv: null, token_tag: null, revoked_at: now, updatedAt: now } })
    await db.collection('PushDelivery').updateMany({ status: { $in: ['pending', 'submitting', 'ticketed', 'uncertain'] } }, { $set: { status: 'skipped', claimed_at: null, next_check_at: null, error_code: 'RESTORE_QUARANTINE', updatedAt: now } })
    await db.collection('Notification').updateMany({}, { $set: { email_status: 'failed', email_error_code: 'RESTORE_QUARANTINE', email_claim_token: null, email_claimed_at: null } })
    await db.collection('User').updateMany({}, { $set: { password_hash: null, staff_role: null, analytics_consent: false, analytics_consent_at: now } })
    await db.collection('Listing').updateMany({}, { $set: { listing_status: 'suspended', archived_at: now, updatedAt: now } })
    await db.collection('MatchProfile').updateMany({}, { $set: { is_visible: false, updatedAt: now } })
    await db.collection('MatchConnection').updateMany({ status: { $in: ['requested', 'accepted'] } }, { $set: { status: 'closed', closed_at: now, last_activity_at: now } })
    await db.collection('InsightEntitlement').updateMany({ status: 'active' }, { $set: { status: 'revoked' } })
    await db.collection('SponsoredCampaign').updateMany({ status: { $in: ['draft', 'pending_review', 'approved'] } }, { $set: { status: 'paused', updatedAt: now } })
    await db.collection('FinancialOperation').updateMany({ status: { $in: ['requested', 'approved', 'submitting', 'pending', 'requires_action', 'uncertain'] } }, { $set: { status: 'uncertain', failure_code: 'RESTORE_RECONCILIATION_REQUIRED', lease_token: null, lease_expires_at: null, updatedAt: now } })
    await db.collection('PaymentIntent').updateMany({ status: { $in: ['created', 'initializing', 'pending', 'failed', 'abandoned'] } }, { $set: { status: 'uncertain', checkout_url: null, updatedAt: now } })
    await db.collection<{ _id: string; schemaVersion: number; restorationRequired: boolean; restoreOwner: string }>(MONGO_SETUP_COLLECTION).updateOne({ _id: MONGO_SETUP_ID }, { $set: { schemaVersion: 0, restorationRequired: true, restoreOwner: input.owner } }, { upsert: true })
    await verification.updateOne({ _id: input.owner }, { $set: { status: 'verified_quarantined', verifiedAt: now, ...summary, journals, storageClaims } })
    if (await readFile(join(root, '.owner'), 'utf8') !== input.owner) throw new BackupError('RESTORE_DIRECTORY_OWNER_CHANGED')
    return { ...summary, journals, storageClaims }
  } catch (error) {
    throw error instanceof BackupError ? error : new BackupError('ISOLATED_RESTORE_FAILED')
  } finally { await currentFile?.close().catch(() => undefined); await client.close() }
  })
}
