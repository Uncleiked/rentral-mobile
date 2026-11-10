import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { MongoClient } from 'mongodb'
import { PrismaClient } from '@prisma/client'
import { ensureMongoIndexes } from '../lib/database/indexes.ts'

// This verification harness never reads an application Mongo URI or writes .env.
const root = process.cwd()
const productionBrowser = process.argv.includes('--production-browser')
const financeUiOnly = process.argv.includes('--finance-ui-only')
assert.ok(!productionBrowser || financeUiOnly, '--production-browser is limited to --finance-ui-only; it does not claim production origin/outbox HTTP acceptance.')
const owner = randomUUID().replaceAll('-', '')
const container = `rentral-http-test-${owner.slice(0, 12)}`
const label = 'rentral.fixture.owner'
const database = `rentral_test_${owner}`
const artifactRoot = path.join(root, 'test-results', `localhost-${owner.slice(0, 12)}`)
const storageRoot = path.join(artifactRoot, 'storage')
const buildDirectory = path.relative(root, path.join(artifactRoot, '.next')).replaceAll('\\', '/')
const runtimeBuildDirectory = productionBrowser ? '.next' : buildDirectory
const checkpoints = []
let client, next, created = false, generatedFiles
let serverOutput = ''
const snapshots = new Map()
const shellUri = 'mongodb://127.0.0.1:27017/admin?directConnection=true&serverSelectionTimeoutMS=500'

function docker(args, required = true) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 180000 })
  if (required && result.status !== 0) throw new Error('An owned Docker fixture operation failed.')
  return result.status === 0 ? result.stdout.trim() : null
}
async function waitMongo(expression) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (docker(['exec', container, 'mongosh', shellUri, '--quiet', '--eval', expression], false) === '1') return
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new Error('Owned Mongo replica fixture did not become ready.')
}
function check(name, condition = true) {
  assert.ok(condition, name)
  checkpoints.push(name)
  console.log(`PASS ${name}`)
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}
function redact(value) {
  return value.replace(/([?&]token=)[^&\s]+/g, '$1[redacted]').replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/g, '[owned Mongo URI]')
}
async function captureGenerated() {
  generatedFiles = new Map()
  for (const name of snapshots.keys()) generatedFiles.set(name, await readFile(path.join(root, name), 'utf8'))
}

async function runFinancialBrowser(db, origin, session) {
  await db.collection('User').updateOne({ _id: session.user.id }, { $set: { staff_role: 'admin' } })
  const draftId = randomUUID()
  await db.collection('Listing').insertOne({ _id: draftId, revision: 0, lister_id: session.user.id, category: 'house', listing_status: 'draft', wizard_step: 'details',
    text_address: 'Initial owned fixture address', base_rent_amount: 500000, asset_metadata: { listingTitle: 'Owned draft before editing', bedrooms: '2', bathrooms: '2', sizeSqm: '80', amenities: '' },
    video_path: null, poster_path: null, document_path: null, capture_id: null, archived_at: null, archived_status: null, createdAt: new Date(), updatedAt: new Date() })
  const browserFixture = path.join(artifactRoot, 'finance-browser-session.json')
  await writeFile(browserFixture, JSON.stringify({ origin, accessToken: session.access_token, refreshToken: session.refresh_token, actorId: session.user.id, email: session.user.email, draftId }), { mode: 0o600 })
  // Keep the parent event loop draining the owned Next stdout/stderr pipes
  // during compilation and browser work. A synchronous wait can fill them.
  const status = await new Promise((resolveStatus, rejectStatus) => {
    const browser = spawn(process.execPath, [path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'test', '--config', process.env.RENTRAL_BROWSER_CONFIG || 'playwright.fixture.config.mjs'], {
      cwd: root, windowsHide: true, stdio: 'inherit',
      env: { ...process.env, RENTRAL_FINANCIAL_UI_FIXTURE: browserFixture, RENTRAL_FINANCIAL_UI_ARTIFACTS: path.join(artifactRoot, 'financial-browser') },
    })
    const timeout = setTimeout(() => {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      else browser.kill('SIGTERM')
    }, 900000)
    browser.once('error', error => { clearTimeout(timeout); rejectStatus(error) })
    browser.once('exit', code => { clearTimeout(timeout); resolveStatus(code) })
  })
  if (status !== 0) throw new Error('Owned financial browser fixture failed.')
  check('staff financial UI preserves unknown commands and fits320/390/768 without real provider calls')
  await db.collection('User').updateOne({ _id: session.user.id }, { $set: { staff_role: null } })
}

