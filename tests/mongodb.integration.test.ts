import { randomUUID } from 'node:crypto'
import { MongoClient, Long } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import prisma from '@/lib/db'
import { localMongoDatabaseName, localMongoUrl } from '@/lib/database/config'
import { ensureMongoIndexes } from '@/lib/database/indexes'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { closeMongoReadiness } from '@/lib/database/readiness'
import { changeBookingStatus } from '@/lib/bookings/service'
import { holdCreditCanConfirm } from '@/lib/bookings/hold-credit'
import { recordVerifiedPayment } from '@/lib/payments/service'
import { insertBalancedLedger } from '@/lib/payments/ledger'
import { getMarketInsights } from '@/lib/analytics/insights'
import { beginConversation, persistMessage } from '@/lib/messaging/service'
import { authenticateAccess, loginAccount, refreshSession, registerAccount, resetPassword, revokeSession } from '@/lib/auth/service'
import { accessClaims, accessToken, opaqueToken, tokenHash } from '@/lib/auth/token'
import { verifyPassword } from '@/lib/auth/password'
import { getDiscoveryListings } from '@/lib/discovery'
import { parseDiscoveryFilters } from '@/lib/discovery-policy'

const uri = process.env.RENTRAL_TEST_MONGO_URI
const owner = process.env.RENTRAL_TEST_MONGO_OWNER
const fixture = describe.skipIf(!uri)

