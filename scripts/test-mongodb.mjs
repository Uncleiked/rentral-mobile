import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const owner = randomUUID().replaceAll('-', '')
const container = `rentral-mongo-test-${owner.slice(0, 12)}`
const database = `rentral_test_${owner}`
const label = 'rentral.fixture.owner'
const shellUri = 'mongodb://127.0.0.1:27017/admin?directConnection=true&serverSelectionTimeoutMS=500'
let created = false

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
  console.log('Running MongoDB constraints, privacy and concurrency checks against the owned fixture.')
  const test = spawnSync(process.execPath, [vitest, 'run', 'tests/mongodb.integration.test.ts'], {
    stdio: 'inherit', windowsHide: true,
    env: { ...process.env, MONGODB_URL: uri, DATABASE_URL: uri, RENTRAL_TEST_MONGO_URI: uri, RENTRAL_TEST_MONGO_OWNER: owner, NODE_ENV: 'test' },
  })
  process.exitCode = test.status ?? 1
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
