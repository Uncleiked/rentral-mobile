import { config } from 'dotenv'
import { MongoClient } from 'mongodb'
import { resolve } from 'node:path'
import { backupKey, BackupError, verifyEncryptedArchive } from '../lib/backup/archive.ts'
import { captureBackup } from '../lib/backup/capture.ts'
import { verifyOwnedRestore } from '../lib/backup/restore.ts'
import { mongoDatabaseName, mongoUrl, localMongoUrl } from '../lib/database/config.ts'

config({ path: '.env.local', quiet: true }); config({ quiet: true })
const args = process.argv.slice(2), command = args.shift()
const allowed = new Set(['--output', '--archive', '--owner', '--restore-root', '--allow-remote', '--acknowledge-quiesced-writes'])
function option(name: string): string | undefined { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
let client: MongoClient | undefined
try {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!allowed.has(arg) || args.indexOf(arg) !== i) throw new BackupError('INVALID_ARGUMENTS')
    if (!['--allow-remote', '--acknowledge-quiesced-writes'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new BackupError('INVALID_ARGUMENTS')
      i += 1
    }
  }
  const key = backupKey(process.env.BACKUP_ENCRYPTION_KEY)
  if (command === 'capture') {
    if (!args.includes('--acknowledge-quiesced-writes')) throw new BackupError('QUIESCED_WRITES_ACKNOWLEDGEMENT_REQUIRED')
    const output = option('--output')
    if (!output || args.includes('--archive') || args.includes('--owner') || args.includes('--restore-root')) throw new BackupError('OUTPUT_REQUIRED')
    const uri = (args.includes('--allow-remote') ? mongoUrl : localMongoUrl)(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
    client = new MongoClient(uri, { maxPoolSize: 2, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 })
    await client.connect()
    await captureBackup({ client, databaseName: mongoDatabaseName(uri), storageRoot: resolve(process.env.RENTRAL_STORAGE_DIR || 'storage'), output: resolve(output), key, acknowledgeQuiesced: args.includes('--acknowledge-quiesced-writes') })
    const result = await verifyEncryptedArchive(resolve(output), key)
    console.log(`Encrypted backup authenticated: ${result.collections} collections, ${result.documents} records and ${result.files} files. No retention deletion was performed.`)
  } else if (command === 'verify-restore') {
    const archive = option('--archive'), owner = option('--owner'), restoreRoot = option('--restore-root')
    const targetUri = process.env.RENTRAL_RESTORE_URL, configuredUri = process.env.MONGODB_URL ?? process.env.DATABASE_URL
    if (!archive || !owner || !restoreRoot || !targetUri || !configuredUri || args.includes('--allow-remote') || args.includes('--output')) throw new BackupError('OWNED_RESTORE_ARGUMENTS_REQUIRED')
    const result = await verifyOwnedRestore({ archive: resolve(archive), key, targetUri, configuredUri, owner, restoreRoot: resolve(restoreRoot) })
    console.log(`Isolated restore verified and quarantined: ${result.documents} records, ${result.files} files, ${result.journals} balanced journals and ${result.storageClaims} verified storage claims. It is NOT approved for application use.`)
  } else throw new BackupError('CHOOSE_CAPTURE_OR_VERIFY_RESTORE')
} catch (error) {
  console.error('[backup]', error instanceof BackupError ? error.code : error instanceof Error ? error.name : 'OPERATION_FAILED')
  process.exitCode = 1
} finally { await client?.close() }
