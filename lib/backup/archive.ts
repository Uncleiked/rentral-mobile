import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { open, lstat, unlink, mkdir, mkdtemp, readFile, rm, writeFile, chmod, type FileHandle } from 'node:fs/promises'
import { Readable, Writable } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { createGzip, createGunzip } from 'node:zlib'
import { basename, join, parse, resolve, sep } from 'node:path'
import { z } from 'zod'

const MAGIC = Buffer.from('RENTRAL_BACKUP_V1\n'), NONCE_BYTES = 12, TAG_BYTES = 16
const MAX_RECORD_BYTES = 32 * 1024 * 1024
export const backupCollectionName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,119}$/)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const backupRecordSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('header'), format: z.literal('rentral-backup'), version: z.literal(1), id: z.string().uuid(), createdAt: z.string().datetime(), sourceDatabase: z.string().min(1).max(63), quiesced: z.literal(true) }).strict(),
  z.object({ type: z.literal('collection'), name: backupCollectionName, options: z.record(z.string(), z.unknown()), indexes: z.array(z.record(z.string(), z.unknown())).max(128) }).strict(),
  z.object({ type: z.literal('document'), collection: backupCollectionName, value: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ type: z.literal('file'), path: z.string().min(1).max(2000), size: safeInteger }).strict(),
  z.object({ type: z.literal('chunk'), data: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).max(90_000) }).strict(),
  z.object({ type: z.literal('file-end'), size: safeInteger, sha256: digest }).strict(),
  z.object({ type: z.literal('footer'), collections: safeInteger, documents: safeInteger, files: safeInteger, fileBytes: safeInteger, sha256: digest }).strict(),
])
export type BackupRecord = z.infer<typeof backupRecordSchema>
export type BackupSummary = { collections: number; documents: number; files: number; fileBytes: number }

