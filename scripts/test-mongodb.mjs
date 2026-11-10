import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, lstatSync, rmSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'

const owner = randomUUID().replaceAll('-', '')
const container = `rentral-mongo-test-${owner.slice(0, 12)}`
const database = `rentral_test_${owner}`
const label = 'rentral.fixture.owner'
const shellUri = 'mongodb://127.0.0.1:27017/admin?directConnection=true&serverSelectionTimeoutMS=500'
// Owned integration defaults must accommodate the existing transaction budget.
// Individual test timeouts still override this; normal unit runs are unchanged.
const integrationTimeoutArgs = ['--testTimeout=15000']
let created = false
const artifacts = resolve('test-results'), staging = join(artifacts, `owned-backup-cli-${owner}`), stagedArchive = join(staging, 'snapshot.rentral')
let stagingOwned = false, backupPassed = false, fixtureUri

function docker(args, required = true) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 180000 })
  if (required && result.status !== 0) throw new Error('The owned MongoDB Docker fixture command failed. Check that Docker is running and the mongo:8.0 image is available.')
  return result.status === 0 ? result.stdout.trim() : null
}

async function waitFor(expression) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (docker(['exec', container, 'mongosh', shellUri, '--quiet', '--eval', expression], false) === '1') return
    await new Promise(resolveWait => setTimeout(resolveWait, 500))
  }
  throw new Error('The owned MongoDB replica-set fixture did not become ready.')
}

