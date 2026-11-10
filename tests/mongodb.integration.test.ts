import { createHmac, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MongoClient, Long, type Document } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import prisma from '@/lib/db'
import { localMongoDatabaseName, localMongoUrl } from '@/lib/database/config'
import { ensureMongoIndexes } from '@/lib/database/indexes'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { closeMongoReadiness } from '@/lib/database/readiness'
import { changeBookingStatus, requestBooking } from '@/lib/bookings/service'
import { saveDraftForUser, saveListingForUser } from '@/lib/listings/service'
import { beginCaptureForOwner, finishCaptureForOwner, sealCaptureForOwner, getCaptureForOwner } from '@/lib/listings/capture'
import { committedMutation, mutationCommand } from '@/lib/database/mutations'
import { holdCreditCanConfirm } from '@/lib/bookings/hold-credit'
import { recordVerifiedPayment, startBookingPayment, startListingFeePayment } from '@/lib/payments/service'
import { moderateListing } from '@/lib/operations/service'
import { addressFingerprint } from '@/lib/listings/spatial'
import { PUBLICATION_FEE_KOBO } from '@/lib/contracts/listing-payments'
import { boundPublicationCheckout } from '@/lib/api/listing-payments'
import { insertBalancedLedger } from '@/lib/payments/ledger'
import { getMarketInsights } from '@/lib/analytics/insights'
import { setAnalyticsConsent, recordConsentedInsight, withdrawAnalyticsHistory, pruneAnalyticsSubjects } from '@/lib/analytics/service'
import { beginConversation, persistMessage } from '@/lib/messaging/service'
import { authenticateAccess, loginAccount, refreshSession, registerAccount, resetPassword, revokeSession } from '@/lib/auth/service'
import { accessClaims, accessToken, opaqueToken, tokenHash } from '@/lib/auth/token'
import { verifyPassword } from '@/lib/auth/password'
import { getDiscoveryListings } from '@/lib/discovery'
import { parseDiscoveryFilters } from '@/lib/discovery-policy'
import { createLocalStorage } from '@/lib/local-storage/core'
import { claimStorageObjects, prepareAvatarStorage, prepareListingStorage, removeStoredObjects, storageObjectId, uploadStoredObject } from '@/lib/storage-claims/service'
import { requestRenewal, confirmRenewal, reviewRenewal, requestTermination, confirmTermination, reviewTermination, releaseTermination } from '@/lib/lifecycle/service'
import { runLeasedJob } from '@/lib/lifecycle/worker'
import { updateMatchingProfile, matchingCandidates, withdrawMatchingProfile } from '@/lib/matching/profiles'
import { requestMatchingConnection, decideMatchingConnection } from '@/lib/matching/connections'
import { persistMatchingMessage, matchingMessages } from '@/lib/matching/messages'
import { matchingConnection } from '@/lib/matching/views'
import { setMatchingBlock } from '@/lib/matching/blocks'
import { matchingReportContext, openMatchingReport, reviewMatchingReport } from '@/lib/matching/reports'
import { restoreMatchingProfile } from '@/lib/matching/operations'
import { createCommercialOrder } from '@/lib/commerce/orders'
import { createSponsoredCampaign, changeSponsoredCampaign, reviewSponsoredCampaign } from '@/lib/commerce/campaigns'
import { insightsAccess } from '@/lib/commerce/views'
import { sponsoredPlacements } from '@/lib/commerce/placements'
import { commercialInsights } from '@/lib/commerce/insights'
import { requestFinancialOperation } from '@/lib/payments/financial'
import { recordConfirmedBookingObservation } from '@/lib/analytics/observations'
import { memberDashboard } from '@/lib/accounts/metrics'
import { getConversationActivity, setConversationActivity, clearConversationActivity } from '@/lib/messaging/activity'
import { markConversationRead } from '@/lib/messaging/service'
import { processListingMedia } from '@/lib/media/processing'
import { applyMediaEvent } from '@/lib/media/webhook'
import { registerPushDevice, revokePushInstallation, pushCapability } from '@/lib/push/devices'
import { pushDispatchBatch, pushReceiptBatch } from '@/lib/push/worker'
import { pushTokenHash } from '@/lib/push/crypto'

const mediaProvider = vi.hoisted(() => ({ create: vi.fn(), upload: vi.fn(), asset: vi.fn() }))
vi.mock('@/lib/media/mux', () => ({ muxClient: () => ({ video: { uploads: { create: mediaProvider.create, retrieve: mediaProvider.upload }, assets: { retrieve: mediaProvider.asset } } }) }))

const uri = process.env.RENTRAL_TEST_MONGO_URI
const owner = process.env.RENTRAL_TEST_MONGO_OWNER
const fixture = describe.skipIf(!uri)

