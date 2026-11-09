import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { MongoClient } from 'mongodb'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import prisma from '@/lib/db'
import { localMongoDatabaseName, localMongoUrl } from '@/lib/database/config'
import { ensureMongoIndexes } from '@/lib/database/indexes'
import { closeMongoReadiness } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { authenticateAccess, loginAccount, registerAccount, refreshSession, revokeAccessToken, revokeRefreshToken, requestPasswordReset, resetPassword } from '@/lib/auth/service'
import { cancelAccountEmailChange, changeAccountPassword, confirmAccountEmailChange, getAccountSecurity, getAccountSessions, requestAccountEmailChange, revokeAccountSessions } from '@/lib/auth/account-security'
import { openAuthEmail } from '@/lib/auth/email-crypto'
import { processAuthEmailDelivery, runAuthEmailDeliveryBatch } from '@/lib/auth/email-delivery'
import { ACCESS_SECONDS, accessClaims, opaqueToken, signingKey, tokenHash } from '@/lib/auth/token'
import { verifyPassword } from '@/lib/auth/password'
import { closeAccount } from '@/lib/accounts/lifecycle'
import { exportAccountPage } from '@/lib/accounts/export'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { requestBooking } from '@/lib/bookings/service'
import { saveDraftForUser } from '@/lib/listings/service'

const uri = process.env.RENTRAL_TEST_MONGO_URI, owner = process.env.RENTRAL_TEST_MONGO_OWNER
const fixture = describe.skipIf(!uri)
const password = 'owned-security-fixture-password-123'
const key = Buffer.alloc(32, 31).toString('base64url')