try {
  await mkdir(storageRoot, { recursive: true })
  if (productionBrowser) {
    const buildId = (await readFile(path.join(root, '.next', 'BUILD_ID'), 'utf8')).trim()
    const required = JSON.parse(await readFile(path.join(root, '.next', 'required-server-files.json'), 'utf8'))
    assert.ok(buildId && buildId.length <= 200, 'Complete the root production build before invoking this mode.')
    assert.equal(path.resolve(required.appDir), root, 'Production build must belong to this workspace.')
    assert.equal(path.resolve(root, required.config.distDir), path.join(root, '.next'), 'Production mode reads only the root .next build.')
    check('root production build is present; harness will not rebuild or remove it')
  }
  for (const name of productionBrowser ? [] : ['next-env.d.ts', 'tsconfig.json']) {
    const content = await readFile(path.join(root, name), 'utf8')
    snapshots.set(name, content)
    await writeFile(path.join(artifactRoot, `${name}.snapshot.txt`), content)
  }
  docker(['run', '--detach', '--rm', '--name', container, '--label', `${label}=${owner}`, '--publish', '127.0.0.1::27017', 'mongo:8.0', '--replSet', 'rs0', '--bind_ip_all'])
  created = true
  await waitMongo('db.adminCommand({ping:1}).ok')
  docker(['exec', container, 'mongosh', shellUri, '--quiet', '--eval', "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"])
  await waitMongo('db.adminCommand({hello:1}).isWritablePrimary ? 1 : 0')
  const mongoPort = /^127\.0\.0\.1:(\d+)$/.exec(docker(['port', container, '27017/tcp']))?.[1]
  assert.ok(mongoPort, 'Fixture must expose one loopback port')
  const uri = `mongodb://127.0.0.1:${mongoPort}/${database}?replicaSet=rs0&directConnection=true`
  client = new MongoClient(uri)
  await client.connect()
  const db = client.db(database)
  assert.equal((await db.listCollections().toArray()).length, 0)
  await db.collection('_FixtureOwnership').insertOne({ _id: owner })
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  assert.notEqual(port, 3000, 'Fixture must not bind the application backend port.')
  const nextArguments = [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), productionBrowser ? 'start' : 'dev',
    ...(productionBrowser ? [] : ['--webpack']), '--hostname', '127.0.0.1', '--port', String(port)]
  next = spawn(process.execPath, nextArguments, {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: productionBrowser ? 'production' : 'development', MONGODB_URL: uri, DATABASE_URL: uri, MONGODB_DB_NAME: database,
      JWT_SECRET: 'owned-localhost-http-fixture-signing-key-at-least-32-bytes',
      NEXT_PUBLIC_APP_URL: origin, RENTRAL_PLATFORM_ENABLED: 'true', RENTRAL_STORAGE_DIR: storageRoot,
      RENTRAL_BUILD_DIR: runtimeBuildDirectory, AUTH_DEV_EMAIL_OUTBOX: productionBrowser ? 'false' : 'true',
      NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_POSTHOG_ENABLED: 'false', NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: '',
      PAYMENTS_ENABLED: 'false', MUX_ENABLED: 'false', LIFECYCLE_WORKER_ENABLED: 'false', GEMINI_API_KEY: '',
      AUTH_EMAIL_ENABLED: 'false', NOTIFICATION_EMAIL_ENABLED: 'false', SETTLEMENT_ENABLED: 'false',
      COMMERCIAL_ENABLED: 'false', PUSH_NOTIFICATIONS_ENABLED: 'false', OLUSO_ENABLED: 'false', RENTRAL_ANALYTICS_ENABLED: 'false',
      PAYSTACK_SECRET_KEY: '', RESEND_API_KEY: '', PAYMENT_ACCOUNT_HASH_SECRET: '',
      EXPO_ACCESS_TOKEN: '', PUSH_TOKEN_ENCRYPTION_KEY: '', AUTH_EMAIL_ENCRYPTION_KEY: '',
      GEOAPIFY_API_KEY: '', OLUSO_API_KEY: '', NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: '',
    },
  })
  for (const stream of [next.stdout, next.stderr]) stream.on('data', value => { serverOutput += redact(value.toString()) })
  next.on('error', error => { serverOutput += `\n${error.name}\n` })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (next.exitCode !== null) throw new Error(`Owned Next ${productionBrowser ? 'production' : 'development'} server exited during startup.`)
    try { const response = await fetch(`${origin}/api/v1/me`, { signal: AbortSignal.timeout(3000) }); if (response.status === 401) break } catch { /* compilation startup */ }
    if (attempt === 99) throw new Error(`Owned Next ${productionBrowser ? 'production' : 'development'} server did not become ready.`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  await captureGenerated()
  check(`real Next ${productionBrowser ? 'production' : 'development'} backend starts on owned loopback port`)
  if (productionBrowser) check('production browser mode intercepts API mutations; real origin-CSRF and outbox acceptance are outside this run')
  async function request(route, { session, json, headers, method = json ? 'POST' : 'GET', expected = 200, raw } = {}) {
    const response = await fetch(new URL(route, origin), { method, redirect: 'manual', signal: AbortSignal.timeout(120000),
      headers: { ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json ? JSON.stringify(json) : raw,
    })
    const bytes = Buffer.from(await response.arrayBuffer())
    let value
    try { value = JSON.parse(bytes.toString('utf8')) } catch { value = null }
    assert.equal(response.status, expected, `${method} ${route.split('?')[0]} expected ${expected}, got ${response.status} (${value?.code ?? 'non-JSON'})`)
    return { response, bytes, value, data: value?.data }
  }
  const password = 'LocalFixture!secret-9842'
  await request('/api/v1/auth/register', { json: { email: 'unprepared@fixture.invalid', password }, expected: 503 })
  check('unprepared database fails closed before User writes', await db.collection('User').countDocuments() === 0)
  await ensureMongoIndexes(db)
  check('owned schema validators and readiness marker initialized explicitly')
  const host = (await request('/api/v1/auth/register', { json: { email: 'host@fixture.invalid', password }, expected: 201 })).data
  const renter = (await request('/api/v1/auth/register', { json: { email: 'renter@fixture.invalid', password }, expected: 201 })).data
  const outsider = (await request('/api/v1/auth/register', { json: { email: 'outsider@fixture.invalid', password }, expected: 201 })).data
  check('three accounts register through real JWT endpoints')
  if (productionBrowser) {
    const missingListing = randomUUID(), feePath = `/api/v1/my-listings/${missingListing}/publication-fee`
    await request(feePath, { expected: 401 })
    await request(feePath, { session: host, headers: { 'X-Rentral-Account': renter.user.id }, expected: 409 })
    await request(feePath, { session: host, expected: 404 })
    await request(`${feePath}/checkout`, { session: host, json: {}, expected: 404 })
    await request(`${feePath}/reconcile`, { session: host, json: { reference: `rentral-${randomUUID()}` }, expected: 404 })
    check('native publication routes reject anonymous/changed actors and unowned missing listings without payment writes', await db.collection('PaymentIntent').countDocuments() === 0)
  }
  if (financeUiOnly) {
    await runFinancialBrowser(db, origin, outsider)
  } else {
  const me = (await request('/api/v1/me', { session: host })).data
  check('fresh unverified member opens profile with generated handle', me.id === host.user.id && me.username && !('kyc_verified' in me) && me.platformAvailable)
  const storedHost = await db.collection('User').findOne({ _id: host.user.id })
  check('Mongo stores password hash and no KYC approval is fabricated', storedHost.password_hash !== password && storedHost.password_hash && storedHost.kyc_verified === false)
  await request('/api/v1/me', { session: host, method: 'PATCH', json: { username: 'fixture_host', bio: 'Local HTTP fixture' } })
  check('optional profile patch works without onboarding')
  const folder = randomUUID()
  const videoPath = `${host.user.id}/${folder}/video_raw.mov`
  const posterPath = `${host.user.id}/${folder}/poster.jpg`
  const documentPath = `${host.user.id}/${folder}/proof.pdf`
  const avatarPath = `${host.user.id}/avatar.png`
  const video = Buffer.from([0,0,0,24, ...Buffer.from('ftypqt  '), 0,0,0,0, ...Buffer.from('fixture-video-payload')])
  const poster = Buffer.from([255,216,255,224, ...Buffer.from('fixture-jpeg')])
  const document = Buffer.from('%PDF-1.7\nowned fixture')
  const avatar = Buffer.from([137,80,78,71,13,10,26,10, ...Buffer.from('fixture-png')])
  async function upload(bucket, objectPath, body, type, session = host, expected = 201) {
    return request(`/api/v1/uploads/${bucket}`, { session, method: 'POST', expected, headers: { 'Content-Type': type, 'X-Upload-Path': objectPath }, raw: body })
  }
  await upload('listings-media', videoPath, video, 'video/quicktime')
  await upload('listings-media', posterPath, poster, 'image/jpeg')
  await upload('compliance-docs', documentPath, document, 'application/pdf')
  await upload('profile-avatars', avatarPath, avatar, 'image/png')
  check('real raw uploads accept MOV, poster, private document and avatar')
  await upload('listings-media', `${host.user.id}/${folder}/foreign.mov`, video, 'video/quicktime', outsider, 403)
  await upload('listings-media', `${host.user.id}/${folder}/bad.mov`, Buffer.from('wrong content'), 'video/quicktime', host, 415)
  check('upload path ownership and file signature are enforced')
  const publicAvatar = await request(`/api/v1/files/profile-avatars/${avatarPath}`)
  check('avatar public delivery preserves uploaded bytes', publicAvatar.bytes.equals(avatar))
  const listingInput = { category: 'car', address: '42 Fixture Street, Victoria Island, Lagos', basePrice: '50000', lat: 6.447, lng: 3.421, accuracy: 8,
    videoPath, posterPath, documentPath, metadata: { listingTitle: 'Fixture City Car', description: 'Created through the mobile API.', transmission: 'automatic', mileageKm: '24000', seats: '4', fuelType: 'Petrol', pricePeriod: 'day' } }
  const listingId = (await request('/api/v1/my-listings', { session: host, json: { mode: 'submit', listing: listingInput }, expected: 201 })).data.id
  check('native listing submission persists through real Mongo transaction', Boolean(listingId))
  const geometry = await db.collection('ListingLocation').findOne({ listing_id: listingId })
  check('capture coordinates stored only in separate private location', geometry?.geometry?.coordinates?.[0] === 3.421 && !('hardware_coordinates' in (await db.collection('Listing').findOne({ _id: listingId }))))
  await request(`/api/v1/listings/${listingId}`, { session: outsider, expected: 404 })
  await request(`/api/v1/listings/${listingId}/media`, { session: outsider, expected: 404 })
  check('pending listing and its media remain unavailable to non-owner')
  // Fixture publication only: do not simulate staff decisions or external payment providers.
  await db.collection('Listing').updateOne({ _id: listingId, lister_id: host.user.id, listing_status: 'pending_verification' }, { $set: { listing_status: 'active' } })
  const diagnosticClient = new PrismaClient({ datasources: { db: { url: uri } } })
  try {
    await diagnosticClient.listing.findRaw({ filter: { $and: [{ listing_status: 'active' }, { category: 'car' }] }, options: { projection: { _id: 1 }, sort: { createdAt: -1, _id: -1 }, limit: 13, maxTimeMS: { secs: 3, nanos: 0 } } })
    console.log('DIAGNOSTIC discovery raw ID query passed')
    await diagnosticClient.listing.findMany({ where: { id: { in: [listingId] }, listing_status: 'active' }, select: { id: true, lister: { select: { username: true, avatar_url: true, kyc_verified: true, account_type: true, bio: true, createdAt: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    console.log('DIAGNOSTIC discovery typed owner projection passed')
    await diagnosticClient.booking.findMany({ where: { listing_id: { in: [listingId] }, kind: 'hold', expires_at: { gt: new Date() }, OR: [{ status: 'confirmed' }, { status: 'converted', allocated_hold_credit: { rental_booking: { status: 'awaiting_payment', expires_at: { gt: new Date() } } } }] }, select: { listing_id: true, expires_at: true, allocated_hold_credit: { select: { rental_booking: { select: { expires_at: true } } } } }, orderBy: { expires_at: 'desc' }, take: 7 })
    console.log('DIAGNOSTIC discovery hold relation query passed')
  } catch (error) { console.error('Owned-fixture-only discovery diagnostic:', redact(error instanceof Error ? error.message : String(error))); throw error }
  finally { await diagnosticClient.$disconnect() }
  const discovery = (await request('/api/v1/listings?category=car', { session: renter })).data
  const found = discovery.items.find(item => item.id === listingId)
  const detail = await request(`/api/v1/listings/${listingId}`, { session: renter })
  check('browse and details show submitted title and description', found?.title === 'Fixture City Car' && detail.data.metadata.description === listingInput.metadata.description)
  check('public projection excludes exact street, coordinates and credentials', !detail.bytes.toString().includes('42 Fixture Street') && !detail.bytes.toString().includes('coordinates') && !detail.bytes.toString().includes('password_hash'))
  const media = (await request(`/api/v1/listings/${listingId}/media`, { session: renter })).data
  const range = await request(media.videoUrl, { headers: { Range: 'bytes=4-11' }, expected: 206 })
  check('signed native media supports exact byte ranges', range.bytes.equals(video.subarray(4, 12)) && range.response.headers.get('content-range') === `bytes 4-11/${video.length}`)
  const head = await request(media.videoUrl, { method: 'HEAD' })
  check('signed native media HEAD returns metadata without bytes', !head.bytes.length && head.response.headers.get('content-type') === 'video/quicktime' && head.response.headers.get('accept-ranges') === 'bytes')
  console.log(`HEAD transport content length: ${head.response.headers.get('content-length') ?? 'omitted'}`)
  await request(media.videoUrl, { headers: { Range: 'bytes=999999-' }, expected: 416 })
  await request(`/api/v1/files/listings-media/${videoPath}`, { session: host, expected: 403 })
  await request(`/api/v1/files/compliance-docs/${documentPath}`, { session: host, expected: 403 })
  check('private files require capability and reject unsatisfiable range')
  const tampered = new URL(media.videoUrl); tampered.searchParams.set('token', 'invalid-token')
  await request(tampered.href, { expected: 403 })
  check('tampered signed media capability is rejected')
  await request(`/api/v1/saved/${listingId}`, { session: renter, method: 'PUT' })
  await request(`/api/v1/saved/${listingId}`, { session: renter, method: 'PUT' })
  check('saved listing PUT is idempotent', await db.collection('SavedListing').countDocuments({ user_id: renter.user.id, listing_id: listingId }) === 1)
  check('saved collection is scoped to account', (await request('/api/v1/saved', { session: renter })).data.items.length === 1 && (await request('/api/v1/saved', { session: outsider })).data.items.length === 0)
  const conversationId = (await request('/api/v1/messages', { session: renter, json: { listingId }, expected: 201 })).data.id
  const messageInput = { clientId: randomUUID(), body: 'Is this car available for tomorrow?' }
  const messageId = (await request(`/api/v1/messages/${conversationId}`, { session: renter, json: messageInput, expected: 201 })).data.id
  const repeated = (await request(`/api/v1/messages/${conversationId}`, { session: renter, json: messageInput, expected: 201 })).data.id
  const thread = (await request(`/api/v1/messages/${conversationId}`, { session: host })).data
  check('real messaging persists once and host reads participant thread', messageId === repeated && JSON.stringify(thread).includes(messageInput.body))
  await request(`/api/v1/messages/${conversationId}`, { session: outsider, expected: 404 })
  check('non-participant cannot read private conversation')
  const startsAt = new Date(Date.now() + 7 * 86400000).toISOString()
  const endsAt = new Date(Date.parse(startsAt) + 86400000).toISOString()
  const bookingId = (await request('/api/v1/bookings', { session: renter, json: { listingId, kind: 'rental', startsAt, endsAt }, expected: 201 })).data.id
  const booking = (await request(`/api/v1/bookings/${bookingId}`, { session: host })).data
  check('booking is server-priced and visible to both participants', booking.amountKobo === '5000000' && booking.role === 'host' && (await request('/api/v1/bookings', { session: renter })).data.items.some(item => item.id === bookingId))
  await request(`/api/v1/bookings/${bookingId}`, { session: outsider, expected: 404 })
  check('non-participant cannot access another booking')
  const cookieSession = (await request('/api/v1/auth/login', { json: { email: 'renter@fixture.invalid', password } })).data
  const cookies = `rentral_access=${cookieSession.access_token}; rentral_refresh=${cookieSession.refresh_token}`
  await request('/api/v1/me', { headers: { Cookie: cookies, Authorization: 'Bearer invalid' }, expected: 401 })
  await request('/api/v1/me', { method: 'PATCH', json: { bio: 'Denied cross-site' }, headers: { Cookie: cookies }, expected: 403 })
  await request('/api/v1/me', { method: 'PATCH', json: { bio: 'Same-origin cookie edit' }, headers: { Cookie: cookies, Origin: origin } })
  check('bearer failure never falls back to cookie and cookie mutations enforce origin')
  const unauthenticated = await request('/marketplace', { expected: 307 })
  check('browser marketplace redirects signed-out visitor to sign-in', unauthenticated.response.headers.get('location')?.endsWith('/sign-in'))
  const browserPage = await request('/marketplace', { headers: { Cookie: cookies } })
  check('JWT browser cookies enter marketplace without KYC onboarding', browserPage.bytes.toString().includes('Fixture City Car') && !browserPage.response.headers.get('location'))
  const refreshedPage = await request('/marketplace', { headers: { Cookie: `rentral_access=invalid; rentral_refresh=${cookieSession.refresh_token}` } })
  check('browser proxy rotates refresh cookie before rendering protected page', refreshedPage.response.headers.getSetCookie().some(value => value.startsWith('rentral_access=')) && refreshedPage.response.headers.getSetCookie().some(value => value.startsWith('rentral_refresh=')))
  if (process.argv.includes('--finance-ui')) {
    await runFinancialBrowser(db, origin, outsider)
  }
  await request('/api/v1/auth/password-reset', { json: { email: 'outsider@fixture.invalid' } })
  const outbox = path.join(storageRoot, 'mail-outbox')
  const mailFiles = await readdir(outbox)
  const resetMail = await readFile(path.join(outbox, mailFiles[0]), 'utf8')
  const resetToken = /Reset code: ([^\r\n]+)/.exec(resetMail)?.[1]
  check('password recovery writes only private fixture outbox', Boolean(resetToken))
  await request(`/api/v1/files/mail-outbox/${mailFiles[0]}`, { session: outsider, expected: 404 })
  check('private recovery outbox is never served by files API')
  await request('/api/v1/auth/reset-password', { json: { token: resetToken, password: 'NewLocalFixture!secret-1234' } })
  await request('/api/v1/me', { session: outsider, expected: 401 })
  check('HTTP password reset revokes previous access sessions')
  await request('/api/v1/auth/logout', { session: renter, json: {} })
  await request('/api/v1/me', { session: renter, expected: 401 })
  check('HTTP logout revokes session-backed JWT')
  check('all HTTP fixture users still have unverified historical KYC status', await db.collection('User').countDocuments({ kyc_verified: true }) === 0)
  }
  await writeFile(path.join(artifactRoot, 'report.json'), JSON.stringify({ success: true, checkpoints, count: checkpoints.length, origin,
    serverMode: productionBrowser ? 'production' : 'development', browserApiIntercepted: financeUiOnly,
    productionOriginAndEmailAcceptance: false, configuredDatabaseUsed: false, externalProvidersEnabled: false }, null, 2))
  console.log(`HTTP fixture complete: ${checkpoints.length} checks passed.`)
} catch (error) {
  process.exitCode = 1
  console.error(error instanceof Error ? error.message : 'HTTP fixture failed')
  console.error(redact(serverOutput).split('\n').slice(-35).join('\n'))
  await writeFile(path.join(artifactRoot, 'report.json'), JSON.stringify({ success: false, checkpoints, count: checkpoints.length, error: error instanceof Error ? error.message : 'Unknown failure' }, null, 2)).catch(() => {})
} finally {
  if (next?.pid && next.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(next.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    else next.kill('SIGTERM')
  }
  if (client) await client.close()
  await writeFile(path.join(artifactRoot, 'next-server.log'), redact(serverOutput)).catch(() => {})
  for (const [name, original] of snapshots) {
    const current = await readFile(path.join(root, name), 'utf8').catch(() => null)
    let generatedOnly = current === generatedFiles?.get(name)
    if (current && name === 'tsconfig.json') {
      const parsed = JSON.parse(current)
      parsed.include = parsed.include.filter(value => !value.startsWith(`${buildDirectory}/`))
      generatedOnly ||= JSON.stringify(parsed) === JSON.stringify(JSON.parse(original))
    }
    if (current && name === 'next-env.d.ts') {
      const imports = current.split(/\r?\n/).filter(value => value.startsWith('import '))
      const outsideImports = value => value.split(/\r?\n/).filter(line => !line.startsWith('import ')).join('\n')
      generatedOnly ||= imports.every(value => value.startsWith(`import "./${buildDirectory}/`)) && outsideImports(current) === outsideImports(original)
    }
    if (generatedOnly) await writeFile(path.join(root, name), original)
    else if (current !== original) console.warn(`Generated ${name} changed concurrently; restore skipped to preserve collaborator edits.`)
  }
  const buildAbsolute = path.resolve(root, buildDirectory)
  if (!productionBrowser && buildAbsolute.startsWith(`${artifactRoot}${path.sep}`) && artifactRoot.startsWith(`${path.join(root, 'test-results')}${path.sep}`)) {
    await rm(buildAbsolute, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }
  if (created) {
    const inspected = JSON.parse(docker(['inspect', container]) ?? '[]')
    if (inspected[0]?.Config?.Labels?.[label] === owner && inspected[0]?.Name === `/${container}`) {
      docker(['rm', '--force', container])
      console.log('Removed owned Mongo fixture and stopped owned Next process. Configured database was not used.')
    } else { console.error('Container ownership check failed; no cleanup action taken.'); process.exitCode = 1 }
  }
  console.log(`Report directory: ${path.relative(root, artifactRoot)}`)
}
