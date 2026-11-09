import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, opendir } from 'node:fs/promises'
import { parse, relative, resolve, sep } from 'node:path'
import { BSON, type CollectionInfo, type Db, type MongoClient } from 'mongodb'
import { backupCollectionName, backupRecordSchema, BackupError, safeBackupPath, writeEncryptedArchive, type BackupRecord } from './archive.ts'

export async function assertNoSymlinks(path: string): Promise<void> {
  const absolute = resolve(path), root = parse(absolute).root
  let cursor = root
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part)
    if ((await lstat(cursor)).isSymbolicLink()) throw new BackupError('SYMLINK_NOT_ALLOWED')
  }
}
export function pathWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !parse(rel).root)
}

async function* snapshotRecords(client: MongoClient, db: Db, storageRoot: string): AsyncGenerator<BackupRecord> {
  const hash = createHash('sha256'), summary = { collections: 0, documents: 0, files: 0, fileBytes: 0 }
  const track = (value: BackupRecord): BackupRecord => { const record = backupRecordSchema.parse(value); hash.update(`${JSON.stringify(record)}\n`); return record }
  yield track({ type: 'header', format: 'rentral-backup', version: 1, id: randomUUID(), createdAt: new Date().toISOString(), sourceDatabase: db.databaseName, quiesced: true })
  const definitions: CollectionInfo[] = [], definitionCursor = db.listCollections({}, { nameOnly: false })
  try { for await (const item of definitionCursor) { definitions.push(item); if (definitions.length > 500) throw new BackupError('COLLECTION_LIMIT_EXCEEDED') } }
  finally { await definitionCursor.close() }
  const collections = definitions.filter(item => !item.name.startsWith('system.') && !['_FixtureOwnership', '_RestoreOwnership', '_RestoreVerification'].includes(item.name))
  const session = client.startSession()
  session.startTransaction({ readConcern: { level: 'snapshot' }, readPreference: 'primary' })
  try {
    for (const definition of collections.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = backupCollectionName.parse(definition.name), options = definition.options ?? {}
      if (definition.type !== 'collection' || options.capped || options.timeseries || options.encryptedFields || options.clusteredIndex) throw new BackupError('UNSUPPORTED_COLLECTION_LAYOUT')
      const indexes = await db.collection(name).listIndexes().toArray()
      const savedOptions = Object.fromEntries(['validator', 'validationLevel', 'validationAction', 'collation'].filter(key => Object.hasOwn(options, key)).map(key => [key, BSON.EJSON.serialize(options[key], { relaxed: false })]))
      yield track({ type: 'collection', name, options: savedOptions, indexes: indexes.map(index => BSON.EJSON.serialize(index, { relaxed: false })) })
      summary.collections += 1
      const cursor = db.collection(name).find({}, { session, batchSize: 100, sort: { _id: 1 } })
      try {
        for await (const value of cursor) {
          yield track({ type: 'document', collection: name, value: BSON.EJSON.serialize(value, { relaxed: false }) }); summary.documents += 1
        }
      } finally { await cursor.close() }
    }
    await session.commitTransaction()
  } catch (error) { await session.abortTransaction().catch(() => undefined); throw error }
  finally { await session.endSession() }

  const observed: { path: string; size: number; mtimeMs: number; ino: number; directory: boolean }[] = []
  async function* files(directory: string): AsyncGenerator<BackupRecord> {
    const directoryStat = await lstat(directory)
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) throw new BackupError('UNSAFE_STORAGE_TREE')
    observed.push({ path: directory, size: directoryStat.size, mtimeMs: directoryStat.mtimeMs, ino: directoryStat.ino, directory: true })
    if (observed.length > 200000) throw new BackupError('FILE_COUNT_LIMIT_EXCEEDED')
    for await (const entry of await opendir(directory)) {
      const name = entry.name
      const path = resolve(directory, name), stat = await lstat(path)
      if (!pathWithin(storageRoot, path) || stat.isSymbolicLink()) throw new BackupError('UNSAFE_STORAGE_TREE')
      if (stat.isDirectory()) { yield* files(path); continue }
      if (!stat.isFile() || stat.nlink !== 1 || !Number.isSafeInteger(stat.size)) throw new BackupError('UNSAFE_STORAGE_FILE')
      const archivePath = relative(storageRoot, path).split(sep).join('/'); safeBackupPath(archivePath)
      yield track({ type: 'file', path: archivePath, size: stat.size })
      const digest = createHash('sha256'); let size = 0
      const reader = createReadStream(path, { highWaterMark: 64 * 1024 })
      try { for await (const bytes of reader) { const chunk = Buffer.from(bytes); size += chunk.length; digest.update(chunk); yield track({ type: 'chunk', data: chunk.toString('base64') }) } }
      finally { reader.destroy() }
      if (size !== stat.size) throw new BackupError('WRITES_NOT_QUIESCED')
      yield track({ type: 'file-end', size, sha256: digest.digest('hex') }); summary.files += 1; summary.fileBytes += size
      if (summary.files > 100000 || !Number.isSafeInteger(summary.fileBytes)) throw new BackupError('FILE_COUNT_LIMIT_EXCEEDED')
      observed.push({ path, size, mtimeMs: stat.mtimeMs, ino: stat.ino, directory: false })
    }
  }
  yield* files(storageRoot)
  for (const entry of observed) {
    const current = await lstat(entry.path)
    if (current.isSymbolicLink() || current.ino !== entry.ino || current.mtimeMs !== entry.mtimeMs || current.isDirectory() !== entry.directory || (!entry.directory && current.size !== entry.size)) throw new BackupError('WRITES_NOT_QUIESCED')
  }
  yield { type: 'footer', ...summary, sha256: hash.digest('hex') }
}

/** Read-only database capture. The operator must first drain/stop all app,
 * worker and filesystem writers; this function never stops live services. */
export async function captureBackup(input: { client: MongoClient; databaseName: string; storageRoot: string; output: string; key: Buffer; acknowledgeQuiesced: boolean }): Promise<void> {
  if (input.acknowledgeQuiesced !== true) throw new BackupError('QUIESCED_WRITES_ACKNOWLEDGEMENT_REQUIRED')
  const root = resolve(input.storageRoot), output = resolve(input.output)
  if (pathWithin(root, output)) throw new BackupError('OUTPUT_INSIDE_STORAGE')
  await assertNoSymlinks(root); await assertNoSymlinks(resolve(output, '..'))
  if (!(await lstat(root)).isDirectory()) throw new BackupError('STORAGE_DIRECTORY_REQUIRED')
  // Preserve BSON Long/Int32/Double distinctions; ordinary driver reads can
  // promote small int64 money to a JS number and make a restore violate validators.
  await writeEncryptedArchive(output, input.key, snapshotRecords(input.client, input.client.db(input.databaseName, { promoteLongs: false, promoteValues: false }), root))
}