fixture('owned isolated MongoDB replica fixture', () => {
  let client: MongoClient
  let storageRoot: string
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
    const artifacts = resolve('test-results'); await mkdir(artifacts, { recursive: true })
    storageRoot = await mkdtemp(join(artifacts, 'owned-mongo-storage-'))
    vi.stubEnv('RENTRAL_STORAGE_DIR', storageRoot)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:30999')
    for (const id of [hostId, renterId, otherRenterId]) await prisma.user.create({ data: { id, email: `${id}@fixture.invalid` } })
    await prisma.listing.create({ data: { id: listingId, lister_id: hostId, category: 'car', listing_status: 'active', base_rent_amount: 50000 } })
  }, 20000)

  afterAll(async () => {
    await prisma.$disconnect(); await closeMongoReadiness(); await client?.close(); vi.unstubAllEnvs()
    if (storageRoot) {
      if (!resolve(storageRoot).startsWith(`${resolve('test-results')}${sep}`) || !storageRoot.includes('owned-mongo-storage-')) throw new Error('Unsafe fixture storage cleanup')
      await rm(storageRoot, { recursive: true, force: true })
    }
  })

  const movie = new Uint8Array(64)
  movie.set([0, 0, 0, 24, ...Buffer.from('ftypqt  ')])
  const movieStream = () => new Blob([new Uint8Array(movie)]).stream()
  async function sealedRecording(actorId: string) {
    const session = await prisma.authSession.create({ data: { user_id: actorId, refresh_hash: randomUUID(), expires_at: new Date(Date.now() + 3600000) } })
    const id = randomUUID(), reading = () => ({ latitude: 6.45, longitude: 3.4, accuracy: 8, capturedAt: new Date().toISOString(), mocked: false })
    await beginCaptureForOwner(actorId, session.id, { id, reading: reading() })
    await finishCaptureForOwner(actorId, session.id, id, { reading: reading(), durationSeconds: 0.01 })
    const bytes = new Uint8Array(movie); bytes.set(Buffer.from(randomUUID().replaceAll('-', '')), 24)
    const videoPath = `${actorId}/${randomUUID()}/recording.mov`
    await uploadStoredObject(actorId, 'listings-media', videoPath, new Blob([bytes]).stream(), 'video/quicktime')
    const capture = await sealCaptureForOwner(actorId, session.id, id, { videoPath })
    return { id, sessionId: session.id, capture, videoPath }
  }

  it('stores private recording-time evidence once and refuses later coordinate rewrites', async () => {
    const recording = await sealedRecording(hostId)
    const before = await prisma.listingCapture.findUniqueOrThrow({ where: { id: recording.id } })
    expect(before.start_geometry).toEqual({ type: 'Point', coordinates: [3.4, 6.45] })
    expect(before.state).toBe('sealed'); expect(before.video_digest).toMatch(/^[a-f0-9]{64}$/)
    await expect(prisma.listingCapture.update({ where: { id: recording.id }, data: { start_geometry: { type: 'Point', coordinates: [3.4, 6.5] } } })).rejects.toThrow('IMMUTABLE_CAPTURE')
    expect((await prisma.listingCapture.findUniqueOrThrow({ where: { id: recording.id } })).start_geometry).toEqual(before.start_geometry)
    expect(JSON.stringify(await getCaptureForOwner(hostId, recording.id))).not.toMatch(/geometry|latitude|longitude|accuracy|video_digest|session_id/)
    await expect(removeStoredObjects(hostId, 'listings-media', [recording.videoPath])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
  })
  it('never adopts legacy video bytes to fabricate completion evidence for a new recording', async () => {
    const videoPath = `${hostId}/${randomUUID()}/legacy.mov`
    await createLocalStorage(storageRoot).upload('listings-media', videoPath, movieStream(), 'video/quicktime')
    const bytesBefore = await createLocalStorage(storageRoot).info('listings-media', videoPath)
    const session = await prisma.authSession.create({ data: { user_id: hostId, refresh_hash: randomUUID(), expires_at: new Date(Date.now() + 3600000) } })
    const id = randomUUID(), reading = () => ({ latitude: 6.45, longitude: 3.4, accuracy: 8, capturedAt: new Date().toISOString() })
    await beginCaptureForOwner(hostId, session.id, { id, reading: reading() })
    await finishCaptureForOwner(hostId, session.id, id, { reading: reading(), durationSeconds: 0.01 })
    await expect(sealCaptureForOwner(hostId, session.id, id, { videoPath })).rejects.toMatchObject({ code: 'CAPTURE_VIDEO_REJECTED' })
    expect(await prisma.storageObject.findUnique({ where: { id: storageObjectId('listings-media', videoPath) } })).toBeNull()
    await prepareListingStorage(hostId, { videoPath })
    const adopted = await prisma.storageObject.findUniqueOrThrow({ where: { id: storageObjectId('listings-media', videoPath) } })
    expect(adopted.upload_completed_at).toBeNull()
    await expect(sealCaptureForOwner(hostId, session.id, id, { videoPath })).rejects.toMatchObject({ code: 'CAPTURE_VIDEO_REJECTED' })
    expect((await createLocalStorage(storageRoot).info('listings-media', videoPath)).digest).toBe(bytesBefore.digest)
    expect((await prisma.listingCapture.findUniqueOrThrow({ where: { id } })).state).toBe('recorded')
  })

  it('denies foreign-owner and changed-session capture commands without touching the capture revision', async () => {
    const recording = await sealedRecording(hostId)
    const otherSession = await prisma.authSession.create({ data: { user_id: renterId, refresh_hash: randomUUID(), expires_at: new Date(Date.now() + 3600000) } })
    const sameOwnerSession = await prisma.authSession.create({ data: { user_id: hostId, refresh_hash: randomUUID(), expires_at: new Date(Date.now() + 3600000) } })
    const before = await prisma.listingCapture.findUniqueOrThrow({ where: { id: recording.id } })
    const input = { reading: { latitude: 6.45, longitude: 3.4, accuracy: 8, capturedAt: new Date().toISOString() }, durationSeconds: 0.01 }
    await expect(finishCaptureForOwner(renterId, otherSession.id, recording.id, input)).rejects.toMatchObject({ code: 'CAPTURE_NOT_FOUND' })
    await expect(finishCaptureForOwner(hostId, sameOwnerSession.id, recording.id, input)).rejects.toMatchObject({ code: 'CAPTURE_NOT_FOUND' })
    for (const state of [{ revoked_at: new Date(), expires_at: new Date(Date.now() + 3600000) }, { revoked_at: null, expires_at: new Date(Date.now() - 1000) }]) {
      const invalid = await prisma.authSession.create({ data: { user_id: hostId, refresh_hash: randomUUID(), ...state } })
      await expect(beginCaptureForOwner(hostId, invalid.id, { id: randomUUID(), reading: input.reading })).rejects.toMatchObject({ code: 'SESSION_REQUIRED' })
    }
    expect((await prisma.listingCapture.findUniqueOrThrow({ where: { id: recording.id } })).revision).toBe(before.revision)
  })

  it('atomically permits one listing to claim a sealed recording despite concurrent different draft requests', async () => {
    const recording = await sealedRecording(hostId)
    const before = await prisma.listing.count({ where: { lister_id: hostId } })
    const input = { category: 'car', wizardStep: 'details', metadata: {}, captureId: recording.id, videoPath: recording.videoPath }
    const results = await Promise.all([saveDraftForUser(hostId, { ...input, clientId: randomUUID() }), saveDraftForUser(hostId, { ...input, clientId: randomUUID() })])
    expect(results.filter(result => result.success)).toHaveLength(1)
    expect(results.filter(result => !result.success)).toMatchObject([{ success: false, code: 'CAPTURE_REQUIRED' }])
    expect(await prisma.listing.count({ where: { lister_id: hostId } })).toBe(before + 1)
    const winner = results.find(result => result.success)!
    if (!winner.success) throw new Error('Expected one winning capture attachment')
    expect(await prisma.listingCapture.findUniqueOrThrow({ where: { id: recording.id } })).toMatchObject({ listing_id: winner.draftId })
    expect(await prisma.listingLocation.findUniqueOrThrow({ where: { listing_id: winner.draftId } })).toMatchObject({ capture_id: recording.id })
  })

  it('blocks mismatched submission and immutable-coordinate injection, then submits an exact matched capture', async () => {
    const recording = await sealedRecording(hostId)
    const draft = await saveDraftForUser(hostId, { category: 'car', wizardStep: 'details', metadata: {}, captureId: recording.id, videoPath: recording.videoPath })
    if (!draft.success) throw new Error('Expected a retained capture draft')
    const documentPath = `${hostId}/${randomUUID()}/proof.pdf`
    await uploadStoredObject(hostId, 'compliance-docs', documentPath, new Blob(['%PDF-1.7\nOwned capture proof\n%%EOF']).stream(), 'application/pdf')
    const input = { clientId: randomUUID(), draftId: draft.draftId, category: 'car', captureId: recording.id, videoPath: recording.videoPath, documentPath,
      address: 'Owned synthetic building address, Lagos, Nigeria', basePrice: '10000', metadata: { transmission: 'automatic', mileageKm: '0', seats: '4', fuelType: 'petrol' } }
    const previousKey = process.env.GEOAPIFY_API_KEY, previousMux = process.env.MUX_ENABLED
    process.env.GEOAPIFY_API_KEY = 'owned-not-a-real-provider-key'; process.env.MUX_ENABLED = 'false'
    let latitude = 6.5
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (!(url instanceof URL) || url.origin !== 'https://api.geoapify.com') throw new Error('Unexpected network request in isolated capture test')
      return Response.json({ features: [{ geometry: { coordinates: [3.4, latitude] }, properties: { result_type: 'building', country_code: 'ng', rank: { confidence: 0.95 } } }] })
    })
    try {
      expect(await saveListingForUser(hostId, { ...input, lat: 6.45, lng: 3.4 })).toMatchObject({ success: false })
      expect(network).not.toHaveBeenCalled()
      expect(await saveListingForUser(hostId, input)).toMatchObject({ success: false, code: 'ADDRESS_MISMATCH' })
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: draft.draftId } })).listing_status).toBe('draft')
      latitude = 6.45
      let reached!: () => void, release!: () => void
      const geocoderReached = new Promise<void>(resolveWait => { reached = resolveWait })
      const geocoderRelease = new Promise<void>(resolveWait => { release = resolveWait })
      network.mockImplementationOnce(async () => {
        reached(); await geocoderRelease
        return Response.json({ features: [{ geometry: { coordinates: [3.4, 6.45] }, properties: { result_type: 'building', country_code: 'ng', rank: { confidence: 0.95 } } }] })
      })
      const delayedSubmission = saveListingForUser(hostId, input)
      await geocoderReached
      const newerAddress = 'A newer draft address saved while geocoding, Lagos'
      expect(await saveDraftForUser(hostId, { category: 'car', wizardStep: 'details', draftId: draft.draftId, metadata: input.metadata, captureId: recording.id, videoPath: recording.videoPath, address: newerAddress })).toMatchObject({ success: true })
      release()
      expect(await delayedSubmission).toMatchObject({ success: false, code: 'STALE_LISTING' })
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: draft.draftId } })).text_address).toBe(newerAddress)
      expect(await prisma.listingVerification.findUnique({ where: { listing_id: draft.draftId } })).toBeNull()
      expect(await saveListingForUser(hostId, input)).toMatchObject({ success: true, listingId: draft.draftId })
      expect(await prisma.listingVerification.findUniqueOrThrow({ where: { listing_id: draft.draftId } })).toMatchObject({ capture_id: recording.id, address_hash: addressFingerprint(input.address), spatial_status: 'matched', distance_meters: 0 })
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: draft.draftId } })).listing_status).toBe('pending_verification')
    } finally {
      network.mockRestore()
      if (previousKey === undefined) delete process.env.GEOAPIFY_API_KEY; else process.env.GEOAPIFY_API_KEY = previousKey
      if (previousMux === undefined) delete process.env.MUX_ENABLED; else process.env.MUX_ENABLED = previousMux
    }
  })

  it('refuses stale or mocked capture readings before persisting a new capture', async () => {
    const session = await prisma.authSession.create({ data: { user_id: hostId, refresh_hash: randomUUID(), expires_at: new Date(Date.now() + 3600000) } })
    const before = await prisma.listingCapture.count({ where: { owner_id: hostId } })
    for (const sample of [ { latitude: 6.45, longitude: 3.4, accuracy: 8, capturedAt: new Date(Date.now() - 20000).toISOString() },
      { latitude: 6.45, longitude: 3.4, accuracy: 8, capturedAt: new Date().toISOString(), mocked: true } ]) {
      await expect(beginCaptureForOwner(hostId, session.id, { id: randomUUID(), reading: sample })).rejects.toMatchObject({ code: 'GPS_READING_REJECTED' })
    }
    expect(await prisma.listingCapture.count({ where: { owner_id: hostId } })).toBe(before)
  })
  it('commits one draft and immutable receipt for concurrent retries, and never overwrites a later edit', async () => {
    const clientId = randomUUID()
    const input = { clientId, category: 'car', wizardStep: 'category', metadata: {} }
    const before = await prisma.listing.count({ where: { lister_id: hostId } })
    const results = await Promise.all([saveDraftForUser(hostId, input), saveDraftForUser(hostId, input)])
    expect(results.every(result => result.success)).toBe(true)
    const first = results[0]
    if (!first.success) throw new Error('Expected a committed draft')
    expect(results[1]).toMatchObject({ success: true, draftId: first.draftId })
    expect(await prisma.listing.count({ where: { lister_id: hostId } })).toBe(before + 1)
    const command = mutationCommand(hostId, 'listing_draft_save', clientId, input)!
    expect(await committedMutation(command)).toBe(first.draftId)
    await prisma.listing.update({ where: { id: first.draftId }, data: { asset_metadata: { laterEdit: 'preserved' } } })
    expect(await saveDraftForUser(hostId, input)).toMatchObject({ success: true, draftId: first.draftId })
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: first.draftId } })).asset_metadata).toEqual({ laterEdit: 'preserved' })
    expect(await saveDraftForUser(hostId, { ...input, metadata: { differentCommand: true } })).toMatchObject({ success: false, code: 'INVALID_RETRY' })
    const other = await saveDraftForUser(otherRenterId, input)
    expect(other.success).toBe(true)
    if (other.success) expect(other.draftId).not.toBe(first.draftId)
    await expect(prisma.mutationReceipt.deleteMany({ where: { id: command.id } })).rejects.toThrow('APPEND_ONLY_RECORD')
  }, 20000)

  it('serializes duplicate booking commands and never reopens a cancelled booking on replay', async () => {
    const input = { clientId: randomUUID(), listingId, kind: 'rental', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }
    const before = await prisma.booking.count({ where: { listing_id: listingId, seeker_id: renterId } })
    const ids = await Promise.all([requestBooking(renterId, input), requestBooking(renterId, input)])
    expect(ids[0]).toBe(ids[1])
    expect(await prisma.booking.count({ where: { listing_id: listingId, seeker_id: renterId } })).toBe(before + 1)
    expect(await prisma.notification.count({ where: { user_id: hostId, href: `/marketplace/bookings/${ids[0]}` } })).toBe(1)
    await expect(requestBooking(renterId, { ...input, endsAt: new Date(endsAt.getTime() + 86400000).toISOString() })).rejects.toMatchObject({ code: 'INVALID_RETRY' })
    await prisma.booking.update({ where: { id: ids[0] }, data: { status: 'cancelled' } })
    expect(await requestBooking(renterId, { ...input, clientId: input.clientId.toUpperCase() })).toBe(ids[0])
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ids[0] } })).status).toBe('cancelled')
  }, 20000)
  it('upgrades only reviewed legacy financial indexes without editing existing collection history', async () => {
    const db = client.db(localMongoDatabaseName(uri!))
    const payment = await prisma.paymentIntent.create({ data: { user_id: renterId, kind: 'booking',
      reference: `legacy-${randomUUID()}`, idempotency_key: `legacy-${randomUUID()}`, amount_kobo: BigInt(10000),
      customer_email: `${renterId}@fixture.invalid`, provider_transaction_id: '101' } })
    const journal = { _id: randomUUID(), payment_id: payment.id, currency: 'NGN', kind: 'provider_collection', createdAt: new Date() }
    const journals = db.collection<Document & { _id: string }>('LedgerTransaction')
    await journals.insertOne(journal)
    await db.collection('LedgerTransaction').createIndex({ payment_id: 1 }, { name: 'LedgerTransaction_payment_id_key', unique: true })
    await db.collection('PaymentIntent').createIndex({ provider_transaction_id: 1 }, { name: 'PaymentIntent_provider_transaction_id_key', unique: true,
      partialFilterExpression: { provider_transaction_id: { $type: 'string' } } })
    const before = await journals.findOne({ _id: journal._id })
    await ensureMongoIndexes(db)
    expect(await journals.findOne({ _id: journal._id })).toEqual(before)
    expect((await db.collection('LedgerTransaction').indexes()).some(index => index.name === 'LedgerTransaction_payment_id_key')).toBe(false)
    expect((await db.collection('PaymentIntent').indexes()).some(index => index.name === 'PaymentIntent_provider_transaction_id_key')).toBe(false)
    const entries = [{ account_key: 'customer:fixture:unsettled', direction: 'debit', amount_kobo: BigInt(100), currency: 'NGN' },
      { account_key: 'provider:paystack:refunds', direction: 'credit', amount_kobo: BigInt(100), currency: 'NGN' }]
    await withTransaction(tx => insertBalancedLedger(tx, { payment_id: payment.id, currency: 'NGN', kind: 'refund',
      business_key: `financial:${randomUUID()}:settled`, entries }))
    await expect(withTransaction(tx => insertBalancedLedger(tx, { payment_id: payment.id, currency: 'NGN', kind: 'provider_collection', entries }))).rejects.toMatchObject({ code: 'P2002' })
    expect(await prisma.ledgerTransaction.count({ where: { payment_id: payment.id } })).toBe(2)
    for (const environment of ['test', 'live']) await prisma.paymentIntent.create({ data: { user_id: renterId, kind: 'booking',
      reference: `${environment}-${randomUUID()}`, idempotency_key: randomUUID(), amount_kobo: BigInt(100),
      customer_email: `${renterId}@fixture.invalid`, provider_environment: environment, provider_transaction_id: '101' } })
    await expect(prisma.paymentIntent.create({ data: { user_id: renterId, kind: 'booking', reference: randomUUID(), idempotency_key: randomUUID(),
      amount_kobo: BigInt(100), customer_email: `${renterId}@fixture.invalid`, provider_environment: 'test', provider_transaction_id: '101' } })).rejects.toMatchObject({ code: 'P2002' })
  }, 20000)
  async function uploadedMovie(): Promise<string> {
    const path = `${hostId}/${randomUUID()}/video.mov`
    await uploadStoredObject(hostId, 'listings-media', path, movieStream(), 'video/quicktime')
    return path
  }

  it('rejects nonexistent file references before a listing can be created', async () => {
    const count = await prisma.listing.count({ where: { lister_id: hostId } })
    await expect(prepareListingStorage(hostId, { videoPath: `${hostId}/${randomUUID()}/missing.mov` })).rejects.toMatchObject({ status: 404 })
    expect(await prisma.listing.count({ where: { lister_id: hostId } })).toBe(count)
  })

  it('protects a committed walkthrough including case aliases, then cleans up once its reference is released', async () => {
    const path = await uploadedMovie()
    const prepared = await prepareListingStorage(hostId, { videoPath: path })
    const listing = await withTransaction(async tx => {
      await claimStorageObjects(tx, hostId, prepared)
      return tx.listing.create({ data: { lister_id: hostId, category: 'car', listing_status: 'draft', video_path: path } })
    })
    await expect(removeStoredObjects(hostId, 'listings-media', [path.replace('video.mov', 'VIDEO.MOV')])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
    expect((await createLocalStorage(storageRoot).info('listings-media', path)).size).toBe(movie.length)
    await prisma.listing.update({ where: { id: listing.id }, data: { video_path: null } })
    await removeStoredObjects(hostId, 'listings-media', [path])
    expect((await prisma.storageObject.findUniqueOrThrow({ where: { id: storageObjectId('listings-media', path) } })).state).toBe('deleted')
    await expect(prepareListingStorage(hostId, { videoPath: path })).rejects.toMatchObject({ status: 404 })
    await expect(uploadStoredObject(hostId, 'listings-media', path, movieStream(), 'video/quicktime')).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
  }, 20000)

  it('protects pre-claims document and media-job references and rejects an entire mixed deletion batch', async () => {
    const storage = createLocalStorage(storageRoot)
    const document = `${hostId}/${randomUUID()}/deed.pdf`
    await storage.upload('compliance-docs', document, new Blob(['%PDF-1.7\nowned fixture']).stream(), 'application/pdf')
    const asset = await prisma.listing.create({ data: { lister_id: hostId, category: 'car', listing_status: 'draft', document_path: document } })
    await expect(removeStoredObjects(hostId, 'compliance-docs', [document])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
    const jobPath = await uploadedMovie(), orphanPath = await uploadedMovie()
    await prisma.mediaAsset.create({ data: { listing_id: asset.id, source_path: jobPath, mux_asset_id: null, playback_id: null } })
    await expect(removeStoredObjects(hostId, 'listings-media', [orphanPath, jobPath])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
    expect((await storage.info('listings-media', orphanPath)).size).toBe(movie.length)
    expect((await prisma.storageObject.findUniqueOrThrow({ where: { id: storageObjectId('listings-media', orphanPath) } })).state).toBe('available')
  }, 20000)

  it('claims profile avatars atomically and denies deletion of the current photo', async () => {
    const path = `${hostId}/${randomUUID()}.png`
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6XIAAAAASUVORK5CYII=', 'base64')
    await uploadStoredObject(hostId, 'profile-avatars', path, new Blob([png]).stream(), 'image/png')
    const prepared = await prepareAvatarStorage(hostId, `/api/v1/files/profile-avatars/${path}`)
    await withTransaction(async tx => {
      await claimStorageObjects(tx, hostId, prepared.objects)
      await tx.user.update({ where: { id: hostId }, data: { avatar_url: prepared.reference } })
    })
    await expect(removeStoredObjects(hostId, 'profile-avatars', [path])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
    await prisma.user.update({ where: { id: hostId }, data: { avatar_url: null } })
    await removeStoredObjects(hostId, 'profile-avatars', [path])
  }, 20000)

  it('resumes a committed deletion after a crash and does not adopt an expired upload after removal', async () => {
    const path = await uploadedMovie(), id = storageObjectId('listings-media', path)
    await prisma.storageObject.update({ where: { id }, data: { state: 'deleting', operation_token: randomUUID(), lease_expires_at: new Date(0) } })
    await expect(prepareListingStorage(hostId, { videoPath: path })).rejects.toMatchObject({ code: 'FILE_UNAVAILABLE' })
    await removeStoredObjects(hostId, 'listings-media', [path])
    await removeStoredObjects(hostId, 'listings-media', [path])
    expect((await prisma.storageObject.findUniqueOrThrow({ where: { id } })).state).toBe('deleted')
    const unfinished = `${hostId}/${randomUUID()}/late.mov`
    await prisma.storageObject.create({ data: { id: storageObjectId('listings-media', unfinished), bucket: 'listings-media', path: unfinished,
      owner_id: hostId, state: 'uploading', operation_token: randomUUID(), lease_expires_at: new Date(0) } })
    await removeStoredObjects(hostId, 'listings-media', [unfinished])
    await expect(createLocalStorage(storageRoot).upload('listings-media', unfinished, movieStream(), 'video/quicktime')).rejects.toMatchObject({ code: 'FILE_NAME_USED' })
  }, 20000)

  it('serializes attachment against deletion in independent Node processes', async () => {
    const path = await uploadedMovie(), candidate = randomUUID()
    type Result = { success: boolean; code?: string }
    function worker(mode: 'attach' | 'remove') {
      const child = spawn(process.execPath, ['--experimental-transform-types', '--import', pathToFileURL(resolve('tests/helpers/register-typescript.mjs')).href,
        resolve('tests/helpers/storage-claim-worker.mjs'), mode, hostId, path, candidate], { env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      let output = '', stderr = ''
      let signalReady!: () => void, signalResult!: (result: Result) => void, fail!: (error: Error) => void
      const ready = new Promise<void>(accept => { signalReady = accept })
      const result = new Promise<Result>((accept, reject) => { signalResult = accept; fail = reject })
      child.stdout.on('data', chunk => {
        output += String(chunk)
        if (output.includes('READY\n')) signalReady()
        const found = /RESULT:([^\r\n]+)/.exec(output)
        if (found) signalResult(JSON.parse(found[1]))
      })
      child.stderr.on('data', chunk => { stderr += String(chunk) })
      child.on('error', () => fail(new Error('Owned fixture worker could not start.')))
      child.on('exit', code => { if (!output.includes('RESULT:')) fail(new Error(`Owned fixture worker exited without a result (${code}); diagnostics=${stderr.includes('Error') ? 'available' : 'none'}.`)) })
      return { child, ready, result }
    }
    const attach = worker('attach'), remove = worker('remove')
    const timeout = setTimeout(() => { attach.child.kill(); remove.child.kill() }, 30000)
    try {
      await Promise.race([Promise.all([attach.ready, remove.ready]), attach.result.then(value => { if (!value.success) throw new Error(`Attachment worker initialization: ${value.code}`) }), remove.result.then(value => { if (!value.success) throw new Error(`Removal worker initialization: ${value.code}`) })])
      attach.child.stdin.end('GO\n'); remove.child.stdin.end('GO\n')
      const results = await Promise.all([attach.result, remove.result])
      expect(results.filter(result => result.success)).toHaveLength(1)
      const listing = await prisma.listing.findUnique({ where: { id: candidate } })
      if (listing) {
        expect(results[0].success).toBe(true)
        expect(results[1].code).toBe('FILE_IN_USE')
        expect((await createLocalStorage(storageRoot).info('listings-media', path)).size).toBe(movie.length)
      } else {
        expect(results[1].success).toBe(true)
        expect(results[0].code).toBe('FILE_UNAVAILABLE')
        await expect(createLocalStorage(storageRoot).info('listings-media', path)).rejects.toMatchObject({ status: 404 })
      }
    } finally { clearTimeout(timeout); attach.child.kill(); remove.child.kill() }
  }, 40000)

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
    const ledger = await prisma.ledgerTransaction.findFirstOrThrow({ where: { payment_id: payment.id, kind: 'provider_collection' }, include: { entries: true } })
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

  it('keeps one monthly contributor across key rotation and withdraws mapped history without the old key', async () => {
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const secret = 'owned-mongo-analytics-secret-of-at-least-32-characters'
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('RENTRAL_ANALYTICS_ENABLED', 'true'); vi.stubEnv('ANALYTICS_HASH_SECRET', secret)
    const event = { event: 'search', category: 'car', intent: 'rent', neighborhood: 'lekki', budgetBand: 'under-1m' }
    await setAnalyticsConsent(user.id, true)
    expect(await recordConsentedInsight(user.id, event)).toBe(true)
    const month = new Date().toISOString().slice(0, 7)
    const subject = createHmac('sha256', secret).update(`${month}:${user.id}`).digest('hex')
    vi.stubEnv('ANALYTICS_HASH_SECRET', 'a-new-owned-fixture-analytics-key-at-least-32-characters')
    expect(await recordConsentedInsight(user.id, event)).toBe(true)
    expect(await prisma.marketEvent.count({ where: { subject_hash: subject } })).toBe(1)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).analytics_subjects).toEqual([{ month, subject }])
    vi.stubEnv('ANALYTICS_HASH_SECRET', '')
    await withdrawAnalyticsHistory(user.id)
    expect(await prisma.marketEvent.count({ where: { subject_hash: subject } })).toBe(0)
    const withdrawn = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(withdrawn.analytics_consent).toBe(false)
    expect(withdrawn.analytics_subjects).toEqual([])
    vi.stubEnv('RENTRAL_ANALYTICS_ENABLED', 'false')
  }, 20000)

  it('serializes concurrent analytics recording and withdrawal so late events cannot survive opt-out', async () => {
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const secret = 'owned-mongo-analytics-race-secret-at-least-32-characters'
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('RENTRAL_ANALYTICS_ENABLED', 'true'); vi.stubEnv('ANALYTICS_HASH_SECRET', secret)
    const event = { event: 'search', category: 'boat', intent: 'rent', neighborhood: 'lekki', budgetBand: 'under-1m' }
    await setAnalyticsConsent(user.id, true)
    await recordConsentedInsight(user.id, event)
    const subject = createHmac('sha256', secret).update(`${new Date().toISOString().slice(0, 7)}:${user.id}`).digest('hex')
    await Promise.all([recordConsentedInsight(user.id, { ...event, event: 'detail' }), withdrawAnalyticsHistory(user.id)])
    expect(await prisma.marketEvent.count({ where: { subject_hash: subject } })).toBe(0)
    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(userAfter.analytics_consent).toBe(false)
    expect(userAfter.analytics_subjects).toEqual([])
    expect(await recordConsentedInsight(user.id, event)).toBe(false)
    vi.stubEnv('RENTRAL_ANALYTICS_ENABLED', 'false')
  }, 20000)

  it('prunes expired private analytics mappings for inactive opted-out users', async () => {
    const subject = 'b'.repeat(64)
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, analytics_consent: false,
      analytics_subjects: [{ month: '2000-01', subject }] } })
    await prisma.marketEvent.create({ data: { subject_hash: subject, event_type: 'search', category: 'boat', intent: 'rent',
      neighborhood: 'lekki', budget_band: 'unspecified', dedupe_key: randomUUID(), createdAt: new Date('2000-01-01T00:00:00Z') } })
    expect(await pruneAnalyticsSubjects(user.id)).toBe(true)
    expect(await prisma.marketEvent.count({ where: { subject_hash: subject } })).toBe(0)
    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(userAfter.analytics_consent).toBe(false)
    expect(userAfter.analytics_subjects).toEqual([])
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

  it('extends a mutually confirmed lease only after independent staff review, preserving payment and pricing history', async () => {
    const host = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, staff_role: 'moderator' } })
    const staff = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, staff_role: 'moderator' } })
    const asset = await prisma.listing.create({ data: { lister_id: host.id, category: 'house', listing_status: 'active', base_rent_amount: 100000 } })
    const now = Date.now(), originalEnd = new Date(now + 60 * 86400000), requestedEnd = new Date(now + 425 * 86400000)
    const snapshot = { period: 'year', days: 365, baseKobo: '10000000', fees: [], totalKobo: '10000000' }
    const lease = await prisma.booking.create({ data: { listing_id: asset.id, seeker_id: renterId, lister_id: host.id, kind: 'rental', status: 'confirmed',
      starts_at: new Date(now - 300 * 86400000), ends_at: originalEnd, amount_kobo: BigInt(10000000), pricing_snapshot: snapshot } })
    const path = `${renterId}/${randomUUID()}/renewal.pdf`
    await uploadStoredObject(renterId, 'compliance-docs', path, new Blob(['%PDF-1.7\nowned renewal evidence']).stream(), 'application/pdf')
    const id = await requestRenewal(renterId, { bookingId: lease.id, reference: `owned-${randomUUID()}`, recipientRoute: 'direct_landlord', requestedEndsAt: requestedEnd.toISOString(), evidencePath: path })
    const decision = { decision: 'approve', reason: 'Reviewed the mutually confirmed extension and its supporting evidence.' }
    await expect(reviewRenewal(staff.id, id, decision)).rejects.toThrow('host confirmation')
    await confirmRenewal(host.id, id, { decision: 'accept', reason: 'I accept the proposed dates and submitted evidence.' })
    await expect(reviewRenewal(host.id, id, decision)).rejects.toThrow('independent')
    await reviewRenewal(staff.id, id, decision)
    const extended = await prisma.booking.findUniqueOrThrow({ where: { id: lease.id } })
    expect(extended.ends_at).toEqual(requestedEnd)
    expect(extended.amount_kobo).toBe(lease.amount_kobo)
    expect(extended.pricing_snapshot).toEqual(snapshot)
    expect(extended.settlement_status).toBe(lease.settlement_status)
    expect((await prisma.renewal.findUniqueOrThrow({ where: { id } })).status).toBe('approved')
    await expect(removeStoredObjects(renterId, 'compliance-docs', [path])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
    await expect(reviewRenewal(staff.id, id, decision)).rejects.toThrow('already been decided')
  }, 20000)

  it('preserves lease occupancy until an effective reviewed termination is free of active reports', async () => {
    const staff = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, staff_role: 'moderator' } })
    const asset = await prisma.listing.create({ data: { lister_id: hostId, category: 'house', listing_status: 'pending_verification', base_rent_amount: 100000 } })
    const now = Date.now(), originalEnd = new Date(now + 60 * 86400000), requestedEnd = new Date(now - 1000)
    const lease = await prisma.booking.create({ data: { listing_id: asset.id, seeker_id: renterId, lister_id: hostId, kind: 'rental', status: 'confirmed',
      starts_at: new Date(now - 300 * 86400000), ends_at: originalEnd, amount_kobo: BigInt(10000000) } })
    const path = `${renterId}/${randomUUID()}/termination.pdf`
    await uploadStoredObject(renterId, 'compliance-docs', path, new Blob(['%PDF-1.7\nowned termination evidence']).stream(), 'application/pdf')
    const id = await requestTermination(renterId, { bookingId: lease.id, requestedEndAt: requestedEnd.toISOString(), reason: 'Both participants request this evidenced early lease end.', evidencePath: path })
    await confirmTermination(hostId, id, { decision: 'accept', reason: 'I accept the evidenced early lease end.' })
    await reviewTermination(staff.id, id, { decision: 'approve', reason: 'Reviewed the accepted early lease end and its supporting evidence.' })
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: lease.id } })).ends_at).toEqual(originalEnd)
    const report = await prisma.dispute.create({ data: { booking_id: lease.id, opened_by: renterId, reason: 'An owned fixture report blocks release.' } })
    expect(await releaseTermination(id)).toBe(false)
    await prisma.dispute.update({ where: { id: report.id }, data: { status: 'resolved', resolution: 'Owned fixture review completed.' } })
    expect(await releaseTermination(id)).toBe(true)
    expect(await releaseTermination(id)).toBe(false)
    const ended = await prisma.booking.findUniqueOrThrow({ where: { id: lease.id } })
    expect(ended.ends_at).toEqual(requestedEnd)
    expect(ended.status).toBe('completed')
    expect(ended.amount_kobo).toBe(lease.amount_kobo)
    expect(ended.settlement_status).toBe(lease.settlement_status)
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: asset.id } })).listing_status).toBe('pending_verification')
    await expect(removeStoredObjects(renterId, 'compliance-docs', [path])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
  }, 20000)

  it('elects one durable worker lease and keeps the losing worker from executing or advancing its cursor', async () => {
    let started!: () => void, release!: () => void
    const waiting = new Promise<void>(resolve => { started = resolve })
    const barrier = new Promise<void>(resolve => { release = resolve })
    const first = runLeasedJob('notification-email', async ({ heartbeat }) => {
      started(); await barrier; await heartbeat(); return { result: 'winner', cursor: { id: renterId } }
    })
    try {
      await Promise.race([waiting, first.then(() => undefined)])
      const secondOperation = vi.fn()
      expect(await runLeasedJob('notification-email', secondOperation)).toBeNull()
      expect(secondOperation).not.toHaveBeenCalled()
    } finally { release() }
    expect(await first).toBe('winner')
    const state = await prisma.workerState.findUniqueOrThrow({ where: { id: 'notification-email' } })
    expect(state.cursor).toEqual({ id: renterId })
    expect(state.lease_token).toBeNull()
    expect(state.lease_expires_at).toBeNull()
  }, 20000)

  const matchInput = { bio: 'Owned fixture home preferences.', neighborhoods: ['yaba'], monthlyMinKobo: '10000000', monthlyMaxKobo: '20000000',
    smoking: 'smoke_free', pets: 'pet_free', guests: 'occasional', quietHours: 'early', isVisible: true }
  async function matchingPairFixture() {
    const first = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, closed_at: null } })
    const second = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, closed_at: null } })
    const firstProfile = await updateMatchingProfile(first.id, matchInput), secondProfile = await updateMatchingProfile(second.id, matchInput)
    return { first, second, firstProfile, secondProfile }
  }
  async function acceptedMatchingPair() {
    const pair = await matchingPairFixture()
    const contactId = await requestMatchingConnection(pair.first.id, { profileId: pair.secondProfile.id })
    await decideMatchingConnection(pair.second.id, contactId, { decision: 'accept' })
    return { ...pair, contactId }
  }
  it('serializes duplicate matching requests and message retries across real Mongo transactions', async () => {
    const pair = await matchingPairFixture(), request = { profileId: pair.secondProfile.id }
    const requests = await Promise.all([requestMatchingConnection(pair.first.id, request), requestMatchingConnection(pair.first.id, request)])
    expect(requests[0]).toBe(requests[1])
    expect(await prisma.matchConnection.count({ where: { requested_by: pair.first.id } })).toBe(1)
    await expect(persistMatchingMessage(pair.first.id, requests[0], { clientId: randomUUID(), body: 'Must wait for mutual consent.' })).rejects.toMatchObject({ code: 'CONTACT_NOT_ACCEPTED' })
    await expect(decideMatchingConnection(pair.first.id, requests[0], { decision: 'accept' })).rejects.toMatchObject({ code: 'CONTACT_DECISION_UNAVAILABLE' })
    await decideMatchingConnection(pair.second.id, requests[0], { decision: 'accept' })
    const payload = { clientId: randomUUID(), body: 'A fixture-only private conversation.' }
    const sends = await Promise.all([persistMatchingMessage(pair.first.id, requests[0], payload), persistMatchingMessage(pair.first.id, requests[0], payload)])
    expect(sends[0]).toBe(sends[1]); expect(await prisma.matchMessage.count({ where: { connection_id: requests[0] } })).toBe(1)
    await expect(persistMatchingMessage(pair.first.id, requests[0], { ...payload, body: 'A different payload.' })).rejects.toMatchObject({ code: 'INVALID_RETRY' })
    const header = await matchingConnection(pair.second.id, requests[0])
    expect(header).toMatchObject({ unread: true, lastMessage: { own: false, body: payload.body } })
    expect(header.other).not.toHaveProperty('email'); expect(header.other).not.toHaveProperty('user_id')
    expect(await prisma.notification.count({ where: { dedupe_key: `match-message:${sends[0]}` } })).toBe(1)
  }, 30000)

  it('denies current matching reads/sends after withdrawal or blocking while preserving narrow private reporting', async () => {
    const pair = await acceptedMatchingPair(), payload = { clientId: randomUUID(), body: 'Owned fixture evidence only.' }
    const messageId = await persistMatchingMessage(pair.second.id, pair.contactId, payload)
    await withdrawMatchingProfile(pair.second.id)
    await expect(matchingMessages(pair.first.id, pair.contactId, { limit: 20 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(persistMatchingMessage(pair.first.id, pair.contactId, { clientId: randomUUID(), body: 'Denied after withdrawal.' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await matchingReportContext(pair.first.id, pair.contactId)).toEqual({ profileId: pair.secondProfile.id, connectionId: pair.contactId })
    const report = await openMatchingReport(pair.first.id, { profileId: pair.secondProfile.id, connectionId: pair.contactId, messageId, reason: 'An owned fixture report retains access to the selected evidence for review.' })
    expect((await prisma.matchReport.findUniqueOrThrow({ where: { id: report } })).evidence_message_id).toBe(messageId)
    await setMatchingBlock(pair.first.id, pair.secondProfile.id, true)
    await updateMatchingProfile(pair.second.id, matchInput)
    expect((await matchingCandidates(pair.first.id, { limit: 50 })).items.some(profile => profile.id === pair.secondProfile.id)).toBe(false)
    await setMatchingBlock(pair.first.id, pair.secondProfile.id, false)
    expect((await prisma.matchConnection.findUniqueOrThrow({ where: { id: pair.contactId } })).status).toBe('closed')
    await expect(matchingConnection(pair.first.id, pair.contactId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(matchingReportContext(otherRenterId, pair.contactId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  }, 30000)

  it('requires current independent matching reviewers and a different independent reviewer to restore eligibility', async () => {
    const pair = await acceptedMatchingPair()
    const reviewer = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, staff_role: 'moderator' } })
    const secondReviewer = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, staff_role: 'moderator' } })
    await prisma.user.update({ where: { id: pair.first.id }, data: { staff_role: 'moderator' } })
    const id = await openMatchingReport(pair.first.id, { profileId: pair.secondProfile.id, connectionId: pair.contactId, reason: 'A fixture-only concern for independent matching review.' })
    const decision = { decision: 'restrict', reason: 'Independent owned fixture evidence warrants restricting this matching profile.' }
    await expect(reviewMatchingReport(pair.first.id, id, decision)).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' })
    await prisma.user.update({ where: { id: reviewer.id }, data: { staff_role: null } })
    await expect(reviewMatchingReport(reviewer.id, id, decision)).rejects.toThrow('Staff access required')
    await prisma.user.update({ where: { id: reviewer.id }, data: { staff_role: 'moderator' } })
    await reviewMatchingReport(reviewer.id, id, decision)
    expect((await updateMatchingProfile(pair.second.id, matchInput)).moderationStatus).toBe('restricted')
    await expect(matchingMessages(pair.first.id, pair.contactId, { limit: 20 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const reason = 'A different independent reviewer assessed this owned fixture restoration.'
    await expect(restoreMatchingProfile(reviewer.id, pair.secondProfile.id, reason)).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' })
    await restoreMatchingProfile(secondReviewer.id, pair.secondProfile.id, reason)
    expect((await prisma.matchProfile.findUniqueOrThrow({ where: { id: pair.secondProfile.id } }))).toMatchObject({ moderation_status: 'clear', is_visible: true })
    expect((await matchingConnection(pair.first.id, pair.contactId)).status).toBe('accepted')
    expect(await prisma.safetyNotice.count({ where: { subject_id: pair.second.id } })).toBe(0)
  }, 30000)

  it('serializes matching commitments with account closure and still permits reporting a closed contact', async () => {
    const pair = await acceptedMatchingPair()
    await prisma.user.update({ where: { id: pair.second.id }, data: { closed_at: new Date() } })
    await expect(persistMatchingMessage(pair.first.id, pair.contactId, { clientId: randomUUID(), body: 'Must not reach a closed contact.' })).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
    await expect(matchingConnection(pair.first.id, pair.contactId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await matchingCandidates(pair.first.id, { limit: 50 })).items.some(profile => profile.id === pair.secondProfile.id)).toBe(false)
    const id = await openMatchingReport(pair.first.id, { profileId: pair.secondProfile.id, connectionId: pair.contactId, reason: 'A fixture-only report remains available after account closure.' })
    expect((await prisma.matchReport.findUniqueOrThrow({ where: { id } })).subject_id).toBe(pair.second.id)
    expect(await prisma.matchMessage.count({ where: { connection_id: pair.contactId } })).toBe(0)
  }, 30000)

  async function commercialFixture<T>(work: () => Promise<T>): Promise<T> {
    const fixtureValues = { COMMERCIAL_ENABLED: 'true', PAYMENTS_ENABLED: 'true', PAYSTACK_ENVIRONMENT: 'test', PAYSTACK_SECRET_KEY: 'sk_test_owned_commercial_fixture',
      INSIGHTS_PRICE_KOBO: '100025', SPONSORSHIP_PRICE_KOBO: '200000', INSIGHTS_TERM_DAYS: '30', SPONSORSHIP_TERM_DAYS: '7', MUX_ENABLED: 'false',
      RENTRAL_ANALYTICS_ENABLED: 'false', ANALYTICS_HASH_SECRET: 'owned-commercial-analytics-key-at-least32bytes' }
    const previous = Object.fromEntries(Object.keys(fixtureValues).map(key => [key, process.env[key]]))
    try { for (const [key, value] of Object.entries(fixtureValues)) process.env[key] = value; return await work() }
    finally { for (const key of Object.keys(fixtureValues)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] } }
  }
  async function commercialCollection(orderId: string) {
    const order = await prisma.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })
    const user = await prisma.user.findUniqueOrThrow({ where: { id: order.user_id } })
    const payment = await prisma.paymentIntent.create({ data: { order_id: orderId, booking_id: null, listing_id: null, user_id: user.id, kind: 'commercial',
      provider_environment: 'test', reference: `rentral-${randomUUID()}`, idempotency_key: `owned-commercial:${randomUUID()}`, amount_kobo: order.amount_kobo,
      currency: 'NGN', customer_email: user.email, status: 'pending' } })
    const verified = { id: randomUUID(), reference: payment.reference, amount: Number(order.amount_kobo), currency: 'NGN', status: 'success', environment: 'test' as const,
      customer: { email: user.email }, metadata: { rentral_payment_id: payment.id, rentral_user_id: user.id } }
    await recordVerifiedPayment(verified, 'owned-commercial-receipt')
    return { payment, verified }
  }
  it('grants a paid Insights term once and extends a separately authorized manual renewal without duplicate receipt inflation', async () => commercialFixture(async () => {
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const command = { clientId: randomUUID(), kind: 'insights' }
    const [first, retry] = await Promise.all([createCommercialOrder(user.id, command), createCommercialOrder(user.id, command)])
    expect(first).toBe(retry)
    expect((await insightsAccess(user.id)).allowed).toBe(false)
    const { verified } = await commercialCollection(first)
    const term = await prisma.insightEntitlement.findUniqueOrThrow({ where: { order_id: first } })
    expect((await insightsAccess(user.id)).allowed).toBe(true)
    await Promise.all([recordVerifiedPayment(verified, 'owned-duplicate'), recordVerifiedPayment(verified, 'owned-duplicate')])
    expect(await prisma.insightEntitlement.count({ where: { order_id: first } })).toBe(1)
    expect((await prisma.insightEntitlement.findUniqueOrThrow({ where: { order_id: first } })).ends_at).toEqual(term.ends_at)
    const renewal = await createCommercialOrder(user.id, { clientId: randomUUID(), kind: 'insights' })
    await commercialCollection(renewal)
    const next = await prisma.insightEntitlement.findUniqueOrThrow({ where: { order_id: renewal } })
    expect(next.starts_at).toEqual(term.ends_at); expect(next.ends_at.getTime() - next.starts_at.getTime()).toBe(30 * 86400000)
    process.env.PAYSTACK_ENVIRONMENT = 'live'; process.env.PAYSTACK_SECRET_KEY = 'sk_live_owned_commercial_fixture'
    expect((await insightsAccess(user.id)).allowed).toBe(false)
  }), 30000)

  it('serves only paid independently reviewed sponsorship in its fixed window and suppresses pause/withdrawal without moving money', async () => commercialFixture(async () => {
    const id = randomUUID(), user = await prisma.user.create({ data: { email: `${id}@fixture.invalid`, username: `ad_${id.replaceAll('-', '').slice(0, 17)}`, staff_role: 'moderator' } })
    const reviewer = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, staff_role: 'moderator' } })
    const listing = await prisma.listing.create({ data: { lister_id: user.id, category: 'car', listing_status: 'active', base_rent_amount: 1500, asset_metadata: { listingTitle: 'Owned sponsored fixture car', rentalIntent: 'rent' } } })
    const start = new Date(Date.now() + 3600000), input = { clientId: randomUUID(), listingId: listing.id, headline: 'An owned fixture sponsored listing', startsAt: start.toISOString() }
    const campaignId = await createSponsoredCampaign(user.id, input)
    expect(await createSponsoredCampaign(user.id, input)).toBe(campaignId)
    await changeSponsoredCampaign(user.id, campaignId, 'submit')
    const decision = { decision: 'approve', reason: 'Independent review of this owned fixture sponsored listing and its advertised window.' }
    await expect(reviewSponsoredCampaign(user.id, campaignId, decision)).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' })
    await reviewSponsoredCampaign(reviewer.id, campaignId, decision)
    const filters = parseDiscoveryFilters({ category: 'car' }), atStart = new Date(start.getTime() + 1000)
    expect((await sponsoredPlacements(filters, null, atStart)).some(row => row.campaignId === campaignId)).toBe(false)
    const orderId = await createCommercialOrder(user.id, { clientId: randomUUID(), kind: 'sponsorship', campaignId })
    const { payment } = await commercialCollection(orderId)
    expect((await sponsoredPlacements(filters, null, atStart)).find(row => row.campaignId === campaignId)).toMatchObject({ adLabel: 'Sponsored', billingEnvironment: 'test', listing: { id: listing.id } })
    expect((await sponsoredPlacements(parseDiscoveryFilters({ category: 'house' }), null, atStart)).some(row => row.campaignId === campaignId)).toBe(false)
    await changeSponsoredCampaign(user.id, campaignId, 'pause')
    expect((await sponsoredPlacements(filters, null, atStart)).some(row => row.campaignId === campaignId)).toBe(false)
    await changeSponsoredCampaign(user.id, campaignId, 'cancel')
    await expect(changeSponsoredCampaign(user.id, campaignId, 'submit')).rejects.toMatchObject({ code: 'CAMPAIGN_CLOSED' })
    expect((await prisma.paymentIntent.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('succeeded')
    expect(await prisma.ledgerTransaction.count({ where: { payment_id: payment.id } })).toBe(1)
  }), 30000)

  it('revokes paid service atomically when a commercial refund is merely reserved, without claiming it was paid', async () => commercialFixture(async () => {
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const orderId = await createCommercialOrder(user.id, { clientId: randomUUID(), kind: 'insights' })
    const { payment } = await commercialCollection(orderId)
    expect((await insightsAccess(user.id)).allowed).toBe(true)
    const operation = await requestFinancialOperation(user.id, { clientId: randomUUID(), kind: 'refund', paymentId: payment.id, amountKobo: '100000', reason: 'An owned fixture request to review part of the collected commercial payment.' })
    expect(operation.status).toBe('requested')
    expect((await prisma.commercialOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('requires_review')
    expect((await prisma.insightEntitlement.findUniqueOrThrow({ where: { order_id: orderId } })).status).toBe('revoked')
    expect((await insightsAccess(user.id)).allowed).toBe(false)
    expect((await prisma.paymentIntent.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('succeeded')
    expect(await prisma.ledgerTransaction.count({ where: { payment_id: payment.id } })).toBe(1)
  }), 30000)

  it('deduplicates provider-confirmed observations and withholds conversion cohorts independently from interest', async () => commercialFixture(async () => {
    process.env.RENTRAL_ANALYTICS_ENABLED = 'true'; process.env.ANALYTICS_HASH_SECRET = 'owned-commercial-analytics-key-at-least32bytes'
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    await setAnalyticsConsent(user.id, true)
    const listing = await prisma.listing.create({ data: { lister_id: hostId, category: 'car', listing_status: 'active', base_rent_amount: 1000, text_address: 'Yaba, Lagos' } })
    const booking = await prisma.booking.create({ data: { listing_id: listing.id, seeker_id: user.id, lister_id: hostId, kind: 'rental', status: 'awaiting_payment', starts_at: startsAt, ends_at: endsAt,
      amount_kobo: BigInt(100000), expires_at: new Date(Date.now() + 600000) } })
    const payment = await prisma.paymentIntent.create({ data: { booking_id: booking.id, user_id: user.id, kind: 'booking', provider_environment: 'test', reference: `rentral-${randomUUID()}`,
      idempotency_key: randomUUID(), amount_kobo: BigInt(100000), currency: 'NGN', customer_email: user.email, status: 'pending' } })
    const receipt = { id: randomUUID(), reference: payment.reference, amount: 100000, currency: 'NGN', status: 'success', environment: 'test' as const,
      customer: { email: user.email }, metadata: { rentral_payment_id: payment.id, rentral_user_id: user.id } }
    await recordVerifiedPayment(receipt, 'owned-conversion-receipt')
    for (let index = 0; index < 2; index += 1) await withTransaction(async tx => { await lockRecord(tx, 'user', user.id); await recordConfirmedBookingObservation(tx, user.id, booking.id) })
    const own = await prisma.user.findUniqueOrThrow({ where: { id: user.id } }), tokens = own.analytics_subjects as { month: string; subject: string }[]
    expect(tokens).toHaveLength(1)
    expect(await prisma.marketEvent.count({ where: { subject_hash: tokens[0].subject, event_type: 'verified_booking' } })).toBe(1)
    const analyst = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, staff_role: 'analyst' } })
    const coarse = { event_type: 'verified_booking', category: 'boat', intent: 'buy', neighborhood: 'ajah', budget_band: '5m-plus' }
    for (let index = 0; index < 9; index += 1) await prisma.marketEvent.create({ data: { ...coarse, subject_hash: `owned-verified-${index}`, dedupe_key: randomUUID() } })
    expect((await commercialInsights(analyst.id)).items.some(item => item.category === 'boat' && item.event === 'verified_booking')).toBe(false)
    await prisma.marketEvent.create({ data: { ...coarse, subject_hash: 'owned-verified-9', dedupe_key: randomUUID() } })
    expect((await commercialInsights(analyst.id)).items.find(item => item.category === 'boat' && item.event === 'verified_booking')).toMatchObject({ people: 10, observations: 10 })
    expect((await getMarketInsights()).some(item => item.category === 'boat')).toBe(false)
    await withdrawAnalyticsHistory(user.id)
    expect(await prisma.marketEvent.count({ where: { subject_hash: tokens[0].subject } })).toBe(0)
    expect(await withTransaction(async tx => { await lockRecord(tx, 'user', user.id); return recordConfirmedBookingObservation(tx, user.id, booking.id) })).toBe(false)
  }), 30000)

  it('persists participant-scoped activity and monotonic reads without changing inbox activity order', async () => {
    const actor = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const peer = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const asset = await prisma.listing.create({ data: { lister_id: peer.id, category: 'house', listing_status: 'active' } })
    const thread = await prisma.conversation.create({ data: { listing_id: asset.id, seeker_id: actor.id, lister_id: peer.id } })
    const sentAt = new Date(Date.now() - 60000)
    const message = await prisma.message.create({ data: { conversation_id: thread.id, sender_id: peer.id, client_id: randomUUID(), body: 'Private owned fixture message.', createdAt: sentAt } })
    expect(await getConversationActivity(otherRenterId, thread.id)).toBeNull()
    await expect(setConversationActivity(otherRenterId, thread.id, true)).rejects.toThrow('FORBIDDEN')
    await setConversationActivity(peer.id, thread.id, true)
    expect(await getConversationActivity(actor.id, thread.id)).toMatchObject({ otherOnline: true, otherTyping: true, latestMessageId: message.id })
    expect(await markConversationRead(actor.id, thread.id, message.id)).toBe(true)
    const read = await prisma.conversation.findUniqueOrThrow({ where: { id: thread.id } })
    expect(read.updatedAt).toEqual(thread.updatedAt); expect(read.seeker_read_at).toEqual(sentAt)
    const older = await prisma.message.create({ data: { conversation_id: thread.id, sender_id: peer.id, client_id: randomUUID(), body: 'Earlier fixture message.', createdAt: new Date(sentAt.getTime() - 60000) } })
    expect(await markConversationRead(actor.id, thread.id, older.id)).toBe(true)
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: thread.id } })).seeker_read_at).toEqual(sentAt)
    await clearConversationActivity(actor.id, thread.id)
    expect(await getConversationActivity(actor.id, thread.id)).toMatchObject({ otherOnline: true })
    await clearConversationActivity(peer.id, thread.id)
    expect(await getConversationActivity(actor.id, thread.id)).toMatchObject({ otherOnline: false, otherTyping: false })
    await prisma.user.update({ where: { id: peer.id }, data: { closed_at: new Date() } })
    await expect(setConversationActivity(actor.id, thread.id, false)).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
  }, 30000)

  it('computes own dashboard observations from scoped metadata without returning message content or private identifiers', async () => {
    const actor = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const peer = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const outsider = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const asset = await prisma.listing.create({ data: { lister_id: peer.id, category: 'house', listing_status: 'active' } })
    const thread = await prisma.conversation.create({ data: { listing_id: asset.id, seeker_id: actor.id, lister_id: peer.id } })
    const sentAt = new Date(Date.now() - 10 * 60000)
    await prisma.message.createMany({ data: [{ conversation_id: thread.id, sender_id: peer.id, client_id: randomUUID(), body: 'private-incoming-metrics-fixture', createdAt: sentAt },
      { conversation_id: thread.id, sender_id: actor.id, client_id: randomUUID(), body: 'private-reply-metrics-fixture', createdAt: new Date(sentAt.getTime() + 120000) }] })
    await prisma.booking.create({ data: { listing_id: asset.id, seeker_id: actor.id, lister_id: peer.id, kind: 'inspection', status: 'completed', amount_kobo: BigInt(300000),
      starts_at: sentAt, ends_at: new Date(Date.now() - 60000), seeker_checked_in_at: sentAt } })
    const result = await memberDashboard(actor.id)
    expect(result.counts.conversations).toBe(1)
    expect(result.activity.response).toEqual({ averageMinutes: 2, samples: 1, complete: true })
    expect(result.activity.inspections).toEqual({ eligible: 1, recorded: 1, ratePercent: 100, complete: true })
    const serialized = JSON.stringify(result)
    for (const privateValue of [actor.id, peer.id, thread.id, asset.id, 'private-incoming', 'private-reply']) expect(serialized).not.toContain(privateValue)
    const unrelated = await memberDashboard(outsider.id)
    expect(unrelated.counts.conversations).toBe(0); expect(unrelated.activity.response.averageMinutes).toBeNull(); expect(unrelated.activity.inspections.ratePercent).toBeNull()
  }, 30000)

  it('keeps one durable direct-upload lease and preserves a webhook that wins before a late provider snapshot', async () => {
    const actor = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const path = `${actor.id}/${randomUUID()}/walkthrough.mov`
    await uploadStoredObject(actor.id, 'listings-media', path, movieStream(), 'video/quicktime')
    const prepared = await prepareListingStorage(actor.id, { videoPath: path })
    const asset = await withTransaction(async tx => {
      await claimStorageObjects(tx, actor.id, prepared)
      return tx.listing.create({ data: { lister_id: actor.id, category: 'car', listing_status: 'pending_verification', video_path: path } })
    })
    const media = await prisma.mediaAsset.create({ data: { listing_id: asset.id, source_path: path } })
    const uploadId = 'upload-' + randomUUID(), providerAssetId = 'asset-' + randomUUID()
    const settings = { passthrough: media.id, playback_policies: ['signed'] }
    const ready = { id: providerAssetId, upload_id: uploadId, passthrough: media.id, status: 'ready' as const, duration: 90,
      playback_ids: [{ id: 'playback-' + randomUUID(), policy: 'signed' as const }], tracks: [{ type: 'video' as const }] }
    let release!: () => void, entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }), waiting = new Promise<void>(resolve => { entered = resolve })
    mediaProvider.create.mockReset().mockResolvedValue({ id: uploadId })
    mediaProvider.upload.mockReset().mockImplementation(async () => { entered(); await gate; return { id: uploadId, status: 'asset_created', asset_id: providerAssetId, new_asset_settings: settings } })
    mediaProvider.asset.mockReset().mockResolvedValue({ ...ready, status: 'preparing' })
    vi.stubEnv('MUX_ENABLED', 'true')
    for (const key of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) vi.stubEnv(key, 'owned-fixture-only')
    const dispatch = processListingMedia(asset.id, actor.id)
    try {
      await Promise.race([waiting, dispatch.then(() => { throw new Error('Dispatch ended before provider readback.') })])
      expect(await processListingMedia(asset.id, actor.id)).toBe('skipped')
      await applyMediaEvent('event-' + randomUUID(), ready)
    } finally { release(); await dispatch; vi.stubEnv('MUX_ENABLED', 'false') }
    expect(mediaProvider.create).toHaveBeenCalledTimes(1)
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { id: media.id } })).toMatchObject({ mux_upload_id: uploadId, mux_asset_id: providerAssetId, status: 'ready', playback_id: ready.playback_ids[0].id, upload_lease_token: null })
  }, 30000)

  async function pushFixture<T>(work: (projectId: string) => Promise<T>): Promise<T> {
    const projectId = randomUUID(), values = { RENTRAL_PLATFORM_ENABLED: 'true', PUSH_NOTIFICATIONS_ENABLED: 'true',
      PUSH_NOTIFICATIONS_SINCE: '2020-01-01T00:00:00Z', EXPO_PUBLIC_EAS_PROJECT_ID: projectId,
      EXPO_ACCESS_TOKEN: 'owned-push-fixture-access-token', PUSH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64') }
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External requests are blocked in the owned push fixture.'))
    try { for (const [key, value] of Object.entries(values)) process.env[key] = value; return await work(projectId) }
    finally { network.mockRestore(); for (const key of Object.keys(values)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] } }
  }
  async function pushAccount() {
    const session = await registerAccount({ email: `${randomUUID()}@fixture.invalid`, password: 'Owned-fixture-password-938!' })
    return { userId: session.user.id, sid: (await accessClaims(session.access_token)).sessionId }
  }
  function pushEnrollment(projectId: string) {
    return { installationId: randomUUID(), installationSecret: Buffer.alloc(32, 5).toString('base64url'), expoPushToken: `ExpoPushToken[owned_${randomUUID().replaceAll('-', '')}]`,
      projectId, platform: 'android', permissionGranted: true, optIn: true, expectedConsentVersion: 0 }
  }
  it('serializes push enrollment with server logout and revokes a committed binding even when its registration acknowledgement is lost', async () => pushFixture(async projectId => {
    const actor = await pushAccount(), input = pushEnrollment(projectId)
    const results = await Promise.allSettled([registerPushDevice(actor.userId, actor.sid, input), revokeSession(actor.sid)])
    expect(results[1].status).toBe('fulfilled')
    if (results[0].status === 'rejected') expect(results[0].reason).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await prisma.pushDevice.count({ where: { user_id: actor.userId, auth_session_id: actor.sid, status: 'active' } })).toBe(0)
    const committed = await pushAccount(), secondInput = pushEnrollment(projectId)
    const acknowledged = await registerPushDevice(committed.userId, committed.sid, secondInput)
    const stored = await prisma.pushDevice.findUniqueOrThrow({ where: { id: acknowledged.device.id } })
    const serialized = JSON.stringify(acknowledged)
    for (const privateValue of [secondInput.expoPushToken, secondInput.installationSecret, stored.token_hash, stored.proof_hash, stored.token_ciphertext!, committed.sid]) expect(serialized).not.toContain(privateValue)
    // The client may lose this acknowledgement; server logout needs only its SID.
    await revokeSession(committed.sid)
    expect(await prisma.pushDevice.findUniqueOrThrow({ where: { id: stored.id } })).toMatchObject({ status: 'revoked', token_ciphertext: null, token_iv: null, token_tag: null })
    await expect(registerPushDevice(committed.userId, committed.sid, secondInput)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  }), 30000)
  it('makes first installation opt-out win over late enrollment and requires revoked stable proof for account transfer', async () => pushFixture(async projectId => {
    const actor = await pushAccount(), input = pushEnrollment(projectId)
    const results = await Promise.allSettled([registerPushDevice(actor.userId, actor.sid, input), revokePushInstallation(actor.userId, input.installationId)])
    expect(results[1].status).toBe('fulfilled')
    if (results[0].status === 'rejected') expect(results[0].reason).toMatchObject({ code: 'PUSH_CONSENT_CHANGED' })
    expect(await prisma.pushDevice.count({ where: { installation_id: input.installationId, status: 'active' } })).toBe(0)
    await expect(registerPushDevice(actor.userId, actor.sid, input)).rejects.toMatchObject({ code: 'PUSH_CONSENT_CHANGED' })
    const version = (await pushCapability(actor.userId)).consentVersion
    const fresh = await registerPushDevice(actor.userId, actor.sid, { ...input, expectedConsentVersion: version })
    const other = await pushAccount()
    await expect(registerPushDevice(other.userId, other.sid, input)).rejects.toMatchObject({ code: 'PUSH_BINDING_CONFLICT' })
    await revokePushInstallation(actor.userId, input.installationId)
    await expect(registerPushDevice(other.userId, other.sid, { ...input, installationSecret: Buffer.alloc(32, 9).toString('base64url') })).rejects.toMatchObject({ code: 'PUSH_BINDING_CONFLICT' })
    const transfer = await registerPushDevice(other.userId, other.sid, input)
    expect(transfer.device.id).toBe(fresh.device.id)
    expect(await prisma.pushDevice.findUniqueOrThrow({ where: { id: transfer.device.id } })).toMatchObject({ user_id: other.userId, auth_session_id: other.sid, status: 'active' })
    await revokeSession(actor.sid)
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { id: transfer.device.id } })).status).toBe('active')
  }), 30000)
  it('prunes only expired derived push metadata while disabled and never recreates its old source notification', async () => pushFixture(async projectId => {
    const actor = await pushAccount(), input = pushEnrollment(projectId), old = new Date(Date.now() - 91 * 86400000)
    const binding = await registerPushDevice(actor.userId, actor.sid, input)
    const source = await prisma.notification.create({ data: { user_id: actor.userId, kind: 'fixture', title: 'Private owned fixture title', body: 'Private owned fixture body', read_at: null, createdAt: old } })
    await prisma.pushDelivery.create({ data: { notification_id: source.id, device_id: binding.device.id, user_id: actor.userId,
      token_hash: pushTokenHash(input.expoPushToken), status: 'confirmed', createdAt: old } })
    process.env.PUSH_NOTIFICATIONS_ENABLED = 'false'
    const context = { cursor: null, heartbeat: async () => undefined }
    expect((await pushReceiptBatch(context)).result.pruned).toBe(1)
    expect(await prisma.notification.findUnique({ where: { id: source.id } })).not.toBeNull()
    expect(await prisma.pushDevice.findUnique({ where: { id: binding.device.id } })).not.toBeNull()
    process.env.PUSH_NOTIFICATIONS_ENABLED = 'true'
    await pushDispatchBatch(context)
    expect(await prisma.pushDelivery.count({ where: { notification_id: source.id } })).toBe(0)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  }), 30000)

  async function collectionFixture<T>(work: (requests: () => number) => Promise<T>): Promise<T> {
    const values = { RENTRAL_PLATFORM_ENABLED: 'true', PAYMENTS_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_owned_collection_fixture', PAYSTACK_ENVIRONMENT: 'test',
      NEXT_PUBLIC_APP_URL: 'https://owned-fixture.invalid', MUX_ENABLED: 'false', MUX_TOKEN_ID: 'owned-fixture', MUX_TOKEN_SECRET: 'owned-fixture',
      MUX_WEBHOOK_SECRET: 'owned-fixture', MUX_SIGNING_KEY_ID: 'owned-fixture', MUX_SIGNING_PRIVATE_KEY: 'owned-fixture' }
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]])), previousNode = process.env.NODE_ENV
    let requests = 0
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      requests += 1
      if (String(input) !== 'https://api.paystack.co/transaction/initialize') throw new Error('External provider requests are blocked in this owned collection fixture.')
      const body = JSON.parse(String(init?.body))
      return Response.json({ status: true, data: { reference: body.reference, authorization_url: `https://checkout.paystack.com/owned-${body.reference}` } })
    })
    try { for (const [key, value] of Object.entries(values)) process.env[key] = value; return await work(() => requests) }
    finally { network.mockRestore(); for (const key of Object.keys(values)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key] }; vi.stubEnv('NODE_ENV', previousNode) }
  }
  it('rejects archived listing fee preparation and invalid callbacks before creating any provider intent', async () => collectionFixture(async requests => {
    const actor = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const listing = await prisma.listing.create({ data: { lister_id: actor.id, category: 'car', listing_status: 'pending_verification', archived_at: new Date() } })
    await expect(startListingFeePayment(actor.id, listing.id)).rejects.toThrow('Only your submitted listings')
    expect(await prisma.paymentIntent.count({ where: { listing_id: listing.id } })).toBe(0)
    vi.stubEnv('NODE_ENV', 'production'); process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    await expect(startListingFeePayment(actor.id, listing.id)).rejects.toMatchObject({ code: 'PAYMENT_CALLBACK_UNAVAILABLE' })
    await expect(startBookingPayment(actor.id, randomUUID())).rejects.toMatchObject({ code: 'PAYMENT_CALLBACK_UNAVAILABLE' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).revision).toBe(actor.revision)
    expect(await prisma.paymentIntent.count({ where: { user_id: actor.id } })).toBe(0); expect(requests()).toBe(0)
  }), 30000)
  it.each(['booking', 'listing_fee'] as const)('never reuses a wrong-mode%s checkout and permits an explicit known-terminal current-mode retry', async kind => collectionFixture(async requests => {
    const owner = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const renter = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const listing = await prisma.listing.create({ data: { lister_id: owner.id, category: 'car', listing_status: kind === 'booking' ? 'active' : 'pending_verification' } })
    const booking = kind === 'booking' ? await prisma.booking.create({ data: { listing_id: listing.id, seeker_id: renter.id, lister_id: owner.id, kind: 'inspection', status: 'awaiting_payment',
      starts_at: new Date(Date.now() + 86400000), ends_at: new Date(Date.now() + 2 * 86400000), expires_at: new Date(Date.now() + 1800000), amount_kobo: BigInt(300000) } }) : null
    const actor = booking ? renter : owner, amount = booking?.amount_kobo ?? BigInt(PUBLICATION_FEE_KOBO)
    const saved = await prisma.paymentIntent.create({ data: { user_id: actor.id, listing_id: booking ? null : listing.id, booking_id: booking?.id ?? null,
      kind, status: 'pending', provider_environment: 'test', amount_kobo: amount, currency: 'NGN', customer_email: actor.email, reference: `rentral-${randomUUID()}`,
      idempotency_key: `owned-mode:${randomUUID()}`, checkout_url: `https://checkout.paystack.com/owned-saved-${randomUUID()}`, createdAt: new Date(Date.now() - 1000) } })
    const start = () => booking ? startBookingPayment(actor.id, booking.id) : startListingFeePayment(actor.id, listing.id)
    expect(await start()).toBe(saved.checkout_url); expect(requests()).toBe(0)
    process.env.PAYSTACK_SECRET_KEY = 'sk_live_owned_collection_fixture'; process.env.PAYSTACK_ENVIRONMENT = 'live'
    await expect(start()).rejects.toMatchObject({ code: 'PAYMENT_ENVIRONMENT_MISMATCH' })
    expect(await prisma.paymentIntent.count({ where: { user_id: actor.id } })).toBe(1); expect(requests()).toBe(0)
    await prisma.paymentIntent.update({ where: { id: saved.id }, data: { provider_environment: null } })
    await expect(start()).rejects.toMatchObject({ code: 'PAYMENT_ENVIRONMENT_MISMATCH' })
    expect(requests()).toBe(0)
    await prisma.paymentIntent.update({ where: { id: saved.id }, data: { provider_environment: 'test', status: 'failed' } })
    const preparedUrl = await start()
    expect(preparedUrl).toMatch(/^https:\/\/checkout\.paystack\.com\//)
    const all = await prisma.paymentIntent.findMany({ where: { user_id: actor.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    expect(all).toHaveLength(2); expect(all[0]).toMatchObject({ status: 'pending', provider_environment: 'live', amount_kobo: amount })
    expect(all[1]).toMatchObject({ id: saved.id, status: 'failed', provider_environment: 'test', checkout_url: saved.checkout_url }); expect(requests()).toBe(1)
    if (kind === 'listing_fee') {
      expect(await boundPublicationCheckout(actor.id, listing.id, preparedUrl)).toEqual({ url: preparedUrl, paymentId: all[0].id, reference: all[0].reference, environment: 'live' })
      await recordVerifiedPayment({ id: randomUUID(), reference: all[0].reference, amount: Number(PUBLICATION_FEE_KOBO), currency: 'NGN', status: 'success', environment: 'live',
        customer: { email: actor.email }, metadata: { rentral_payment_id: all[0].id, rentral_user_id: actor.id } }, 'owned-bound-checkout-fixture')
      await expect(boundPublicationCheckout(actor.id, listing.id, preparedUrl)).rejects.toMatchObject({ code: 'PUBLICATION_FEE_CHANGED', status: 409 })
    }
  }), 30000)
  it('admits new publication only with a current-mode verified fee while retaining historical receipts', async () => collectionFixture(async requests => {
    const actor = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid` } })
    const staff = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.invalid`, staff_role: 'admin' } })
    const address = 'An owned synthetic address for publication mode acceptance'
    const recording = await sealedRecording(actor.id)
    const draft = await saveDraftForUser(actor.id, { category: 'car', wizardStep: 'details', metadata: {}, captureId: recording.id, videoPath: recording.videoPath })
    if (!draft.success) throw new Error('Expected capture-bound publication fixture')
    const documentPath = `${actor.id}/${randomUUID()}/owned-proof.pdf`
    await uploadStoredObject(actor.id, 'compliance-docs', documentPath, new Blob(['%PDF-1.7\nOwned publication-mode evidence\n%%EOF']).stream(), 'application/pdf')
    const listing = await prisma.listing.update({ where: { id: draft.draftId }, data: { listing_status: 'pending_verification', text_address: address, document_path: documentPath } })
    await moderateListing(staff.id, listing.id, 'approve_document', 'Human reviewed the exact owned publication-mode fixture document')
    await prisma.listingVerification.create({ data: { listing_id: listing.id, capture_id: recording.id, address_hash: addressFingerprint(address), spatial_status: 'matched', distance_meters: 5 } })
    await prisma.mediaAsset.create({ data: { listing_id: listing.id, source_path: recording.videoPath, status: 'ready' } })
    process.env.MUX_ENABLED = 'true'
    const collection = async (environment: 'test' | 'live') => {
      const payment = await prisma.paymentIntent.create({ data: { user_id: actor.id, listing_id: listing.id, kind: 'listing_fee', amount_kobo: BigInt(PUBLICATION_FEE_KOBO), currency: 'NGN',
        customer_email: actor.email, provider_environment: environment, reference: `rentral-${randomUUID()}`, idempotency_key: `owned-publication:${randomUUID()}` } })
      await recordVerifiedPayment({ id: randomUUID(), reference: payment.reference, amount: Number(PUBLICATION_FEE_KOBO), currency: 'NGN', status: 'success', environment,
        customer: { email: actor.email }, metadata: { rentral_payment_id: payment.id, rentral_user_id: actor.id } }, 'owned-publication-mode-fixture')
      return payment
    }
    const historical = await collection('test')
    process.env.PAYSTACK_SECRET_KEY = 'sk_live_owned_collection_fixture'; process.env.PAYSTACK_ENVIRONMENT = 'live'
    await expect(moderateListing(staff.id, listing.id, 'publish', 'Reviewed synthetic current-mode asset and fee evidence')).rejects.toMatchObject({ code: 'PUBLICATION_FEE_REQUIRED' })
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).listing_status).toBe('pending_verification')
    expect(await prisma.paymentIntent.findUniqueOrThrow({ where: { id: historical.id } })).toMatchObject({ status: 'succeeded', provider_environment: 'test' })
    await collection('live')
    await moderateListing(staff.id, listing.id, 'publish', 'Reviewed synthetic current live-mode fee and full asset evidence')
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } })).listing_status).toBe('active')
    expect(await prisma.ledgerTransaction.count({ where: { payment_id: historical.id, kind: 'provider_collection' } })).toBe(1)
    expect(requests()).toBe(0)
  }), 30000)
})