fixture('owned isolated MongoDB replica fixture', () => {
  let client: MongoClient
  const hostId = randomUUID()
  const renterId = randomUUID()
  const otherRenterId = randomUUID()
  const listingId = randomUUID()
  const startsAt = new Date('2035-01-01T10:00:00Z')
  const endsAt = new Date('2035-01-02T10:00:00Z')

  beforeAll(async () => {
    if (!uri || !owner || !/^[a-f0-9]{32}$/.test(owner) || localMongoDatabaseName(uri) !== `rentral_test_${owner}` || process.env.MONGODB_URL !== uri || process.env.DATABASE_URL !== uri) {
      throw new Error('Use the owned MongoDB fixture runner; integration tests never use the application database.')
    }
    vi.stubEnv('JWT_SECRET', 'owned-mongo-fixture-only-jwt-signing-key-at-least-32-bytes')
    client = new MongoClient(localMongoUrl(uri), { serverSelectionTimeoutMS: 3000 })
    await client.connect()
    const db = client.db(localMongoDatabaseName(uri))
    if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error('Fixture database must be new and empty.')
    await db.collection<{ _id: string }>('_FixtureOwnership').insertOne({ _id: owner })
    await expect(prisma.user.create({ data: { email: 'unprepared@fixture.invalid' } })).rejects.toMatchObject({ code: 'DATABASE_SETUP_REQUIRED' })
    expect(await db.collection('User').countDocuments()).toBe(0)
    await ensureMongoIndexes(db)
    await ensureMongoIndexes(db)
    for (const id of [hostId, renterId, otherRenterId]) await prisma.user.create({ data: { id, email: `${id}@fixture.invalid` } })
    await prisma.listing.create({ data: { id: listingId, lister_id: hostId, category: 'car', listing_status: 'active', base_rent_amount: 50000 } })
  }, 20000)

  afterAll(async () => { await prisma.$disconnect(); await closeMongoReadiness(); await client?.close(); vi.unstubAllEnvs() })

  it('permits multiple null handles but rejects duplicate non-null handles', async () => {
    await prisma.user.update({ where: { id: hostId }, data: { username: 'fixture_host' } })
    await expect(prisma.user.update({ where: { id: renterId }, data: { username: 'fixture_host' } })).rejects.toMatchObject({ code: 'P2002' })
  })

  it('serializes overlapping reservations through the common listing write', async () => {
    async function reserve(seekerId: string): Promise<string> {
      return withTransaction(async tx => {
        if (!await lockRecord(tx, 'listing', listingId)) throw new Error('NOT_FOUND')
        const overlap = await tx.booking.findFirst({ where: { listing_id: listingId, kind: 'rental', status: 'confirmed', starts_at: { lt: endsAt }, ends_at: { gt: startsAt } }, select: { id: true } })
        if (overlap) throw new Error('BOOKING_CONFLICT')
        const booking = await tx.booking.create({ data: { listing_id: listingId, seeker_id: seekerId, lister_id: hostId, kind: 'rental', status: 'confirmed', starts_at: startsAt, ends_at: endsAt, amount_kobo: BigInt(5000000) } })
        return booking.id
      })
    }
    const results = await Promise.allSettled([reserve(renterId), reserve(otherRenterId)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(await prisma.booking.count({ where: { listing_id: listingId, status: 'confirmed' } })).toBe(1)
  }, 20000)

  it('keeps capture geometry outside default listing reads', async () => {
    await prisma.listingLocation.create({ data: { id: listingId, listing_id: listingId, geometry: { type: 'Point', coordinates: [3.421, 6.447] } } })
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })
    expect(JSON.stringify(listing)).not.toContain('coordinates')
    expect(JSON.stringify(listing)).not.toContain('privateLocation')
    expect(await prisma.listingLocation.findUnique({ where: { listing_id: listingId } })).not.toBeNull()
  })

  it('retains saved-listing uniqueness after changing the primary key', async () => {
    await prisma.savedListing.create({ data: { user_id: renterId, listing_id: listingId } })
    await expect(prisma.savedListing.create({ data: { user_id: renterId, listing_id: listingId } })).rejects.toMatchObject({ code: 'P2002' })
  })

  it('inherits append-only protection inside interactive transactions', async () => {
    const audit = await prisma.adminAudit.create({ data: { actor_id: hostId, action: 'fixture', target_type: 'listing', target_id: listingId, reason: 'Owned fixture verification' } })
    await expect(withTransaction(tx => tx.adminAudit.update({ where: { id: audit.id }, data: { reason: 'tamper' } }))).rejects.toThrow('APPEND_ONLY_RECORD')
    await expect(prisma.user.update({ where: { id: hostId }, data: { adminActions: { update: { where: { id: audit.id }, data: { reason: 'nested tamper' } } } } })).rejects.toThrow('APPEND_ONLY_RECORD')
    await expect(prisma.user.update({ where: { id: renterId }, data: { adminActions: { connect: { id: audit.id } } } })).rejects.toThrow('APPEND_ONLY_RECORD')
    expect((await prisma.adminAudit.findUniqueOrThrow({ where: { id: audit.id } })).reason).toBe('Owned fixture verification')
  })

  it('enforces period and money checks for writes outside Prisma', async () => {
    const db = client.db(localMongoDatabaseName(uri))
    await expect(db.collection<{ _id: string; [key: string]: unknown }>('Booking').insertOne({
      _id: randomUUID(), listing_id: listingId, seeker_id: renterId, lister_id: hostId,
      kind: 'rental', status: 'requested', starts_at: endsAt, ends_at: startsAt, amount_kobo: Long.fromNumber(10000),
    })).rejects.toMatchObject({ code: 121 })
  })

  it('allows exactly one real host acceptance of overlapping rental requests without KYC', async () => {
    const asset = await prisma.listing.create({ data: { lister_id: hostId, category: 'car', listing_status: 'active', base_rent_amount: 50000 } })
    const requests = []
    for (const seeker_id of [renterId, otherRenterId]) requests.push(await prisma.booking.create({ data: {
      listing_id: asset.id, seeker_id, lister_id: hostId, kind: 'rental', status: 'requested', starts_at: startsAt, ends_at: endsAt,
      amount_kobo: BigInt(5000000), pricing_snapshot: { period: 'day', days: 1, baseKobo: '5000000', totalKobo: '5000000', fees: [] },
    } }))
    const results = await Promise.allSettled(requests.map(request => changeBookingStatus(hostId, request.id, 'accept')))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(await prisma.booking.count({ where: { listing_id: asset.id, status: 'awaiting_payment' } })).toBe(1)
    expect(await prisma.booking.count({ where: { listing_id: asset.id, status: 'requested' } })).toBe(1)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: renterId } })).kyc_verified).toBe(false)
  }, 20000)

  it('settles concurrent duplicate provider receipts into one payment and one balanced immutable ledger', async () => {
    const asset = await prisma.listing.create({ data: { lister_id: hostId, category: 'car', listing_status: 'active', base_rent_amount: 50000 } })
    const booking = await prisma.booking.create({ data: { listing_id: asset.id, seeker_id: renterId, lister_id: hostId,
      kind: 'inspection', status: 'awaiting_payment', starts_at: startsAt, ends_at: endsAt,
      amount_kobo: BigInt(300000), expires_at: new Date(Date.now() + 600000) } })
    const payment = await prisma.paymentIntent.create({ data: { booking_id: booking.id, user_id: renterId, kind: 'booking',
      reference: randomUUID(), idempotency_key: `fixture:${randomUUID()}`, amount_kobo: BigInt(300000), currency: 'NGN',
      customer_email: `${renterId}@fixture.invalid`, status: 'pending' } })
    const verified = { id: randomUUID(), reference: payment.reference, amount: 300000, currency: 'NGN', status: 'success',
      customer: { email: payment.customer_email }, metadata: { rentral_payment_id: payment.id, rentral_user_id: renterId } }
    await Promise.all([recordVerifiedPayment(verified, 'owned-fixture-receipt'), recordVerifiedPayment(verified, 'owned-fixture-receipt')])
    expect(await prisma.paymentEvent.count({ where: { payment_id: payment.id } })).toBe(1)
    const ledger = await prisma.ledgerTransaction.findUniqueOrThrow({ where: { payment_id: payment.id }, include: { entries: true } })
    expect(ledger.entries).toHaveLength(2)
    expect(ledger.entries.filter(entry => entry.direction === 'debit').reduce((sum, entry) => sum + entry.amount_kobo, BigInt(0)))
      .toBe(ledger.entries.filter(entry => entry.direction === 'credit').reduce((sum, entry) => sum + entry.amount_kobo, BigInt(0)))
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('confirmed')
    await expect(prisma.ledgerTransaction.update({ where: { id: ledger.id }, data: { kind: 'tamper' } })).rejects.toThrow('APPEND_ONLY_RECORD')
  }, 20000)

  it('allocates a paid hold once across concurrent real rental conversions and keeps the exact balance', async () => {
    const asset = await prisma.listing.create({ data: { lister_id: hostId, category: 'car', listing_status: 'active', base_rent_amount: 100000 } })
    const hold = await prisma.booking.create({ data: { listing_id: asset.id, seeker_id: renterId, lister_id: hostId,
      kind: 'hold', status: 'confirmed', starts_at: startsAt, ends_at: endsAt, amount_kobo: BigInt(2000000),
      expires_at: new Date(Date.now() + 86400000) } })
    const paid = await prisma.paymentIntent.create({ data: { booking_id: hold.id, user_id: renterId, kind: 'booking',
      reference: randomUUID(), idempotency_key: `fixture:${randomUUID()}`, amount_kobo: hold.amount_kobo, currency: 'NGN',
      customer_email: `${renterId}@fixture.invalid`, status: 'succeeded', paid_at: new Date() } })
    await withTransaction(tx => insertBalancedLedger(tx, { payment_id: paid.id, currency: 'NGN', kind: 'provider_collection', entries: [
      { account_key: 'provider:fixture', direction: 'debit', amount_kobo: hold.amount_kobo, currency: 'NGN' },
      { account_key: 'customer:fixture:unsettled', direction: 'credit', amount_kobo: hold.amount_kobo, currency: 'NGN' },
    ] }))
    const rentals = []
    for (let index = 0; index < 2; index += 1) rentals.push(await prisma.booking.create({ data: {
      listing_id: asset.id, seeker_id: renterId, lister_id: hostId, kind: 'rental', status: 'requested',
      starts_at: startsAt, ends_at: endsAt, amount_kobo: BigInt(10000000),
      pricing_snapshot: { period: 'day', days: 1, baseKobo: '10000000', totalKobo: '10000000', fees: [], holdBookingId: hold.id },
    } }))
    const results = await Promise.allSettled(rentals.map(rental => changeBookingStatus(hostId, rental.id, 'accept')))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.holdCreditAllocation.count({ where: { hold_booking_id: hold.id } })).toBe(1)
    const allocation = await prisma.holdCreditAllocation.findUniqueOrThrow({ where: { hold_booking_id: hold.id } })
    const rental = await prisma.booking.findUniqueOrThrow({ where: { id: allocation.rental_booking_id } })
    expect(rental.hold_credit_kobo).toBe(BigInt(2000000))
    expect(rental.amount_kobo - rental.hold_credit_kobo).toBe(BigInt(8000000))
    expect(rental.status).toBe('awaiting_payment')
    expect(await withTransaction(tx => holdCreditCanConfirm(tx, rental, new Date()))).toBe(true)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: hold.id } })).status).toBe('converted')
    await expect(prisma.holdCreditAllocation.delete({ where: { id: allocation.id } })).rejects.toThrow('APPEND_ONLY_RECORD')
  }, 20000)

  it('executes monthly aggregate privacy thresholds against real MongoDB', async () => {
    const createdAt = new Date()
    const oldMonth = new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth() - 1, 15))
    const cohort = { event_type: 'search', category: 'house', intent: 'rent', neighborhood: 'yaba', budget_band: '1m-3m', bedrooms: 2 }
    for (let subject = 0; subject < 9; subject += 1) for (let event = 0; event < 2; event += 1) {
      await prisma.marketEvent.create({ data: { ...cohort, subject_hash: `fixture-subject-${subject}`, dedupe_key: randomUUID(), createdAt } })
    }
    await prisma.marketEvent.create({ data: { ...cohort, subject_hash: 'old-month-subject', dedupe_key: randomUUID(), createdAt: oldMonth } })
    expect(await getMarketInsights()).toEqual([])
    await prisma.marketEvent.create({ data: { ...cohort, subject_hash: 'fixture-subject-9', dedupe_key: randomUUID(), createdAt } })
    expect(await getMarketInsights()).toEqual([{ category: 'house', intent: 'rent', neighborhood: 'yaba', budget_band: '1m-3m', people: 10, searches: 19 }])
  }, 20000)

  it('executes filtered discovery with platform saves and private hold relations enabled', async () => {
    const previousPlatform = process.env.RENTRAL_PLATFORM_ENABLED
    const previousMux = process.env.MUX_ENABLED
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
    vi.stubEnv('MUX_ENABLED', 'false')
    try {
      const asset = await prisma.listing.create({ data: { lister_id: hostId, category: 'car', listing_status: 'active',
        text_address: 'Private Fixture Drive, Lekki, Lagos', base_rent_amount: 50000,
        asset_metadata: { listingTitle: 'Real fixture discovery car', transmission: 'automatic' } } })
      await prisma.savedListing.create({ data: { user_id: renterId, listing_id: asset.id } })
      const expires_at = new Date(Date.now() + 86400000)
      await prisma.booking.create({ data: { listing_id: asset.id, seeker_id: otherRenterId, lister_id: hostId,
        kind: 'hold', status: 'confirmed', starts_at: startsAt, ends_at: endsAt, amount_kobo: BigInt(2000000), expires_at } })
      const result = await getDiscoveryListings(parseDiscoveryFilters({ category: 'car', q: 'Private Fixture Drive', transmission: 'automatic' }), renterId)
      expect(result.listings).toHaveLength(1)
      expect(result.listings[0]).toMatchObject({ id: asset.id, title: 'Real fixture discovery car', saved: true, holdUntil: expires_at.toISOString(), location: 'Lekki, Lagos' })
      expect(JSON.stringify(result)).not.toContain('Private Fixture Drive')
      expect(JSON.stringify(result)).not.toContain(otherRenterId)
    } finally {
      if (previousPlatform === undefined) delete process.env.RENTRAL_PLATFORM_ENABLED
      else process.env.RENTRAL_PLATFORM_ENABLED = previousPlatform
      if (previousMux === undefined) delete process.env.MUX_ENABLED
      else process.env.MUX_ENABLED = previousMux
    }
  }, 20000)

  it('deduplicates concurrent conversation starts and message retries without requiring KYC', async () => {
    const asset = await prisma.listing.create({ data: { lister_id: hostId, category: 'car', listing_status: 'active', base_rent_amount: 50000 } })
    const [first, second] = await Promise.all([beginConversation(renterId, asset.id), beginConversation(renterId, asset.id)])
    expect(first).toBe(second)
    const input = { conversationId: first, clientId: randomUUID(), body: 'A real isolated Mongo fixture message.' }
    const sent = await Promise.all([persistMessage(renterId, input), persistMessage(renterId, input)])
    expect(sent[0]).toBe(sent[1])
    expect(await prisma.message.count({ where: { conversation_id: first } })).toBe(1)
    expect(await prisma.notification.count({ where: { user_id: hostId, href: `/marketplace/messages?id=${first}` } })).toBe(1)
  }, 20000)

  it('registers and signs in with persisted password hashes and exposes only public account fields', async () => {
    const email = `${randomUUID()}@fixture.invalid`
    const password = 'Owned-fixture-password-123!'
    const session = await registerAccount({ email: email.toUpperCase(), password })
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(stored.password_hash).toMatch(/^scrypt-v1:[a-f0-9]{48}:[a-f0-9]{128}$/)
    expect(await verifyPassword(password, stored.password_hash)).toBe(true)
    expect(stored.kyc_verified).toBe(false)
    expect(session.user).toEqual({ id: stored.id, email, is_anonymous: false, user_metadata: {}, app_metadata: {} })
    expect(JSON.stringify(session)).not.toContain('password_hash')
    expect(JSON.stringify(session)).not.toContain(password)
    expect(JSON.stringify(session)).not.toContain(stored.password_hash!)
    const claims = await accessClaims(session.access_token)
    const persistedSession = await prisma.authSession.findUniqueOrThrow({ where: { id: claims.sessionId } })
    expect(persistedSession.user_id).toBe(stored.id)
    expect(persistedSession.refresh_hash).toBe(tokenHash(session.refresh_token))
    expect(persistedSession.refresh_hash).not.toBe(session.refresh_token)
    expect((await authenticateAccess(session.access_token)).user.id).toBe(stored.id)
    expect((await loginAccount({ email, password })).user.id).toBe(stored.id)
    await expect(loginAccount({ email, password: 'Wrong-fixture-password' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 })
    await expect(registerAccount({ email, password })).rejects.toMatchObject({ code: 'ACCOUNT_EXISTS', status: 409 })
    await expect(registerAccount({ email: `${randomUUID()}@fixture.invalid`, password, staff_role: 'admin' })).rejects.toThrow()
  }, 20000)

  it('binds JWT subject and session to a live MongoDB session and current staff permissions', async () => {
    const session = await registerAccount({ email: `${randomUUID()}@fixture.invalid`, password: 'Owned-fixture-password-123!' })
    const claims = await accessClaims(session.access_token)
    await expect(authenticateAccess(await accessToken(randomUUID(), claims.sessionId))).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
    await expect(authenticateAccess(await accessToken(session.user.id, randomUUID()))).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
    await prisma.user.update({ where: { id: session.user.id }, data: { staff_role: 'moderator' } })
    expect((await authenticateAccess(session.access_token)).user.app_metadata).toEqual({ role: 'moderator' })
    await prisma.user.update({ where: { id: session.user.id }, data: { staff_role: null } })
    expect((await authenticateAccess(session.access_token)).user.app_metadata).toEqual({})
    await prisma.authSession.update({ where: { id: claims.sessionId }, data: { expires_at: new Date(Date.now() - 1000) } })
    await expect(authenticateAccess(session.access_token)).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
  }, 20000)

  it('rotates a refresh token once under concurrent requests and denies revoked access and refresh tokens', async () => {
    const session = await registerAccount({ email: `${randomUUID()}@fixture.invalid`, password: 'Owned-fixture-password-123!' })
    const results = await Promise.allSettled([refreshSession(session.refresh_token), refreshSession(session.refresh_token)])
    const winners = results.filter(result => result.status === 'fulfilled')
    expect(winners).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    if (winners[0].status !== 'fulfilled') throw new Error('Missing refresh winner')
    const refreshed = winners[0].value
    expect(refreshed.refresh_token).not.toBe(session.refresh_token)
    await expect(refreshSession(session.refresh_token)).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
    const current = await authenticateAccess(refreshed.access_token)
    const stored = await prisma.authSession.findUniqueOrThrow({ where: { id: current.sessionId } })
    expect(stored.refresh_hash).toBe(tokenHash(refreshed.refresh_token))
    await revokeSession(current.sessionId)
    await expect(authenticateAccess(refreshed.access_token)).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
    await expect(refreshSession(refreshed.refresh_token)).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
  }, 20000)

  it('consumes a reset code once, invalidates other outstanding codes and revokes every old session', async () => {
    const email = `${randomUUID()}@fixture.invalid`
    const password = 'Owned-fixture-password-123!'
    const replacement = 'Owned-fixture-replacement-456!'
    const first = await registerAccount({ email, password })
    const second = await loginAccount({ email, password })
    const resetTokens = [opaqueToken(), opaqueToken()]
    for (const token of resetTokens) await prisma.passwordReset.create({ data: {
      user_id: first.user.id, token_hash: tokenHash(token), used_at: null, expires_at: new Date(Date.now() + 600000),
    } })
    const results = await Promise.allSettled([resetPassword({ token: resetTokens[0], password: replacement }), resetPassword({ token: resetTokens[0], password: replacement })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    for (const session of [first, second]) {
      await expect(authenticateAccess(session.access_token)).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
      await expect(refreshSession(session.refresh_token)).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
    }
    for (const token of resetTokens) {
      expect((await prisma.passwordReset.findUniqueOrThrow({ where: { token_hash: tokenHash(token) } })).used_at).toBeInstanceOf(Date)
      await expect(resetPassword({ token, password })).rejects.toMatchObject({ code: 'INVALID_RESET', status: 400 })
    }
    await expect(loginAccount({ email, password })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 })
    const current = await loginAccount({ email, password: replacement })
    expect((await authenticateAccess(current.access_token)).user.id).toBe(first.user.id)
  }, 20000)
})
