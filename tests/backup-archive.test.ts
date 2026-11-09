import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { renameSync, writeFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type { MongoClient } from 'mongodb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const inflate = vi.hoisted(() => ({ before: null as (() => void) | null, calls: 0 }))
vi.mock('node:zlib', async original => {
  const zlib = await original<typeof import('node:zlib')>()
  return { ...zlib, createGunzip: (...args: Parameters<typeof zlib.createGunzip>) => { inflate.calls += 1; inflate.before?.(); return zlib.createGunzip(...args) } }
})
import { backupKey, backupRecordSchema, verifyEncryptedArchive, withVerifiedBackup, writeEncryptedArchive, type BackupRecord } from '@/lib/backup/archive'
import { captureBackup } from '@/lib/backup/capture'
import { verifyOwnedRestore } from '@/lib/backup/restore'

const key = Buffer.alloc(32, 42), secret = 'PRIVATE_BACKUP_CONTENT_MUST_NEVER_APPEAR_PLAINTEXT'
let root: string
beforeEach(async () => { inflate.before = null; inflate.calls = 0; await mkdir(resolve('test-results'), { recursive: true }); root = await mkdtemp(join(resolve('test-results'), 'owned-backup-unit-')) })
afterEach(async () => { if (!resolve(root).startsWith(`${resolve('test-results')}${sep}`) || !root.includes('owned-backup-unit-')) throw new Error('Unsafe backup fixture cleanup.'); await rm(root, { recursive: true, force: true }) })
function archiveRecords(extra: BackupRecord[] = []): BackupRecord[] {
  const records = [
    { type: 'header', format: 'rentral-backup', version: 1, id: randomUUID(), createdAt: new Date().toISOString(), sourceDatabase: 'rentral_test_owned', quiesced: true },
    { type: 'collection', name: 'PrivateFixture', options: {}, indexes: [] },
    { type: 'document', collection: 'PrivateFixture', value: { _id: randomUUID(), private: secret } }, ...extra,
  ].map(value => backupRecordSchema.parse(value))
  const hash = createHash('sha256'); records.forEach(record => hash.update(`${JSON.stringify(record)}\n`))
  return [...records, { type: 'footer', collections: 1, documents: 1, files: extra.filter(record => record.type === 'file').length, fileBytes: extra.reduce((sum, record) => sum + (record.type === 'file' ? record.size : 0), 0), sha256: hash.digest('hex') }]
}
async function* iterable(records: BackupRecord[]) { yield* records }
describe('encrypted backup format and restore boundary', () => {
  it('uses a dedicated exact key and authenticates a complete bounded manifest without plaintext artifacts', async () => {
    expect(backupKey(key.toString('base64url'))).toEqual(key)
    for (const value of [undefined, 'short', 'A'.repeat(44)]) expect(() => backupKey(value)).toThrow()
    const path = join(root, 'snapshot.rentral')
    await writeEncryptedArchive(path, key, iterable(archiveRecords()))
    expect((await readFile(path)).includes(Buffer.from(secret))).toBe(false)
    expect(await verifyEncryptedArchive(path, key)).toEqual({ collections: 1, documents: 1, files: 0, fileBytes: 0 })
  })
  it('preserves binary chunks and hashed deletion tombstones', async () => {
    const body = Buffer.from([0, 1, 2, 255]), digest = createHash('sha256').update(body).digest('hex')
    const path = join(root, 'files.rentral')
    await writeEncryptedArchive(path, key, iterable(archiveRecords([{ type: 'file', path: '.deleted/abcdef1234', size: 4 }, { type: 'chunk', data: body.toString('base64') }, { type: 'file-end', size: 4, sha256: digest }])))
    expect(await verifyEncryptedArchive(path, key)).toMatchObject({ files: 1, fileBytes: 4 })
  })
  it('rejects modified, truncated and wrong-key archives', async () => {
    const path = join(root, 'snapshot.rentral'); await writeEncryptedArchive(path, key, iterable(archiveRecords()))
    await expect(verifyEncryptedArchive(path, Buffer.alloc(32, 41))).rejects.toThrow()
    const bytes = await readFile(path), changed = Buffer.from(bytes); changed[Math.floor(changed.length / 2)] ^= 1
    await writeFile(join(root, 'modified.rentral'), changed); await writeFile(join(root, 'truncated.rentral'), bytes.subarray(0, bytes.length - 1))
    await expect(verifyEncryptedArchive(join(root, 'modified.rentral'), key)).rejects.toThrow()
    await expect(verifyEncryptedArchive(join(root, 'truncated.rentral'), key)).rejects.toThrow()
  })
  it('decodes only the authenticated private descriptor when the original path is replaced at the authentication/decompression boundary', async () => {
    const path = join(root, 'snapshot.rentral'), replacement = join(root, 'replacement.rentral')
    await writeEncryptedArchive(path, key, iterable(archiveRecords())); await writeFile(replacement, 'unauthenticated replacement')
    let replaced = false
    inflate.before = () => { if (!replaced) { renameSync(replacement, path); replaced = true } }
    expect(await verifyEncryptedArchive(path, key)).toMatchObject({ documents: 1 })
    expect(replaced).toBe(true); expect(inflate.calls).toBe(1)
    inflate.before = null
    await expect(verifyEncryptedArchive(path, key)).rejects.toThrow()
    expect(inflate.calls).toBe(1) // Invalid ciphertext never reaches gzip.
  })
  it('keeps the same authenticated copy between manifest preflight and restoration reads despite in-place source tampering', async () => {
    const path = join(root, 'snapshot.rentral'); await writeEncryptedArchive(path, key, iterable(archiveRecords()))
    await withVerifiedBackup(path, key, async archive => {
      writeFileSync(path, Buffer.alloc(256, 0))
      const records: BackupRecord[] = []
      for await (const record of archive.records()) records.push(record)
      expect(records.find(record => record.type === 'document')).toMatchObject({ value: { private: secret } })
      expect(archive.summary.documents).toBe(1)
    })
    expect(inflate.calls).toBe(2)
    await expect(verifyEncryptedArchive(path, key)).rejects.toThrow()
    expect(inflate.calls).toBe(2)
  })
  it.each(['../escape', 'folder/../../escape', 'C:/escape', 'folder\\escape', 'aux.txt', '/absolute'])('rejects authenticated traversal or device paths: %s', async path => {
    const archive = join(root, 'unsafe.rentral'), empty = createHash('sha256').digest('hex')
    await writeEncryptedArchive(archive, key, iterable(archiveRecords([{ type: 'file', path, size: 0 }, { type: 'file-end', size: 0, sha256: empty }])))
    await expect(verifyEncryptedArchive(archive, key)).rejects.toThrow()
  })
  it('does not overwrite an existing recovery set or accept a forged footer', async () => {
    const path = join(root, 'existing.rentral'); await writeFile(path, 'preserve-existing')
    await expect(writeEncryptedArchive(path, key, iterable(archiveRecords()))).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('preserve-existing')
    const records = archiveRecords(), last = records.at(-1)!
    if (last.type !== 'footer') throw new Error('Invalid test fixture')
    last.documents += 1
    await writeEncryptedArchive(join(root, 'forged.rentral'), key, iterable(records))
    await expect(verifyEncryptedArchive(join(root, 'forged.rentral'), key)).rejects.toThrow()
  })
  it('rejects file/directory aliases in an authenticated archive and reads a record spanning many stream chunks', async () => {
    const empty = createHash('sha256').digest('hex'), path = join(root, 'aliases.rentral')
    await writeEncryptedArchive(path, key, iterable(archiveRecords([
      { type: 'file', path: 'folder', size: 0 }, { type: 'file-end', size: 0, sha256: empty },
      { type: 'file', path: 'folder/child', size: 0 }, { type: 'file-end', size: 0, sha256: empty },
    ])))
    await expect(verifyEncryptedArchive(path, key)).rejects.toMatchObject({ code: 'DUPLICATE_FILE_PATH' })
    const records = archiveRecords(), document = records.find(record => record.type === 'document')!
    if (document.type !== 'document') throw new Error('Invalid fixture')
    document.value.large = 'large-owned-record-'.repeat(30000)
    const withoutFooter = records.slice(0, -1), digest = createHash('sha256'); withoutFooter.forEach(record => digest.update(`${JSON.stringify(record)}\n`))
    const footer = records.at(-1)!
    if (footer.type !== 'footer') throw new Error('Invalid fixture')
    footer.sha256 = digest.digest('hex')
    await writeEncryptedArchive(join(root, 'large.rentral'), key, iterable(records))
    expect(await verifyEncryptedArchive(join(root, 'large.rentral'), key)).toMatchObject({ documents: 1 })
  })
  it('requires drained-writer acknowledgement and refuses output inside private storage before database access', async () => {
    const input = { client: {} as MongoClient, databaseName: 'fixture', storageRoot: root, output: join(root, 'backup.rentral'), key, acknowledgeQuiesced: false }
    await expect(captureBackup(input)).rejects.toMatchObject({ code: 'QUIESCED_WRITES_ACKNOWLEDGEMENT_REQUIRED' })
    await expect(captureBackup({ ...input, acknowledgeQuiesced: true })).rejects.toMatchObject({ code: 'OUTPUT_INSIDE_STORAGE' })
  })
  it('refuses remote/configured/unowned restore targets before any connection or artifact read', async () => {
    const owner = 'a'.repeat(32), local = `mongodb://127.0.0.1:27017/rentral_restore_${owner}`
    const input = { archive: join(root, 'absent'), key, targetUri: local, configuredUri: local, owner, restoreRoot: join(root, `rentral-restore-${owner}`) }
    await expect(verifyOwnedRestore(input)).rejects.toMatchObject({ code: 'UNOWNED_OR_CONFIGURED_RESTORE_TARGET' })
    await expect(verifyOwnedRestore({ ...input, targetUri: 'mongodb://127.0.0.1:27017/production', configuredUri: 'mongodb://127.0.0.1:27017/current' })).rejects.toThrow()
    await expect(verifyOwnedRestore({ ...input, targetUri: 'mongodb://remote.invalid/private', configuredUri: local })).rejects.toThrow()
  })
  it('rejects a symlinked storage root without following it', async () => {
    const actual = join(root, 'actual'), linked = join(root, 'link'); await mkdir(actual); await symlink(actual, linked, 'junction')
    await expect(captureBackup({ client: {} as MongoClient, databaseName: 'fixture', storageRoot: linked, output: join(root, 'outside.rentral'), key, acknowledgeQuiesced: true })).rejects.toMatchObject({ code: 'SYMLINK_NOT_ALLOWED' })
  })
  it('runs the operator CLI using Node type stripping and rejects incomplete instructions without a database connection', () => {
    let stderr = ''
    try {
      execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/backup.ts', 'verify-restore'], { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe', env: { ...process.env,
        MONGODB_URL: 'mongodb://127.0.0.1:1/owned_script_no_connection', DATABASE_URL: 'mongodb://127.0.0.1:1/owned_script_no_connection', BACKUP_ENCRYPTION_KEY: key.toString('base64url'), RENTRAL_RESTORE_URL: '',
      } })
    } catch (error) { stderr = String((error as Error & { stderr?: string }).stderr ?? '') }
    expect(stderr).toContain('OWNED_RESTORE_ARGUMENTS_REQUIRED')
    expect(stderr).not.toMatch(/ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX/)
  })
})