export class BackupError extends Error {
  readonly code: string
  constructor(code: string) { super(`Backup operation stopped: ${code}`); this.name = 'BackupError'; this.code = code }
}
export function backupKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new BackupError('DEDICATED_32_BYTE_KEY_REQUIRED')
  const key = Buffer.from(value, 'base64url')
  if (key.length !== 32 || key.toString('base64url') !== value) throw new BackupError('DEDICATED_32_BYTE_KEY_REQUIRED')
  return key
}
export function safeBackupPath(value: string): string[] {
  const parts = value.split('/')
  if (value.length > 2000 || parts.some(part => !/^[A-Za-z0-9_.-]{1,255}$/.test(part) || part === '.' || part === '..' || part.includes('..') || part.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new BackupError('UNSAFE_ARCHIVE_PATH')
  return parts
}

/** AES-256-GCM authenticates the format header too. No plaintext archive is written. */
export async function writeEncryptedArchive(path: string, key: Buffer, records: AsyncIterable<BackupRecord>): Promise<void> {
  safeBackupPath(basename(path))
  if (key.length !== 32) throw new BackupError('DEDICATED_32_BYTE_KEY_REQUIRED')
  const nonce = randomBytes(NONCE_BYTES), header = Buffer.concat([MAGIC, nonce])
  const output = createWriteStream(path, { flags: 'wx', mode: 0o600 })
  let owned = false
  try {
    await new Promise<void>((resolve, reject) => { output.once('open', () => { owned = true; resolve() }); output.once('error', reject) })
    output.write(header)
    const cipher = createCipheriv('aes-256-gcm', key, nonce); cipher.setAAD(header)
    const source = Readable.from((async function* () {
      for await (const record of records) {
        const line = Buffer.from(`${JSON.stringify(backupRecordSchema.parse(record))}\n`)
        if (line.length > MAX_RECORD_BYTES) throw new BackupError('RECORD_TOO_LARGE')
        yield line
      }
    })())
    await pipeline(source, createGzip(), cipher, output, { end: false })
    output.end(cipher.getAuthTag()); await finished(output)
  } catch {
    output.destroy()
    await finished(output).catch(() => undefined)
    if (owned) await unlink(path).catch(() => undefined)
    throw new BackupError('ARCHIVE_WRITE_FAILED')
  }
}

type CipherSnapshot = { handle: FileHandle; size: number; directory: string; owner: string }

async function* fileChunks(handle: FileHandle, start: number, end: number): AsyncGenerator<Buffer> {
  let position = start
  while (position < end) {
    const bytes = Buffer.allocUnsafe(Math.min(64 * 1024, end - position)), read = await handle.read(bytes, 0, bytes.length, position)
    if (!read.bytesRead) throw new BackupError('TRUNCATED_ARCHIVE')
    position += read.bytesRead; yield bytes.subarray(0, read.bytesRead)
  }
}
async function privateRoot(): Promise<string> {
  const root = resolve('test-results')
  await mkdir(root, { recursive: true, mode: 0o700 })
  let cursor = parse(root).root
  for (const part of root.slice(cursor.length).split(sep).filter(Boolean)) { cursor = join(cursor, part); if ((await lstat(cursor)).isSymbolicLink()) throw new BackupError('PRIVATE_SNAPSHOT_DIRECTORY_REQUIRED') }
  return root
}
async function snapshotCiphertext(path: string): Promise<CipherSnapshot> {
  if ((await lstat(path)).isSymbolicLink()) throw new BackupError('INVALID_ARCHIVE')
  const source = await open(path, 'r'), owner = randomUUID()
  let directory: string | undefined, writer: FileHandle | undefined
  try {
    const stat = await source.stat()
    if (!stat.isFile() || stat.size < MAGIC.length + NONCE_BYTES + TAG_BYTES) throw new BackupError('INVALID_ARCHIVE')
    directory = await mkdtemp(join(await privateRoot(), 'rentral-ciphertext-'))
    await writeFile(join(directory, '.owner'), owner, { flag: 'wx', mode: 0o600 })
    const copy = join(directory, 'snapshot.cipher'); writer = await open(copy, 'wx', 0o600)
    for await (const bytes of fileChunks(source, 0, stat.size)) {
      let offset = 0
      while (offset < bytes.length) { const written = await writer.write(bytes, offset, bytes.length - offset, null); if (!written.bytesWritten) throw new BackupError('CIPHERTEXT_SNAPSHOT_FAILED'); offset += written.bytesWritten }
    }
    await writer.sync(); await writer.close(); writer = undefined
    await chmod(copy, 0o400)
    // All subsequent authentication, decompression and restoration passes use
    // this held descriptor, never the caller-controlled source path again.
    return { handle: await open(copy, 'r'), size: stat.size, directory, owner }
  } catch (error) {
    await writer?.close().catch(() => undefined)
    if (directory) await removeSnapshotDirectory(directory, owner)
    throw error instanceof BackupError ? error : new BackupError('CIPHERTEXT_SNAPSHOT_FAILED')
  } finally { await source.close() }
}
async function removeSnapshotDirectory(directory: string, owner: string): Promise<void> {
  const root = resolve('test-results')
  if (!resolve(directory).startsWith(`${root}${sep}`) || !basename(directory).startsWith('rentral-ciphertext-') || (await lstat(directory)).isSymbolicLink() || await readFile(join(directory, '.owner'), 'utf8') !== owner) throw new BackupError('CIPHERTEXT_SNAPSHOT_OWNERSHIP_FAILED')
  await rm(directory, { recursive: true, force: true })
}
async function closeSnapshot(snapshot: CipherSnapshot): Promise<void> { await snapshot.handle.close(); await removeSnapshotDirectory(snapshot.directory, snapshot.owner) }
async function decoder(snapshot: CipherSnapshot, key: Buffer) {
  const header = Buffer.alloc(MAGIC.length + NONCE_BYTES), tag = Buffer.alloc(TAG_BYTES)
  await snapshot.handle.read(header, 0, header.length, 0); await snapshot.handle.read(tag, 0, tag.length, snapshot.size - TAG_BYTES)
  if (!header.subarray(0, MAGIC.length).equals(MAGIC) || key.length !== 32) throw new BackupError('INVALID_ARCHIVE')
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length)); decipher.setAAD(header); decipher.setAuthTag(tag)
  return { decipher, source: Readable.from(fileChunks(snapshot.handle, header.length, snapshot.size - TAG_BYTES)) }
}
async function authenticateSnapshot(snapshot: CipherSnapshot, key: Buffer): Promise<void> {
  try { const { source, decipher } = await decoder(snapshot, key); await pipeline(source, decipher, new Writable({ write(_chunk, _encoding, callback) { callback() } })) }
  catch { throw new BackupError('ARCHIVE_AUTHENTICATION_OR_FORMAT_FAILED') }
}
async function* snapshotRecords(snapshot: CipherSnapshot, key: Buffer): AsyncGenerator<BackupRecord> {
  try {
    const { source, decipher } = await decoder(snapshot, key)
    const plain = createGunzip(), completion = pipeline(source, decipher, plain).catch(error => { plain.destroy(error); throw error })
    // Attach immediately: a wrong key must not become an unhandled rejection while iterating.
    void completion.catch(() => undefined)
    let pending: Buffer[] = [], pendingBytes = 0
    try {
      for await (const chunk of plain) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        let start = 0, newline: number
        while ((newline = bytes.indexOf(10, start)) >= 0) {
          const piece = bytes.subarray(start, newline); pending.push(piece); pendingBytes += piece.length
          if (pendingBytes > MAX_RECORD_BYTES) throw new BackupError('RECORD_TOO_LARGE')
          const line = Buffer.concat(pending, pendingBytes); pending = []; pendingBytes = 0; start = newline + 1
          yield backupRecordSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)))
        }
        if (start < bytes.length) { const piece = bytes.subarray(start); pending.push(piece); pendingBytes += piece.length }
        if (pendingBytes > MAX_RECORD_BYTES) throw new BackupError('RECORD_TOO_LARGE')
      }
      await completion
      if (pendingBytes) throw new BackupError('TRUNCATED_RECORD')
    } finally { source.destroy(); plain.destroy(); await completion.catch(() => undefined) }
  } catch { throw new BackupError('ARCHIVE_AUTHENTICATION_OR_FORMAT_FAILED') }
}

