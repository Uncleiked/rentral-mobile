import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstat, mkdir, readFile, rm } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'

// This wrapper never reads the configured application URI or prints secrets.
// The child reads private env only to refuse its configured database as target.
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--archive') {
  console.error('Usage: npm run backup:verify -- --archive PATH'); process.exit(1)
}
const archive = resolve(args[1]), owner = randomBytes(16).toString('hex')
const container = `rentral-backup-verify-${owner.slice(0, 12)}`, label = 'rentral.backup.verify.owner'
const artifacts = resolve('test-results'), restoreRoot = join(artifacts, `rentral-restore-${owner}`)
let created = false
function docker(arguments_, required = true) {
  const result = spawnSync('docker', arguments_, { encoding: 'utf8', windowsHide: true, timeout: 180000 })
  if (required && result.status !== 0) throw new Error('OWNED_DOCKER_COMMAND_FAILED')
  return result.status === 0 ? result.stdout.trim() : null
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (docker(['exec', container, 'mongosh', 'mongodb://localhost:27017/admin?directConnection=true', '--quiet', '--eval', expression], false) === '1') return
    await new Promise(resolveWait => setTimeout(resolveWait, 500))
  }
  throw new Error('OWNED_REPLICA_NOT_READY')
}
try {
  const source = await lstat(archive)
  if (!source.isFile() || source.isSymbolicLink()) throw new Error('REGULAR_ARCHIVE_REQUIRED')
  await mkdir(artifacts, { recursive: true })
  if ((await lstat(artifacts)).isSymbolicLink()) throw new Error('PRIVATE_ARTIFACT_DIRECTORY_REQUIRED')
  console.log('Provisioning a disposable, owned loopback restore verifier. The source archive is preserved.')
  docker(['run', '--detach', '--rm', '--name', container, '--label', `${label}=${owner}`, '--publish', '127.0.0.1::27017', 'mongo:8.0', '--replSet', 'rs0', '--bind_ip_all']); created = true
  await waitFor('db.adminCommand({ping:1}).ok')
  docker(['exec', container, 'mongosh', 'mongodb://localhost:27017/admin?directConnection=true', '--quiet', '--eval', "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"])
  await waitFor('db.adminCommand({hello:1}).isWritablePrimary ? 1 : 0')
  const port = /^127\.0\.0\.1:(\d+)$/.exec(docker(['port', container, '27017/tcp']) ?? '')?.[1]
  if (!port) throw new Error('LOOPBACK_BINDING_REQUIRED')
  const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/backup.ts', 'verify-restore', '--archive', archive, '--owner', owner, '--restore-root', restoreRoot], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, RENTRAL_RESTORE_URL: `mongodb://127.0.0.1:${port}/rentral_restore_${owner}?replicaSet=rs0&directConnection=true`,
      PAYMENTS_ENABLED: 'false', SETTLEMENT_ENABLED: 'false', PAYSTACK_TRANSFERS_ENABLED: 'false', PAYSTACK_REFUNDS_ENABLED: 'false', COMMERCIAL_ENABLED: 'false', AUTH_EMAIL_ENABLED: 'false', NOTIFICATION_EMAIL_ENABLED: 'false', LIFECYCLE_WORKER_ENABLED: 'false', PUSH_NOTIFICATIONS_ENABLED: 'false', MUX_ENABLED: 'false', MEDIA_WORKER_ENABLED: 'false' },
  })
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error('[backup/verify]', error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'VERIFICATION_FAILED')
  process.exitCode = 1
} finally {
  let restoreExists = false
  try {
    await lstat(restoreRoot); restoreExists = true
  } catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') { console.error('[backup/verify] Restore directory inspection failed.'); process.exitCode = 1 } }
  if (restoreExists) {
    try {
      const stat = await lstat(restoreRoot)
      if (!restoreRoot.startsWith(`${artifacts}${sep}`) || basename(restoreRoot) !== `rentral-restore-${owner}` || stat.isSymbolicLink() || !stat.isDirectory() || await readFile(join(restoreRoot, '.owner'), 'utf8') !== owner) throw new Error('RESTORE_DIRECTORY_OWNERSHIP_FAILED')
      await rm(restoreRoot, { recursive: true, force: true })
    } catch { console.error('[backup/verify] Restore directory ownership could not be verified; left intact.'); process.exitCode = 1 }
  }
  if (created) {
    try {
      const inspected = JSON.parse(docker(['inspect', container]) ?? '[]')
      if (inspected[0]?.Config?.Labels?.[label] !== owner || inspected[0]?.Name !== `/${container}`) throw new Error('CONTAINER_OWNERSHIP_FAILED')
      docker(['rm', '--force', container]); console.log('Removed only the owned restore verifier. The source archive and application database were not changed.')
    } catch { console.error('[backup/verify] Container ownership could not be verified; left intact.'); process.exitCode = 1 }
  }
}