fixture('owned account security and encrypted delivery fixture', () => {
  let native: MongoClient, storage: string
  const users: string[] = []
  const sent = new Map<string, { id: string; body: string }>()
  const calls: { key: string; body: string }[] = []
  let loseAcknowledgement = false, rejectDelivery = false

  beforeAll(async () => {
    if (!uri || !owner || !/^[a-f0-9]{32}$/.test(owner) || localMongoDatabaseName(uri) !== `rentral_test_${owner}` || process.env.MONGODB_URL !== uri || process.env.DATABASE_URL !== uri) throw new Error('Use only the owned Mongo fixture runner.')
    native = new MongoClient(localMongoUrl(uri), { serverSelectionTimeoutMS: 3000 }); await native.connect()
    const db = native.db(localMongoDatabaseName(uri))
    if (!await db.collection<{ _id: string }>('_FixtureOwnership').findOne({ _id: owner })) throw new Error('Owned fixture marker missing.')
    await ensureMongoIndexes(db)
    const artifacts = resolve('test-results'); await mkdir(artifacts, { recursive: true })
    storage = await mkdtemp(join(artifacts, 'owned-auth-storage-'))
    vi.stubEnv('RENTRAL_STORAGE_DIR', storage)
    vi.stubEnv('JWT_SECRET', 'owned-account-security-fixture-jwt-signing-key-at-least-32-bytes')
    vi.stubEnv('AUTH_EMAIL_ENCRYPTION_KEY', key); vi.stubEnv('AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY', '')
    vi.stubEnv('AUTH_EMAIL_ENABLED', 'true'); vi.stubEnv('RESEND_API_KEY', 're_owned_auth_fixture')
    vi.stubEnv('RENTRAL_EMAIL_FROM', 'Rentral <mail@fixture.invalid>'); vi.stubEnv('AUTH_DEV_EMAIL_OUTBOX', 'false')
    vi.stubEnv('PUSH_NOTIFICATIONS_ENABLED', 'false')
  }, 20000)
  beforeEach(() => {
    calls.length = 0; sent.clear(); loseAcknowledgement = false; rejectDelivery = false
    vi.stubEnv('AUTH_EMAIL_ENABLED', 'true'); vi.stubEnv('AUTH_EMAIL_ENCRYPTION_KEY', key); vi.stubEnv('AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY', '')
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url !== 'https://api.resend.com/emails' || init.method !== 'POST' || init.redirect !== 'error') throw new Error('Unapproved fixture transport; no network permitted.')
      const requestKey = new Headers(init.headers).get('idempotency-key')!, body = String(init.body)
      calls.push({ key: requestKey, body })
      if (rejectDelivery) return new Response('PRIVATE sender configuration', { status: 400 })
      const previous = sent.get(requestKey)
      if (previous && previous.body !== body) throw new Error('Idempotency payload mismatch.')
      const value = previous ?? { id: randomUUID(), body }; sent.set(requestKey, value)
      if (loseAcknowledgement) throw new Error('Fixture lost acknowledgement after acceptance.')
      return Response.json({ id: value.id })
    }))
  })
  afterEach(async () => {
    // Only this suite's UUID accounts, inside the verified owned fixture, are affected.
    await prisma.authEmailDelivery.updateMany({ where: { user_id: { in: users }, status: { not: 'sent' } }, data: { status: 'expired', encrypted_payload: null, lease_token: null, lease_expires_at: null } })
    vi.stubEnv('AUTH_DEV_EMAIL_OUTBOX', 'false')
  })
  afterAll(async () => {
    await prisma.$disconnect(); await closeMongoReadiness(); await native?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals()
    if (storage) {
      if (!resolve(storage).startsWith(`${resolve('test-results')}${sep}`) || !storage.includes('owned-auth-storage-')) throw new Error('Unsafe auth fixture cleanup.')
      await rm(storage, { recursive: true, force: true })
    }
  })

  async function account() {
    const session = await registerAccount({ email: `${randomUUID()}@fixture.invalid`, password })
    users.push(session.user.id)
    return session
  }
  async function pushDevice(userId: string, sessionId?: string) {
    const device = await prisma.pushDevice.create({ data: { user_id: userId, ...(sessionId ? { auth_session_id: sessionId } : {}), installation_id: randomUUID(), token_hash: tokenHash(randomUUID()), proof_hash: tokenHash(randomUUID()), platform: 'ios', status: 'active', token_ciphertext: 'owned-nonlive-ciphertext', token_iv: 'owned-iv', token_tag: 'owned-tag', opted_in_at: new Date() } })
    const notification = await prisma.notification.create({ data: { user_id: userId, kind: 'account', title: 'Owned credential fixture', body: 'No push transport is called.' } })
    await prisma.pushDelivery.create({ data: { user_id: userId, device_id: device.id, notification_id: notification.id, status: 'pending' } })
    return device
  }
  async function expectPushRevoked(id: string) {
    expect(await prisma.pushDevice.findUnique({ where: { id } })).toMatchObject({ status: 'revoked', token_ciphertext: null, token_iv: null, token_tag: null })
    expect(await prisma.pushDelivery.findFirst({ where: { device_id: id } })).toMatchObject({ status: 'skipped' })
  }
  async function expiredLogoutProof(userId: string, sessionId: string) {
    const issued = Math.floor(Date.now() / 1000) - 3600
    return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(userId).setAudience('rentral-app').setIssuer('rentral').setIssuedAt(issued).setExpirationTime(issued + ACCESS_SECONDS).sign(signingKey())
  }
  async function change(userId: string) {
    const newEmail = `${randomUUID()}@fixture.invalid`
    const result = await requestAccountEmailChange(userId, { newEmail, currentPassword: password })
    const deliveries = await prisma.authEmailDelivery.findMany({ where: { user_id: userId, kind: { in: ['email_change_old', 'email_change_new'] }, status: 'pending' } })
    const token = (kind: string) => {
      const row = deliveries.find(delivery => delivery.kind === kind)!
      return /Confirmation code: ([A-Za-z0-9_-]{43})/.exec(openAuthEmail(row.id, row.kind, row.encrypted_payload!).text)![1]
    }
    return { result, newEmail, old: token('email_change_old'), proposed: token('email_change_new') }
  }

  it('requires the current password before changing credentials and revokes every existing session/challenge on success', async () => {
    const session = await account(), userId = session.user.id
    const second = await loginAccount({ email: session.user.email, password })
    const pending = await change(userId)
    const device = await pushDevice(userId)
    await expect(changeAccountPassword(userId, { currentPassword: 'wrong-password', newPassword: 'replacement-fixture-password-123' })).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' })
    expect((await authenticateAccess(session.access_token)).user.id).toBe(userId)
    expect(await prisma.pushDevice.findUnique({ where: { id: device.id } })).toMatchObject({ status: 'active' })
    await changeAccountPassword(userId, { currentPassword: password, newPassword: 'replacement-fixture-password-123' })
    await expect(authenticateAccess(session.access_token)).rejects.toMatchObject({ status: 401 })
    await expect(authenticateAccess(second.access_token)).rejects.toMatchObject({ status: 401 })
    expect(await prisma.emailChange.findUnique({ where: { id: pending.result.pending.id } })).toMatchObject({ status: 'cancelled' })
    await expect(confirmAccountEmailChange({ token: pending.old })).rejects.toMatchObject({ code: 'INVALID_EMAIL_CONFIRMATION' })
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    expect(await verifyPassword('replacement-fixture-password-123', stored.password_hash)).toBe(true)
    await expectPushRevoked(device.id)
  }, 15000)
  it('requires both independent mailbox capabilities and revokes sessions only after the second confirmation', async () => {
    const session = await account(), pending = await change(session.user.id)
    const device = await pushDevice(session.user.id)
    expect(await confirmAccountEmailChange({ token: pending.proposed })).toEqual({ status: 'waiting', signInRequired: false })
    expect((await authenticateAccess(session.access_token)).user.email).toBe(session.user.email)
    expect(await prisma.pushDevice.findUnique({ where: { id: device.id } })).toMatchObject({ status: 'active' })
    expect(await confirmAccountEmailChange({ token: pending.old })).toEqual({ status: 'completed', signInRequired: true })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).email).toBe(pending.newEmail)
    await expect(authenticateAccess(session.access_token)).rejects.toMatchObject({ status: 401 })
    await expect(confirmAccountEmailChange({ token: pending.old })).rejects.toMatchObject({ code: 'INVALID_EMAIL_CONFIRMATION' })
    expect((await loginAccount({ email: pending.newEmail, password })).user.id).toBe(session.user.id)
    await expectPushRevoked(device.id)
  }, 15000)
  it('serializes simultaneous confirmation and duplicate consumption to one completion', async () => {
    const session = await account(), pending = await change(session.user.id)
    const duplicates = await Promise.allSettled([confirmAccountEmailChange({ token: pending.old }), confirmAccountEmailChange({ token: pending.old })])
    expect(duplicates.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await confirmAccountEmailChange({ token: pending.proposed })).toMatchObject({ status: 'completed' })
    const another = await account(), pair = await change(another.user.id)
    const results = await Promise.all([confirmAccountEmailChange({ token: pair.old }), confirmAccountEmailChange({ token: pair.proposed })])
    expect(results.filter(result => result.status === 'completed')).toHaveLength(1)
  }, 15000)
  it('cancels/replaces older changes and rejects expired capabilities without updating the account address', async () => {
    const session = await account(), first = await change(session.user.id), second = await change(session.user.id)
    expect(await prisma.emailChange.findUnique({ where: { id: first.result.pending.id } })).toMatchObject({ status: 'cancelled' })
    await expect(confirmAccountEmailChange({ token: first.old })).rejects.toMatchObject({ code: 'INVALID_EMAIL_CONFIRMATION' })
    await prisma.emailChange.update({ where: { id: second.result.pending.id }, data: { expires_at: new Date(Date.now() - 1) } })
    await expect(confirmAccountEmailChange({ token: second.old })).rejects.toMatchObject({ code: 'INVALID_EMAIL_CONFIRMATION' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).email).toBe(session.user.email)
    await cancelAccountEmailChange(session.user.id)
  }, 15000)
  it('binds email capabilities to the credential fingerprint even if another server missed cancellation during an upgrade', async () => {
    const session = await account(), pending = await change(session.user.id)
    await withTransaction(async tx => {
      await lockRecord(tx, 'user', session.user.id)
      await tx.user.update({ where: { id: session.user.id }, data: { password_hash: 'credential-snapshot-replaced-in-owned-fixture' } })
    })
    await expect(confirmAccountEmailChange({ token: pending.old })).rejects.toMatchObject({ code: 'INVALID_EMAIL_CONFIRMATION' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).email).toBe(session.user.email)
  }, 15000)
  it('lets a real password reset invalidate a pending change and all prior sessions atomically', async () => {
    const session = await account(), pending = await change(session.user.id), token = opaqueToken()
    const device = await pushDevice(session.user.id)
    await prisma.passwordReset.create({ data: { user_id: session.user.id, token_hash: tokenHash(token), used_at: null, expires_at: new Date(Date.now() + 60000) } })
    await resetPassword({ token, password: 'new-reset-fixture-password-456' })
    await expect(confirmAccountEmailChange({ token: pending.proposed })).rejects.toMatchObject({ code: 'INVALID_EMAIL_CONFIRMATION' })
    await expect(authenticateAccess(session.access_token)).rejects.toMatchObject({ status: 401 })
    expect((await prisma.authEmailDelivery.findMany({ where: { user_id: session.user.id } })).every(delivery => delivery.encrypted_payload === null)).toBe(true)
    await expectPushRevoked(device.id)
  }, 15000)
  it('preserves the original account if another registration claims the proposed address before final confirmation', async () => {
    const session = await account(), pending = await change(session.user.id)
    await confirmAccountEmailChange({ token: pending.old })
    const other = await registerAccount({ email: pending.newEmail, password }); users.push(other.user.id)
    await expect(confirmAccountEmailChange({ token: pending.proposed })).rejects.toMatchObject({ code: 'EMAIL_UNAVAILABLE' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).email).toBe(session.user.email)
    expect(await prisma.emailChange.findUnique({ where: { id: pending.result.pending.id } })).toMatchObject({ status: 'pending', new_confirmed_at: null })
  }, 15000)
  it('returns identical reset acknowledgements for known/unknown accounts and queues only encrypted known-account delivery', async () => {
    const session = await account()
    expect(await requestPasswordReset(session.user.email)).toEqual(await requestPasswordReset(`${randomUUID()}@fixture.invalid`))
    expect(calls).toHaveLength(0)
    const job = await prisma.authEmailDelivery.findFirstOrThrow({ where: { user_id: session.user.id, kind: 'password_reset' } })
    expect(job.encrypted_payload).not.toContain(session.user.email)
    expect(JSON.stringify(await getAccountSecurity(session.user.id))).not.toContain('encrypted_payload')
    const rawToken = /Reset code: ([A-Za-z0-9_-]{43})/.exec(openAuthEmail(job.id, job.kind, job.encrypted_payload!).text)![1]
    const reset = await prisma.passwordReset.findUniqueOrThrow({ where: { token_hash: tokenHash(rawToken) } })
    expect(JSON.stringify(reset)).not.toContain(rawToken)
    expect(JSON.stringify(await prisma.notification.findMany({ where: { user_id: session.user.id } }))).not.toContain(rawToken)
  })
  it('purges accepted delivery ciphertext and never sends an already accepted job again', async () => {
    const session = await account(); await requestPasswordReset(session.user.email)
    const job = await prisma.authEmailDelivery.findFirstOrThrow({ where: { user_id: session.user.id, kind: 'password_reset' } })
    expect(await processAuthEmailDelivery(job.id)).toBe(true)
    expect(await processAuthEmailDelivery(job.id)).toBe(false)
    expect(await prisma.authEmailDelivery.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'sent', encrypted_payload: null, provider_message_id: sent.get(`rentral-auth:${job.id}`)!.id })
    expect(calls).toHaveLength(1)
  })
  it('recovers an unknown email acknowledgement with the identical payload/key within the idempotency window', async () => {
    const session = await account(); await requestPasswordReset(session.user.email)
    const job = await prisma.authEmailDelivery.findFirstOrThrow({ where: { user_id: session.user.id, kind: 'password_reset' } })
    loseAcknowledgement = true
    expect(await processAuthEmailDelivery(job.id)).toBe(false)
    expect(await prisma.authEmailDelivery.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'uncertain', attempts: 1 })
    await prisma.authEmailDelivery.update({ where: { id: job.id }, data: { next_attempt_at: new Date(Date.now() - 1000) } })
    loseAcknowledgement = false
    vi.stubEnv('AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY', key); vi.stubEnv('AUTH_EMAIL_ENCRYPTION_KEY', Buffer.alloc(32, 32).toString('base64url'))
    expect(await processAuthEmailDelivery(job.id)).toBe(true)
    expect(calls[0]).toEqual(calls[1])
    expect(sent.size).toBe(1)
  }, 15000)
  it('purges expired ciphertext and quarantines the final crashed attempt without external calls', async () => {
    const session = await account(); await requestPasswordReset(session.user.email)
    const job = await prisma.authEmailDelivery.findFirstOrThrow({ where: { user_id: session.user.id, kind: 'password_reset' } })
    await prisma.authEmailDelivery.update({ where: { id: job.id }, data: { expires_at: new Date(Date.now() - 1) } })
    vi.stubEnv('AUTH_EMAIL_ENABLED', 'false')
    expect((await runAuthEmailDeliveryBatch()).expired).toBeGreaterThanOrEqual(1)
    expect(await prisma.authEmailDelivery.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'expired', encrypted_payload: null })
    expect(calls).toHaveLength(0)
    await prisma.authEmailDelivery.update({ where: { id: job.id }, data: { expires_at: new Date(Date.now() + 60000), encrypted_payload: job.encrypted_payload,
      status: 'sending', attempts: 8, lease_token: randomUUID(), lease_expires_at: new Date(Date.now() - 1000) } })
    await runAuthEmailDeliveryBatch()
    expect(await prisma.authEmailDelivery.findUnique({ where: { id: job.id } })).toMatchObject({ status: 'dead_letter', attempts: 8, last_error_code: 'RETRY_LIMIT' })
    expect(calls).toHaveLength(0)
  })
  it('keeps session enumeration and revocation scoped to the authenticated account', async () => {
    const first = await account(), second = await loginAccount({ email: first.user.email, password }), other = await account()
    const device = await pushDevice(first.user.id), otherDevice = await pushDevice(other.user.id)
    const firstId = (await accessClaims(first.access_token)).sessionId, secondId = (await accessClaims(second.access_token)).sessionId, otherId = (await accessClaims(other.access_token)).sessionId
    const sessions = await getAccountSessions(first.user.id, firstId)
    expect(sessions.items.map(session => session.id).sort()).toEqual([firstId, secondId].sort())
    expect(sessions.items.find(session => session.id === firstId)?.current).toBe(true)
    expect(JSON.stringify(sessions)).not.toMatch(/refresh_hash|password_hash/)
    await revokeAccountSessions(first.user.id, otherId)
    expect(await prisma.pushDevice.findUnique({ where: { id: device.id } })).toMatchObject({ status: 'active' })
    expect((await authenticateAccess(other.access_token)).user.id).toBe(other.user.id)
    await revokeAccountSessions(first.user.id)
    await expect(authenticateAccess(first.access_token)).rejects.toMatchObject({ status: 401 })
    await expect(authenticateAccess(second.access_token)).rejects.toMatchObject({ status: 401 })
    await expectPushRevoked(device.id)
    expect(await prisma.pushDevice.findUnique({ where: { id: otherDevice.id } })).toMatchObject({ status: 'active' })
  }, 15000)
  it('retains explicit private development recovery when email delivery is disabled', async () => {
    const session = await account()
    vi.stubEnv('AUTH_EMAIL_ENABLED', 'false'); vi.stubEnv('AUTH_DEV_EMAIL_OUTBOX', 'true')
    expect(await requestPasswordReset(session.user.email)).toEqual({ delivery: 'development-outbox' })
    const names = await readdir(join(storage, 'mail-outbox'))
    const text = await readFile(join(storage, 'mail-outbox', names.at(-1)!), 'utf8')
    expect(text).toContain(session.user.email)
    expect(text).toMatch(/Reset code: [A-Za-z0-9_-]{43}/)
    expect(calls).toHaveLength(0)
  })
  it('revokes an expired proof’s same SID after refresh rotation and preserves a different session/device', async () => {
    const session = await account(), other = await loginAccount({ email: session.user.email, password })
    const sid = (await accessClaims(session.access_token)).sessionId, otherSid = (await accessClaims(other.access_token)).sessionId
    const device = await pushDevice(session.user.id, sid), otherDevice = await pushDevice(session.user.id, otherSid)
    const rotated = await refreshSession(session.refresh_token), proof = await expiredLogoutProof(session.user.id, sid)
    expect(await revokeRefreshToken(session.refresh_token)).toBe(false)
    await expect(authenticateAccess(proof)).rejects.toMatchObject({ status: 401 })
    expect(await revokeAccessToken(proof)).toBe(true)
    await expectPushRevoked(device.id)
    await expect(authenticateAccess(rotated.access_token)).rejects.toMatchObject({ status: 401 })
    expect((await authenticateAccess(other.access_token)).user.id).toBe(session.user.id)
    expect(await prisma.pushDevice.findUnique({ where: { id: otherDevice.id } })).toMatchObject({ status: 'active' })
  }, 15000)
  it('serializes a concurrent refresh/logout so no winning refresh or bound push address remains active', async () => {
    const session = await account(), sid = (await accessClaims(session.access_token)).sessionId
    const device = await pushDevice(session.user.id, sid), proof = await expiredLogoutProof(session.user.id, sid)
    const results = await Promise.allSettled([refreshSession(session.refresh_token), revokeAccessToken(proof)])
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: true })
    if (results[0].status === 'fulfilled') await expect(authenticateAccess(results[0].value.access_token)).rejects.toMatchObject({ status: 401 })
    await expect(authenticateAccess(session.access_token)).rejects.toMatchObject({ status: 401 })
    await expectPushRevoked(device.id)
  }, 15000)
  it('soft-closes public identity and sessions while retaining completed booking and payment history', async () => {
    const session = await account(), other = await account(), pending = await change(session.user.id)
    const listing = await prisma.listing.create({ data: { lister_id: session.user.id, category: 'house', listing_status: 'active', base_rent_amount: 500000, text_address: 'Owned fixture public asset' } })
    const booking = await prisma.booking.create({ data: { listing_id: listing.id, seeker_id: other.user.id, lister_id: session.user.id, kind: 'rental', status: 'completed', starts_at: new Date(Date.now() - 86400000), ends_at: new Date(Date.now() - 1000), amount_kobo: 500000n, currency: 'NGN' } })
    const payment = await prisma.paymentIntent.create({ data: { user_id: other.user.id, booking_id: booking.id, kind: 'booking', status: 'succeeded', reference: `closed-${randomUUID()}`, idempotency_key: randomUUID(), amount_kobo: 500000n, customer_email: other.user.email, provider_environment: 'test' } })
    await prisma.user.update({ where: { id: session.user.id }, data: { bio: 'Public fixture bio', avatar_url: `/api/v1/files/profile-avatars/${session.user.id}/avatar.png`, staff_role: 'finance' } })
    const device = await prisma.pushDevice.create({ data: { user_id: session.user.id, installation_id: randomUUID(), token_hash: tokenHash(randomUUID()), proof_hash: tokenHash(randomUUID()), platform: 'android', status: 'active', token_ciphertext: 'owned-not-live-cipher', token_iv: 'owned-iv', token_tag: 'owned-tag', opted_in_at: new Date() } })
    const notification = await prisma.notification.create({ data: { user_id: session.user.id, kind: 'account', title: 'Owned closure fixture', body: 'No external delivery occurs.' } })
    await prisma.pushDelivery.create({ data: { user_id: session.user.id, device_id: device.id, notification_id: notification.id, status: 'pending' } })
    await closeAccount(session.user.id, { currentPassword: password })
    expect(await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).toMatchObject({ closed_at: expect.any(Date), username: null, bio: null, avatar_url: null, staff_role: null })
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ listing_status: 'suspended', archived_at: expect.any(Date) })
    expect(await prisma.booking.findUnique({ where: { id: booking.id } })).not.toBeNull()
    expect(await prisma.paymentIntent.findUnique({ where: { id: payment.id } })).not.toBeNull()
    expect(await prisma.pushDevice.findUnique({ where: { id: device.id } })).toMatchObject({ status: 'revoked', token_ciphertext: null, token_iv: null, token_tag: null })
    expect(await prisma.pushDelivery.findFirst({ where: { device_id: device.id } })).toMatchObject({ status: 'skipped' })
    await expect(authenticateAccess(session.access_token)).rejects.toMatchObject({ status: 401 })
    await expect(loginAccount({ email: session.user.email, password })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    await expect(confirmAccountEmailChange({ token: pending.old })).rejects.toMatchObject({ code: 'INVALID_EMAIL_CONFIRMATION' })
    const before = await prisma.passwordReset.count({ where: { user_id: session.user.id } })
    await requestPasswordReset(session.user.email)
    expect(await prisma.passwordReset.count({ where: { user_id: session.user.id } })).toBe(before)
  }, 15000)
  it('refuses closure with active obligations and permits it after explicit cancellation', async () => {
    const session = await account(), host = await account()
    const listing = await prisma.listing.create({ data: { lister_id: host.user.id, category: 'car', listing_status: 'active', base_rent_amount: 10000 } })
    const booking = await prisma.booking.create({ data: { listing_id: listing.id, seeker_id: session.user.id, lister_id: host.user.id, kind: 'rental', status: 'requested', starts_at: new Date(Date.now() + 86400000), ends_at: new Date(Date.now() + 172800000), amount_kobo: 1000000n } })
    await expect(closeAccount(session.user.id, { currentPassword: password })).rejects.toMatchObject({ code: 'ACCOUNT_HAS_OBLIGATIONS' })
    expect((await authenticateAccess(session.access_token)).user.id).toBe(session.user.id)
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'cancelled' } })
    await closeAccount(session.user.id, { currentPassword: password })
  }, 15000)
  it('serializes an actual draft save against closure so no public listing survives a closed owner', async () => {
    const session = await account()
    const result = await Promise.allSettled([
      saveDraftForUser(session.user.id, { category: 'car', wizardStep: 'details', metadata: {}, address: 'Owned fixture', basePrice: '10000' }),
      closeAccount(session.user.id, { currentPassword: password }),
    ])
    expect(result[1].status).toBe('fulfilled')
    expect(result[0].status).toBe('fulfilled')
    if (result[0].status === 'fulfilled') {
      expect(result[0].value.success || ('code' in result[0].value && result[0].value.code === 'ACCOUNT_UNAVAILABLE')).toBe(true)
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).toMatchObject({ closed_at: expect.any(Date) })
    expect(await prisma.listing.count({ where: { lister_id: session.user.id, listing_status: { not: 'suspended' } } })).toBe(0)
    const after = await saveDraftForUser(session.user.id, { category: 'car', wizardStep: 'details', metadata: {} })
    expect(after).toMatchObject({ success: false, code: 'ACCOUNT_UNAVAILABLE' })
    expect(after).not.toHaveProperty('uncertain', true)
  }, 15000)
  it('serializes real booking creation against host closure without an orphaned active booking', async () => {
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
    const host = await account(), seeker = await account()
    const listing = await prisma.listing.create({ data: { lister_id: host.user.id, category: 'car', listing_status: 'active', base_rent_amount: 10000, asset_metadata: { pricePeriod: 'day' } } })
    const result = await Promise.allSettled([
      requestBooking(seeker.user.id, { listingId: listing.id, kind: 'rental', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 172800000).toISOString() }),
      closeAccount(host.user.id, { currentPassword: password }),
    ])
    const closed = (await prisma.user.findUniqueOrThrow({ where: { id: host.user.id } })).closed_at
    const active = await prisma.booking.count({ where: { listing_id: listing.id, status: 'requested' } })
    expect(Boolean(closed) && active > 0).toBe(false)
    expect(result.some(item => item.status === 'fulfilled')).toBe(true)
    if (closed) await expect(withTransaction(tx => assertActiveAccounts(tx, [host.user.id, seeker.user.id]))).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
    else expect(result[1]).toMatchObject({ status: 'rejected', reason: { code: 'ACCOUNT_HAS_OBLIGATIONS' } })
  }, 15000)
  it('exports bounded own authored messages and never exports credentials, GPS or another sender’s body', async () => {
    const session = await account(), host = await account()
    const listing = await prisma.listing.create({ data: { lister_id: host.user.id, category: 'car', listing_status: 'active' } })
    const conversation = await prisma.conversation.create({ data: { listing_id: listing.id, seeker_id: session.user.id, lister_id: host.user.id } })
    for (const body of ['first own message', 'second own message']) await prisma.message.create({ data: { sender_id: session.user.id, conversation_id: conversation.id, body, client_id: randomUUID() } })
    await prisma.message.create({ data: { sender_id: host.user.id, conversation_id: conversation.id, body: 'COUNTERPARTY_PRIVATE_BODY', client_id: randomUUID() } })
    const first = await exportAccountPage(session.user.id, { resource: 'messages', limit: 1 })
    if (!('items' in first)) throw new Error('Expected export page.')
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toEqual(expect.any(String))
    const second = await exportAccountPage(session.user.id, { resource: 'messages', limit: 1, cursor: first.nextCursor })
    if (!('items' in second)) throw new Error('Expected export page.')
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull()
    expect(second.items[0].id).not.toBe(first.items[0].id)
    const profile = await exportAccountPage(session.user.id, { resource: 'profile' })
    expect(JSON.stringify([first, second, profile])).not.toMatch(/COUNTERPARTY_PRIVATE_BODY|password_hash|refresh_hash|token_hash|geometry|handshake_code/)
  }, 15000)
})