async function verifyRecords(records: AsyncIterable<BackupRecord>): Promise<BackupSummary> {
  const hash = createHash('sha256'), collections = new Set<string>(), paths = new Set<string>(), directories = new Set<string>()
  let header = false, footer = false, documents = 0, files = 0, fileBytes = 0
  let file: { size: number; seen: number; hash: ReturnType<typeof createHash> } | null = null
  for await (const record of records) {
    if (footer || (!header && record.type !== 'header')) throw new BackupError('INVALID_RECORD_ORDER')
    if (record.type === 'footer') {
      if (file || record.sha256 !== hash.digest('hex') || record.collections !== collections.size || record.documents !== documents || record.files !== files || record.fileBytes !== fileBytes) throw new BackupError('MANIFEST_INTEGRITY_FAILED')
      footer = true; continue
    }
    hash.update(`${JSON.stringify(record)}\n`)
    if (file && !['chunk', 'file-end'].includes(record.type)) throw new BackupError('INVALID_FILE_ORDER')
    if (record.type === 'header') { if (header) throw new BackupError('DUPLICATE_HEADER'); header = true }
    else if (record.type === 'collection') { if (file || collections.has(record.name) || ['_FixtureOwnership', '_RestoreOwnership', '_RestoreVerification'].includes(record.name)) throw new BackupError('DUPLICATE_OR_RESERVED_COLLECTION'); collections.add(record.name) }
    else if (record.type === 'document') { if (!collections.has(record.collection) || !Object.hasOwn(record.value, '_id')) throw new BackupError('UNDECLARED_COLLECTION'); documents += 1 }
    else if (record.type === 'file') {
      const parts = safeBackupPath(record.path)
      const identity = record.path.toLowerCase()
      if (paths.has(identity) || directories.has(identity)) throw new BackupError('DUPLICATE_FILE_PATH')
      if (paths.size >= 100000) throw new BackupError('FILE_COUNT_LIMIT_EXCEEDED')
      for (let length = 1; length < parts.length; length += 1) {
        const parent = parts.slice(0, length).join('/').toLowerCase()
        if (paths.has(parent)) throw new BackupError('DUPLICATE_FILE_PATH')
        directories.add(parent)
      }
      paths.add(identity); file = { size: record.size, seen: 0, hash: createHash('sha256') }
    } else if (record.type === 'chunk') {
      if (!file) throw new BackupError('ORPHAN_FILE_CHUNK')
      const chunk = Buffer.from(record.data, 'base64'); file.seen += chunk.length; file.hash.update(chunk)
      if (file.seen > file.size) throw new BackupError('FILE_SIZE_MISMATCH')
    } else if (record.type === 'file-end') {
      if (!file || file.seen !== file.size || record.size !== file.size || record.sha256 !== file.hash.digest('hex')) throw new BackupError('FILE_INTEGRITY_FAILED')
      files += 1; fileBytes += file.seen; file = null
    }
  }
  if (!header || !footer || file) throw new BackupError('MISSING_COMPLETE_MANIFEST')
  return { collections: collections.size, documents, files, fileBytes }
}

/** One private ciphertext copy and held descriptor across ALL passes. No
 * caller-controlled path is reopened after authentication or manifest checks. */
export async function withVerifiedBackup<T>(path: string, key: Buffer, operation: (archive: { summary: BackupSummary; records: () => AsyncGenerator<BackupRecord> }) => Promise<T>): Promise<T> {
  const snapshot = await snapshotCiphertext(path)
  try {
    await authenticateSnapshot(snapshot, key)
    const summary = await verifyRecords(snapshotRecords(snapshot, key))
    return await operation({ summary, records: () => snapshotRecords(snapshot, key) })
  } finally { await closeSnapshot(snapshot) }
}
export async function verifyEncryptedArchive(path: string, key: Buffer): Promise<BackupSummary> {
  return withVerifiedBackup(path, key, async archive => archive.summary)
}
