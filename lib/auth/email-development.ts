import { lstat, mkdir, open } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { authEmailPayloadSchema, type AuthEmailPayload } from './email-crypto'
import { AuthError } from './types'

/** Explicit development-only operator mailbox. Upload/file routes always deny this directory. */
export async function writeDevelopmentAuthEmail(payload: AuthEmailPayload): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.AUTH_DEV_EMAIL_OUTBOX !== 'true') throw new AuthError(503, 'RECOVERY_UNAVAILABLE', 'Development email delivery is disabled.')
  const checked = authEmailPayloadSchema.parse(payload)
  // Private operator files are runtime data, never production bundle inputs.
  const root = path.resolve(/* turbopackIgnore: true */ process.env.RENTRAL_STORAGE_DIR || path.join(process.cwd(), 'storage'))
  await mkdir(root, { recursive: true, mode: 0o700 })
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('PRIVATE_MAILBOX_UNAVAILABLE')
  const directory = path.join(root, 'mail-outbox')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('PRIVATE_MAILBOX_UNAVAILABLE')
  const file = await open(path.join(directory, `${randomUUID()}.txt`), 'wx', 0o600)
  try { await file.writeFile(`Rentral private development email\nEmail: ${checked.to}\nSubject: ${checked.subject}\n\n${checked.text}\n`, { encoding: 'utf8' }) }
  finally { await file.close() }
}
