// Disposable Windows MongoDB acceptance runner. Does not load application env files.
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { mkdir, writeFile, readFile, lstat, rm, realpath } from 'node:fs/promises'
import { dirname, basename, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = resolve(root, 'test-results')
const binaryRoot = resolve(artifacts, 'mongodb-portable', 'bin')
const arguments_ = process.argv.slice(2)
const binaryIndex = arguments_.indexOf('--binary'), suiteIndex = arguments_.indexOf('--suite')
const binaryArgument = binaryIndex < 0 ? '' : arguments_[binaryIndex + 1]
const selected = suiteIndex < 0 ? 'all' : arguments_[suiteIndex + 1]
const suites = {
  core: 'tests/mongodb.integration.test.ts',
  admin: 'tests/owner-admin.integration.test.ts',
  social: 'tests/messaging-social.integration.test.ts',
  financial: 'tests/financial-domain.integration.test.ts',
  auth: 'tests/auth-security.integration.test.ts',
  backup: 'tests/backup.integration.test.ts',
  avatar: 'tests/profile-avatar.integration.test.ts',
}
if (!binaryArgument || (selected !== 'all' && !(selected in suites)) ||
  arguments_.length !== 2 + (suiteIndex < 0 ? 0 : 2)) throw new Error('Usage: node scripts/test-mongodb-portable.mjs --binary test-results/mongodb-portable/bin/.../mongod.exe [--suite all|core|admin|social|financial|auth|backup|avatar]')
const owner = randomUUID().replaceAll('-', '')
const fixture = join(artifacts, 'owned-portable-mongo-' + owner)
const results = []
let server, currentTest, client, fixtureOwned = false, port
async function portNumber() {
  const listener = createServer()
  await new Promise((resolveListen, reject) => { listener.once('error', reject); listener.listen({ host: '127.0.0.1', port: 0 }, resolveListen) })
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('Expected a loopback TCP port.')
  await new Promise((resolveClose, reject) => listener.close(error => error ? reject(error) : resolveClose()))
  return address.port
}
async function waitForPrimary() {
  const deadline = Date.now() + 60000
  let initiated = false
  while (Date.now() < deadline) {
    if ((server.exitCode !== null || server.signalCode !== null)) throw new Error('The owned MongoDB process exited before initialization.')
    try {
      await client.db('admin').command({ ping: 1 })
      if (!initiated) {
        await client.db('admin').command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:' + port }] } })
        initiated = true
      }
      const hello = await client.db('admin').command({ hello: 1 })
      if (hello.isWritablePrimary && hello.setName === 'rs0') return
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 23) initiated = true
      await client.close().catch(() => undefined)
      client = new MongoClient('mongodb://127.0.0.1:' + port + '/admin?directConnection=true', { serverSelectionTimeoutMS: 1000, connectTimeoutMS: 1000 })
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 300))
  }
  throw new Error('The owned loopback replica set was not ready within one minute.')
}
async function runSuite(name, path) {

    const suiteOwner = randomUUID().replaceAll('-', ''), database = 'rentral_test_' + suiteOwner
    const uri = 'mongodb://127.0.0.1:' + port + '/' + database + '?replicaSet=rs0&directConnection=true'
    if (['financial', 'auth', 'backup'].includes(name)) {
      await client.db(database).collection('_FixtureOwnership').insertOne({ _id: suiteOwner })
    }
  return new Promise((resolveSuite, reject) => {
    const log = []
    console.log('[portable-mongo] Starting ' + name + ' against a new owned loopback database.')
    const started = Date.now()
    currentTest = spawn(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--testTimeout=15000', '--reporter=verbose', path], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MONGODB_URL: uri, DATABASE_URL: uri, RENTRAL_TEST_MONGO_URI: uri, RENTRAL_TEST_MONGO_OWNER: suiteOwner,
        JWT_SECRET: 'owned-portable-fixture-jwt-key-at-least-thirty-two-bytes', NODE_ENV: 'test', VERCEL: '', RENTRAL_STORAGE_DRIVER: 'local',
        AUTH_EMAIL_ENABLED: 'false', NOTIFICATION_EMAIL_ENABLED: 'false', PUSH_NOTIFICATIONS_ENABLED: 'false', MEDIA_WORKER_ENABLED: 'false',
        PAYMENTS_ENABLED: 'false', SETTLEMENT_ENABLED: 'false', MUX_ENABLED: 'false', OLUSO_ENABLED: 'false' },
    })
    currentTest.stdout.on('data', bytes => { const value = bytes.toString(); log.push(value); process.stdout.write(value) })
    currentTest.stderr.on('data', bytes => { const value = bytes.toString(); log.push(value); process.stderr.write(value) })
    currentTest.once('error', reject)
    currentTest.once('exit', async (code, signal) => {
      try {
        currentTest = null
        const output = log.join('').replace(/\u001b\[[0-9;]*m/g, '')
        await writeFile(join(fixture, name + '.log'), output, { mode: 0o600 })
        results.push({ suite: name, code, signal, elapsedMs: Date.now() - started,
          counts: output.match(/Tests\s+[^\n]+/g)?.at(-1) ?? 'No test summary produced.' })
        console.log('[portable-mongo] Finished ' + name + ' with exit code ' + code)
        resolveSuite(code)
      } catch (error) { reject(error) }
    })
  })
}
async function cleanup() {
  if (currentTest && currentTest.exitCode === null) { currentTest.kill(); await Promise.race([once(currentTest, 'exit').catch(() => undefined), new Promise(resolveDelay => setTimeout(resolveDelay, 5000))]) }
  if (server && (server.exitCode === null && server.signalCode === null)) {
    try { await client?.db('admin').command({ shutdown: 1, force: true, timeoutSecs: 5 }) } catch { /* shutdown closes its own connection */ }
    await Promise.race([once(server, 'exit').catch(() => undefined), new Promise(resolveDelay => setTimeout(resolveDelay, 10000))])
    if ((server.exitCode === null && server.signalCode === null)) { server.kill(); await Promise.race([once(server, 'exit').catch(() => undefined), new Promise(resolveDelay => setTimeout(resolveDelay, 5000))]) }
  }
  await client?.close().catch(() => undefined)
  if (!fixtureOwned) return
  const stat = await lstat(fixture)
  if (resolve(fixture).startsWith(artifacts + sep) && basename(fixture) === 'owned-portable-mongo-' + owner && stat.isDirectory() && !stat.isSymbolicLink() &&
    (await realpath(fixture)).toLowerCase() === fixture.toLowerCase() && await readFile(join(fixture, '.owner'), 'utf8') === owner && (!server || (server.exitCode !== null || server.signalCode !== null))) {
    // Preserve small evidence; remove only this runner's verified disposable database.
    for (const name of ['data']) {
      const target = join(fixture, name), child = await lstat(target)
      if (!target.startsWith(fixture + sep) || !child.isDirectory() || child.isSymbolicLink() || (await realpath(target)).toLowerCase() !== target.toLowerCase()) throw new Error('Owned fixture child path changed; leaving it intact.')
      await rm(target, { recursive: true, force: true })
    }
    await writeFile(join(fixture, 'results.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2))
    await writeFile(join(artifacts, 'mongodb-portable-last.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), fixture, results }, null, 2))
    console.log('[portable-mongo] Removed only the verified owned database files; evidence is in ' + fixture)
  } else throw new Error('Owned fixture could not be verified for cleanup; left intact.')
}
try {
  const binary = await realpath(resolve(root, binaryArgument)), binaryStat = await lstat(binary)
  if (basename(binary).toLowerCase() !== 'mongod.exe' || !binary.startsWith(binaryRoot + sep) || !binaryStat.isFile() || binaryStat.isSymbolicLink()) throw new Error('Use the checksum-verified portable mongod inside test-results/mongodb-portable/bin.')
  await mkdir(artifacts, { recursive: true })
  if ((await lstat(artifacts)).isSymbolicLink()) throw new Error('Artifact folder must not be a symbolic link.')
  await mkdir(fixture); await writeFile(join(fixture, '.owner'), owner, { flag: 'wx', mode: 0o600 }); fixtureOwned = true
  await mkdir(join(fixture, 'data'))
  port = await portNumber()
  server = spawn(binary, ['--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', 'rs0', '--dbpath', join(fixture, 'data'),
    '--logpath', join(fixture, 'mongod.log'), '--wiredTigerCacheSizeGB', '0.25', '--setParameter', 'diagnosticDataCollectionEnabled=false'],
    { cwd: fixture, windowsHide: true, stdio: 'ignore' })
  await once(server, 'spawn')
  client = new MongoClient('mongodb://127.0.0.1:' + port + '/admin?directConnection=true', { serverSelectionTimeoutMS: 1000, connectTimeoutMS: 1000 })
  await waitForPrimary()
  for (const [name, path] of Object.entries(suites)) {
    if (selected !== 'all' && selected !== name) continue
    const code = await runSuite(name, path)
    if (code !== 0) process.exitCode = 1
  }
} catch (error) {
  console.error('[portable-mongo]', error instanceof Error ? error.message : 'The fixture failed.')
  process.exitCode = 1
} finally { await cleanup().catch(error => { console.error('[portable-mongo/cleanup]', error.message); process.exitCode = 1 }) }