try {
  const vitest = resolve('node_modules/vitest/vitest.mjs')
  if (!existsSync(vitest)) throw new Error('Run npm install before the MongoDB fixture test.')
  mkdirSync(artifacts, { recursive: true }); mkdirSync(staging, { mode: 0o700 }); writeFileSync(join(staging, '.owner'), owner, { flag: 'wx', mode: 0o600 }); stagingOwned = true
  console.log('Starting an isolated, owned MongoDB replica-set fixture on a random loopback port.')
  docker(['run', '--detach', '--rm', '--name', container, '--label', `${label}=${owner}`, '--publish', '127.0.0.1::27017', 'mongo:8.0', '--replSet', 'rs0', '--bind_ip_all'])
  created = true
  await waitFor('db.adminCommand({ping:1}).ok')
  docker(['exec', container, 'mongosh', shellUri, '--quiet', '--eval', "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"])
  await waitFor('db.adminCommand({hello:1}).isWritablePrimary ? 1 : 0')
  const mapping = docker(['port', container, '27017/tcp'])
  const port = /^127\.0\.0\.1:(\d+)$/.exec(mapping ?? '')?.[1]
  if (!port) throw new Error('The fixture must expose only a random loopback port.')
  const uri = `mongodb://127.0.0.1:${port}/${database}?replicaSet=rs0&directConnection=true`
  fixtureUri = uri
  console.log('Running MongoDB constraints, privacy and concurrency checks against the owned fixture.')
  const backupOnly = process.argv.includes('--backup-only')
  const authOnly = process.argv.includes('--auth-only')
  const coreOnly = process.argv.includes('--core-only')
  if ([backupOnly, authOnly, coreOnly].filter(Boolean).length > 1) throw new Error('Choose only one isolated suite.')
  if (backupOnly || authOnly) docker(['exec', container, 'mongosh', shellUri, '--quiet', '--eval', `db.getSiblingDB('${database}').getCollection('_FixtureOwnership').insertOne({_id:'${owner}'})`])
  const test = spawnSync(process.execPath, [vitest, 'run', ...integrationTimeoutArgs, authOnly ? 'tests/auth-security.integration.test.ts' : backupOnly ? 'tests/backup.integration.test.ts' : 'tests/mongodb.integration.test.ts'], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, MONGODB_URL: uri, DATABASE_URL: uri, RENTRAL_TEST_MONGO_URI: uri, RENTRAL_TEST_MONGO_OWNER: owner, NODE_ENV: 'test', ...(backupOnly ? { RENTRAL_TEST_BACKUP_ARCHIVE: stagedArchive } : {}) },
  })
  process.exitCode = test.status ?? 1
  if (backupOnly && test.status === 0) backupPassed = true
  if (test.status === 0 && !backupOnly && !authOnly && !coreOnly) {
    const financial = spawnSync(process.execPath, [vitest, 'run', ...integrationTimeoutArgs, 'tests/financial-domain.integration.test.ts'], {
      stdio: 'inherit', windowsHide: true,
      env: { ...process.env, MONGODB_URL: uri, DATABASE_URL: uri, RENTRAL_TEST_MONGO_URI: uri, RENTRAL_TEST_MONGO_OWNER: owner, NODE_ENV: 'test' },
    })
    process.exitCode = financial.status ?? 1
    if (financial.status === 0) {
      const auth = spawnSync(process.execPath, [vitest, 'run', ...integrationTimeoutArgs, 'tests/auth-security.integration.test.ts'], {
        stdio: 'inherit', windowsHide: true,
        env: { ...process.env, MONGODB_URL: uri, DATABASE_URL: uri, RENTRAL_TEST_MONGO_URI: uri, RENTRAL_TEST_MONGO_OWNER: owner, NODE_ENV: 'test' },
      })
      process.exitCode = auth.status ?? 1
      if (auth.status === 0) {
        const backup = spawnSync(process.execPath, [vitest, 'run', ...integrationTimeoutArgs, 'tests/backup.integration.test.ts'], {
          stdio: 'inherit', windowsHide: true,
          env: { ...process.env, MONGODB_URL: uri, DATABASE_URL: uri, RENTRAL_TEST_MONGO_URI: uri, RENTRAL_TEST_MONGO_OWNER: owner, NODE_ENV: 'test', RENTRAL_TEST_BACKUP_ARCHIVE: stagedArchive },
        })
        process.exitCode = backup.status ?? 1
        backupPassed = backup.status === 0
      }
    }
  }
} catch (error) {
  console.error('[mongodb/fixture]', error instanceof Error ? error.message : 'Fixture failed.')
  process.exitCode = 1
} finally {
  if (created) {
    const inspected = JSON.parse(docker(['inspect', container]) ?? '[]')
    if (inspected[0]?.Config?.Labels?.[label] !== owner || inspected[0]?.Name !== `/${container}`) {
      console.error('[mongodb/fixture] Ownership could not be verified; the container was left intact.')
      process.exitCode = 1
    } else {
      docker(['rm', '--force', container])
      console.log('Removed the owned fixture container. The application database was not used.')
    }
  }
}

// The source fixture is gone before the wrapper provisions its verifier: at
// most one owned Mongo container is active, and no application database is used.
try {
  if (backupPassed && process.exitCode === 0 && fixtureUri && existsSync(stagedArchive)) {
    const verification = spawnSync(process.execPath, ['scripts/verify-backup.mjs', '--archive', stagedArchive], {
      stdio: 'inherit', windowsHide: true,
      env: { ...process.env, MONGODB_URL: fixtureUri, DATABASE_URL: fixtureUri, BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 61).toString('base64url'), RENTRAL_STORAGE_DIR: join(staging, 'unused-source-storage') },
    })
    process.exitCode = verification.status ?? 1
  } else if (backupPassed && process.exitCode === 0) throw new Error('Owned encrypted wrapper fixture artifact missing.')
} catch { console.error('[mongodb/fixture] Backup wrapper verification failed.'); process.exitCode = 1 }
finally {
  if (stagingOwned) {
    if (!resolve(staging).startsWith(`${artifacts}${sep}`) || basename(staging) !== `owned-backup-cli-${owner}` || lstatSync(staging).isSymbolicLink() || readFileSync(join(staging, '.owner'), 'utf8') !== owner) {
      console.error('[mongodb/fixture] Staging ownership could not be verified; left intact.'); process.exitCode = 1
    } else rmSync(staging, { recursive: true, force: true })
  }
}
