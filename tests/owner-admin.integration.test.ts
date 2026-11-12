import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { MongoClient } from 'mongodb'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import prisma from '@/lib/db'
import { localMongoDatabaseName, localMongoUrl } from '@/lib/database/config'
import { ensureMongoIndexes } from '@/lib/database/indexes'
import { closeMongoReadiness } from '@/lib/database/readiness'
import { authenticateAccess, loginAccount, registerAccount } from '@/lib/auth/service'
import { closeAccount } from '@/lib/accounts/lifecycle'
import { saveListingForUser, updateListingForUser } from '@/lib/listings/service'
import { uploadStoredObject, removeStoredObjects } from '@/lib/storage-claims/service'
import { getDiscoveryListings } from '@/lib/discovery'
import { parseDiscoveryFilters } from '@/lib/discovery-policy'
import { ownedPublicationFee, boundPublicationCheckout } from '@/lib/api/listing-payments'
import { startListingFeePayment } from '@/lib/payments/service'
import { apiRateLimiter } from '@/lib/api/rate-limit'
import { GET as dashboard } from '@/app/api/v1/admin/route'
import { POST as adminCommand } from '@/app/api/v1/admin/commands/route'
import { GET as adminReceipt } from '@/app/api/v1/admin/commands/[clientId]/route'
import { GET as documentPreview } from '@/app/api/v1/admin/listings/[id]/document/route'
import { searchAdminListings } from '@/lib/operations/admin-listings'
import { getAdminListingMedia } from '@/lib/operations/admin-media'
import { publishOwnListing } from '@/lib/listings/publishing'
import { PUBLICATION_FEE_KOBO } from '@/lib/contracts/listing-payments'
import { GET as manualStatus, POST as manualRequest } from '@/app/api/v1/bookings/[id]/manual-inspection/route'

// Only Next request-context adapters are replaced. The real rate limiter keeps
// its counters/thresholds, with its explicit clock argument advanced per case;
// JWT/wall-clock time is unchanged. No domain service or database is mocked.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn() }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const uri = process.env.RENTRAL_TEST_MONGO_URI, fixtureOwner = process.env.RENTRAL_TEST_MONGO_OWNER
const fixture = describe.skipIf(!uri)
fixture('owned owner/admin, gallery and manual-review acceptance', () => {
  let native: MongoClient, storageRoot: string
  let platformOwner: Awaited<ReturnType<typeof registerAccount>>, admin: typeof platformOwner, host: typeof platformOwner, renter: typeof platformOwner
  const password = 'owned-admin-fixture-password-123', reason = 'Human reviewed the supporting fixture evidence and approved this exact decision.'
  const metadata = { bedrooms: '2', bathrooms: '1', sizeSqm: '80', amenities: 'Synthetic fixture', listingTitle: 'Owned admin gallery fixture' }
  const address = 'Synthetic building 14, test street, Lagos, Nigeria'
  let outbound: ReturnType<typeof vi.spyOn>
  let limiterClock = Date.now(), limiterSpy: ReturnType<typeof vi.spyOn>
  const originalAllow = apiRateLimiter.allow.bind(apiRateLimiter)
  function request(session: typeof platformOwner, path: string, body?: unknown) {
    return new Request(`http://127.0.0.1:30999/api/v1${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${session.access_token}`, 'x-rentral-account': session.user.id, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  async function command(session: typeof platformOwner, operation: string, targetId: string, extra: Record<string, unknown> = {}) {
    const model = ['approve_document', 'reject_document', 'publish', 'suspend_listing', 'waive_fee', 'revoke_fee_waiver'].includes(operation) ? 'listing' : operation === 'review_manual_inspection' ? 'booking' : 'user'
    const row = model === 'listing' ? await prisma.listing.findUniqueOrThrow({ where: { id: targetId }, select: { revision: true } }) : model === 'booking' ? await prisma.booking.findUniqueOrThrow({ where: { id: targetId }, select: { revision: true } }) : await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { revision: true } })
    const body = { operation, targetId, expectedRevision: row.revision, clientId: randomUUID(), reason, ...extra }
    const response = await adminCommand(request(session, '/admin/commands', body))
    return { body, response, result: await response.json() }
  }
  async function grantGallery() {
    const current = await prisma.user.findUniqueOrThrow({ where: { id: host.user.id }, select: { gallery_upload_allowed: true } })
    if (!current.gallery_upload_allowed) expect((await command(platformOwner, 'set_gallery_permission', host.user.id, { allowed: true })).response.status).toBe(200)
  }
  function stream(bytes: Uint8Array) { return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close() } }) }
  async function galleryFiles() {
    const folder = randomUUID(), photoPath = `${host.user.id}/${folder}/photo.png`, documentPath = `${host.user.id}/${folder}/authority.pdf`
    await uploadStoredObject(host.user.id, 'listings-media', photoPath, stream(new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6XIAAAAASUVORK5CYII=', 'base64'))), 'image/png')
    await uploadStoredObject(host.user.id, 'compliance-docs', documentPath, stream(new Uint8Array(Buffer.from('%PDF-1.7\nOwned synthetic authority evidence fixture.'))), 'application/pdf')
    return { photoPath, documentPath }
  }
  async function createGallery(publish = false) {
    await grantGallery()
    const files = await galleryFiles()
    const saved = await saveListingForUser(host.user.id, { clientId: randomUUID(), mediaSource: 'approved_gallery', galleryPhotos: [files.photoPath], category: 'house', address, basePrice: '100000', documentPath: files.documentPath, metadata })
    expect(saved.success).toBe(true)
    if (!saved.success) throw new Error('Owned gallery fixture could not be submitted')
    if (publish) {
      expect((await command(platformOwner, 'approve_document', saved.listingId)).response.status).toBe(200)
      expect((await command(platformOwner, 'waive_fee', saved.listingId)).response.status).toBe(200)
      expect((await command(platformOwner, 'publish', saved.listingId)).response.status).toBe(200)
    }
    return { ...files, listingId: saved.listingId }
  }
  beforeAll(async () => {
    if (!uri || !fixtureOwner || !/^[a-f0-9]{32}$/.test(fixtureOwner) || localMongoDatabaseName(uri) !== `rentral_test_${fixtureOwner}` || process.env.MONGODB_URL !== uri || process.env.DATABASE_URL !== uri) throw new Error('Use the owned isolated Mongo fixture; never the selected application database.')
    native = new MongoClient(localMongoUrl(uri), { serverSelectionTimeoutMS: 5000 }); await native.connect()
    const db = native.db(localMongoDatabaseName(uri))
    if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error('Owner fixture database must be new and empty.')
    await db.collection<{ _id: string }>('_FixtureOwnership').insertOne({ _id: fixtureOwner })
    await ensureMongoIndexes(db)
    const artifacts = resolve('test-results'); await mkdir(artifacts, { recursive: true }); storageRoot = await mkdtemp(join(artifacts, 'owned-admin-storage-'))
    vi.stubEnv('RENTRAL_STORAGE_DIR', storageRoot); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:30999'); vi.stubEnv('JWT_SECRET', 'owned-admin-fixture-only-signing-secret-more-than-32-bytes')
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('PAYMENTS_ENABLED', 'false'); vi.stubEnv('MUX_ENABLED', 'false'); vi.stubEnv('GEOAPIFY_API_KEY', '')
    outbound = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('No provider request is authorized in this fixture') })
    limiterSpy = vi.spyOn(apiRateLimiter, 'allow').mockImplementation((key, maximum) => originalAllow(key, maximum, limiterClock))
    ;[platformOwner, admin, host, renter] = await Promise.all(Array.from({ length: 4 }, () => registerAccount({ email: `${randomUUID()}@fixture.invalid`, password })))
    const bootstrapArgs = ['--experimental-strip-types', resolve('scripts/bootstrap-owner.ts'), '--email', platformOwner.user.email, '--reason', reason]
    const options = { cwd: process.cwd(), env: { ...process.env, MONGODB_URL: uri, DATABASE_URL: uri }, encoding: 'utf8' as const, windowsHide: true, timeout: 20000 }
    expect(JSON.parse(execFileSync(process.execPath, bootstrapArgs, options))).toMatchObject({ dryRun: true, accountMatched: true, existingOwners: 0, ready: true })
    expect(execFileSync(process.execPath, [...bootstrapArgs, '--apply-owner'], options)).toContain('Platform ownership saved')
    expect((await command(platformOwner, 'change_role', admin.user.id, { role: 'admin' })).response.status).toBe(200)
  }, 40000)
  beforeEach(() => { limiterClock += 61000 })
  afterAll(async () => {
    outbound?.mockRestore(); limiterSpy?.mockRestore(); await prisma.$disconnect(); await closeMongoReadiness(); await native?.close(); vi.unstubAllEnvs()
    if (storageRoot) { if (!resolve(storageRoot).startsWith(`${resolve('test-results')}${sep}`) || !storageRoot.includes('owned-admin-storage-')) throw new Error('Unsafe owned admin storage cleanup.'); await rm(storageRoot, { recursive: true, force: true }) }
  })
  it('retains the production mutation threshold inside each controlled limiter window', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) expect((await adminCommand(request(platformOwner, '/admin/commands', {}))).status).toBe(400)
    expect((await adminCommand(request(platformOwner, '/admin/commands', {}))).status).toBe(429)
  }, 15000)
  it('authorizes actual JWTs from current database owner/admin roles and rejects a member or role-forging body', async () => {
    expect(platformOwner.user.app_metadata.role).toBeUndefined()
    const ownerView = await dashboard(request(platformOwner, '/admin')); expect(ownerView.status).toBe(200); expect(await ownerView.json()).toMatchObject({ data: { role: 'owner', permissions: expect.arrayContaining(['owner:transfer']) } })
    expect((await dashboard(request(admin, '/admin'))).status).toBe(200)
    expect((await dashboard(request(host, '/admin'))).status).toBe(403)
    const forged = await adminCommand(request(host, '/admin/commands', { operation: 'change_role', clientId: randomUUID(), targetId: host.user.id, expectedRevision: 0, reason, role: 'owner', is_admin: true }))
    expect(forged.status).toBe(400)
    expect(await prisma.user.count({ where: { staff_role: 'owner' } })).toBe(1)
  })
  it('uses an audited original command receipt, rejects changed nonce instructions and supports actor-only readback', async () => {
    const first = await command(platformOwner, 'set_gallery_permission', host.user.id, { allowed: true })
    expect(first.response.status).toBe(200)
    const count = await prisma.adminAudit.count({ where: { action: 'set_gallery_permission', target_id: host.user.id } })
    const notificationCount = await prisma.notification.count({ where: { user_id: host.user.id, kind: 'gallery_permission' } })
    expect(notificationCount).toBe(1)
    expect(await prisma.notification.findFirst({ where: { user_id: host.user.id, kind: 'gallery_permission' }, select: { title: true, href: true } })).toEqual({ title: 'Gallery uploads approved', href: '/marketplace/listing/create?gallery=1' })
    expect((await adminCommand(request(platformOwner, '/admin/commands', first.body))).status).toBe(200)
    expect(await prisma.adminAudit.count({ where: { action: 'set_gallery_permission', target_id: host.user.id } })).toBe(count)
    expect(await prisma.notification.count({ where: { user_id: host.user.id, kind: 'gallery_permission' } })).toBe(notificationCount)
    const context = { params: Promise.resolve({ clientId: first.body.clientId }) }
    expect((await adminReceipt(request(platformOwner, `/admin/commands/${first.body.clientId}`), context)).status).toBe(200)
    expect((await adminReceipt(request(admin, `/admin/commands/${first.body.clientId}`), context)).status).toBe(404)
    expect((await adminCommand(request(platformOwner, '/admin/commands', { ...first.body, allowed: false }))).status).toBe(409)
  })
  it('claims real photo/document files and publishes a manually approved exact document with an unpaid waiver and all providers off', async () => {
    const listing = await createGallery()
    expect((await command(platformOwner, 'publish', listing.listingId)).response.status).toBe(409)
    const preview = await documentPreview(request(platformOwner, `/admin/listings/${listing.listingId}/document`), { params: Promise.resolve({ id: listing.listingId }) })
    expect(preview.status).toBe(200); expect(await preview.json()).toMatchObject({ data: { url: expect.stringContaining('/api/v1/files/compliance-docs/'), digest: expect.stringMatching(/^[a-f0-9]{64}$/) } })
    expect((await command(platformOwner, 'approve_document', listing.listingId)).response.status).toBe(200)
    expect((await command(platformOwner, 'waive_fee', listing.listingId)).response.status).toBe(200)
    expect((await command(platformOwner, 'publish', listing.listingId)).response.status).toBe(200)
    const review = await prisma.documentReview.findUniqueOrThrow({ where: { listing_id: listing.listingId } })
    const object = await prisma.storageObject.findFirstOrThrow({ where: { bucket: 'compliance-docs', path: listing.documentPath } })
    expect(review.approved_path).toBe(listing.documentPath); expect(review.approved_digest).toBe(object.digest)
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.listingId } })).capture_id).toBeNull()
    expect(await prisma.listingLocation.count({ where: { listing_id: listing.listingId } })).toBe(0)
    expect(await ownedPublicationFee(host.user.id, listing.listingId)).toMatchObject({ waived: true, payment: null, actions: { checkout: false } })
    await expect(removeStoredObjects(host.user.id, 'listings-media', [listing.photoPath])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
    expect((await getDiscoveryListings(parseDiscoveryFilters({}), null)).listings.some(item => item.id === listing.listingId)).toBe(true)
  }, 15000)
  it('rejects stale manual document approval after replacement and blocks waived checkout before provider work', async () => {
    const listing = await createGallery()
    expect((await command(platformOwner, 'approve_document', listing.listingId)).response.status).toBe(200)
    expect((await command(platformOwner, 'waive_fee', listing.listingId)).response.status).toBe(200)
    const replacement = await galleryFiles()
    await prisma.listing.update({ where: { id: listing.listingId }, data: { document_path: replacement.documentPath } })
    expect((await command(platformOwner, 'publish', listing.listingId)).response.status).toBe(409)
    vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned_fixture_no_provider_calls')
    await expect(startListingFeePayment(host.user.id, listing.listingId)).rejects.toThrow('waived')
    await expect(boundPublicationCheckout(host.user.id, listing.listingId, 'https://checkout.paystack.com/owned-fixture')).rejects.toMatchObject({ code: 'PUBLICATION_FEE_CHANGED' })
    vi.stubEnv('PAYMENTS_ENABLED', 'false')
    expect(await prisma.paymentIntent.count()).toBe(0); expect(outbound).not.toHaveBeenCalled()
  }, 15000)
  it('serializes gallery revocation with publication and hides revoked inventory while preserving bytes/history', async () => {
    const listing = await createGallery(true)
    const revoke = await command(platformOwner, 'set_gallery_permission', host.user.id, { allowed: false }); expect(revoke.response.status).toBe(200)
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.listingId } })).listing_status).toBe('suspended')
    expect((await getDiscoveryListings(parseDiscoveryFilters({}), null)).listings.some(item => item.id === listing.listingId)).toBe(false)
    expect((await command(platformOwner, 'publish', listing.listingId)).response.status).toBe(403)
    expect(await prisma.storageObject.count({ where: { path: listing.photoPath, state: 'available' } })).toBe(1)
    await grantGallery()
    const refreshed = await updateListingForUser(host.user.id, { listingId: listing.listingId, address, basePrice: '100000', metadata })
    expect(refreshed.success).toBe(true)
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.listingId } })).listing_status).toBe('pending_verification')
    expect((await prisma.documentReview.findUniqueOrThrow({ where: { listing_id: listing.listingId } })).status).not.toBe('approved')
  }, 15000)
  it('reviews participant evidence through its original receipt without GPS proof or financial writes', async () => {
    const listing = await createGallery(true)
    const booking = await prisma.booking.create({ data: { listing_id: listing.listingId, seeker_id: renter.user.id, lister_id: host.user.id, kind: 'inspection', status: 'confirmed', starts_at: new Date(Date.now() - 3600000), ends_at: new Date(Date.now() + 3600000), amount_kobo: BigInt(300000) } })
    const evidence = { clientId: randomUUID(), evidence: 'We met at the listed property and request an independent human inspection review.' }, context = { params: Promise.resolve({ id: booking.id }) }
    const sent = await manualRequest(request(renter, `/bookings/${booking.id}/manual-inspection`, evidence), context); expect(sent.status).toBe(200)
    expect((await manualStatus(request(renter, `/bookings/${booking.id}/manual-inspection?clientId=${evidence.clientId}`), context)).status).toBe(200)
    expect((await manualStatus(request(host, `/bookings/${booking.id}/manual-inspection?clientId=${evidence.clientId}`), context)).status).toBe(404)
    expect((await manualRequest(request(renter, `/bookings/${booking.id}/manual-inspection`, evidence), context)).status).toBe(200)
    expect((await command(platformOwner, 'review_manual_inspection', booking.id, { decision: 'approve' })).response.status).toBe(200)
    const reviewed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(reviewed).toMatchObject({ status: 'completed', manual_inspection_status: 'approved', seeker_checked_in_at: null, lister_checked_in_at: null, settlement_status: 'unsettled' })
    expect(await prisma.adminAudit.count({ where: { action: 'request_manual_inspection', target_id: booking.id } })).toBe(1)
    expect(await prisma.financialOperation.count()).toBe(0); expect(await prisma.ledgerTransaction.count()).toBe(0)
  }, 15000)
  it('protects the owner from administrative demotion/suspension and self-interested manual inspection review', async () => {
    expect((await command(admin, 'suspend_user', platformOwner.user.id)).response.status).toBe(409)
    expect((await command(admin, 'change_role', platformOwner.user.id, { role: 'member' })).response.status).toBe(409)
    await expect(closeAccount(platformOwner.user.id, { currentPassword: password })).rejects.toMatchObject({ code: 'OWNER_TRANSFER_REQUIRED' })
    const listing = await createGallery()
    const booking = await prisma.booking.create({ data: { listing_id: listing.listingId, seeker_id: platformOwner.user.id, lister_id: host.user.id, kind: 'inspection', status: 'confirmed', starts_at: new Date(Date.now() - 3600000), ends_at: new Date(Date.now() + 3600000), amount_kobo: BigInt(300000), manual_inspection_status: 'pending', manual_inspection_evidence: reason, manual_inspection_requested_by: platformOwner.user.id, manual_inspection_requested_at: new Date() } })
    expect((await command(platformOwner, 'review_manual_inspection', booking.id, { decision: 'approve' })).response.status).toBe(403)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('confirmed')
  }, 15000)
  it('revokes existing JWT sessions on reversible suspension without automatically restoring listings or gallery privilege', async () => {
    expect((await command(platformOwner, 'suspend_user', host.user.id)).response.status).toBe(200)
    await expect(authenticateAccess(host.access_token)).rejects.toMatchObject({ status: 401 })
    expect((await command(platformOwner, 'restore_user', host.user.id)).response.status).toBe(200)
    await expect(authenticateAccess(host.access_token)).rejects.toMatchObject({ status: 401 })
    host = await loginAccount({ email: host.user.email, password })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: host.user.id } })).gallery_upload_allowed).toBe(false)
    expect(await prisma.listing.count({ where: { lister_id: host.user.id, listing_status: 'active' } })).toBe(0)
  }, 15000)
  it('applies free posting only to future submissions and keeps human review separate from gallery upload approval', async () => {
    const earlier = await createGallery()
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: earlier.listingId } })).fee_waived_at).toBeNull()
    expect((await command(platformOwner, 'set_free_posting_permission', host.user.id, { allowed: true })).response.status).toBe(200)
    const fresh = await createGallery()
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: fresh.listingId }, include: { documentReview: true } })
    expect(row).toMatchObject({ listing_status: 'pending_verification', fee_waived_by: platformOwner.user.id, fee_waiver_reason: reason })
    expect(row.fee_waived_at).toBeInstanceOf(Date); expect(row.publication_mode).not.toBe('trusted_publisher')
    expect(row.documentReview?.status).not.toBe('approved')
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: earlier.listingId } })).fee_waived_at).toBeNull()
    expect(await ownedPublicationFee(host.user.id, fresh.listingId)).toMatchObject({ waived: true, payment: null, actions: { checkout: false } })
    expect((await command(platformOwner, 'set_free_posting_permission', host.user.id, { allowed: false })).response.status).toBe(200)
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: fresh.listingId } })).fee_waived_at).toBeInstanceOf(Date)
    const afterRevocation = await createGallery()
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: afterRevocation.listingId } })).fee_waived_at).toBeNull()
    expect(await prisma.paymentIntent.count()).toBe(0)
  }, 20000)
  it('publishes a granted gallery account without human approval, keeps the queue truthful and previews only owned media', async () => {
    expect((await command(platformOwner, 'set_free_posting_permission', host.user.id, { allowed: true })).response.status).toBe(200)
    expect((await command(platformOwner, 'set_direct_publish_permission', host.user.id, { allowed: true })).response.status).toBe(200)
    const fresh = await createGallery()
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: fresh.listingId }, include: { documentReview: true } })
    expect(row).toMatchObject({ listing_status: 'active', publication_mode: 'trusted_publisher', capture_id: null })
    expect(row.documentReview?.status).not.toBe('approved')
    expect(row.direct_publish_proof).toMatchObject({ ownerId: host.user.id, grantedBy: platformOwner.user.id, documentPath: fresh.documentPath, documentDigest: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect((await searchAdminListings(platformOwner.user.id, { status: 'review', listerId: host.user.id })).items.some(item => item.id === fresh.listingId)).toBe(false)
    expect((await searchAdminListings(platformOwner.user.id, { status: 'all', query: host.user.email })).items.some(item => item.id === fresh.listingId)).toBe(true)
    const preview = await getAdminListingMedia(platformOwner.user.id, fresh.listingId)
    expect(preview).toMatchObject({ source: 'approved_gallery', items: [{ kind: 'image', url: expect.stringContaining('/api/v1/files/listings-media/'), expiresAt: expect.any(String) }] })
    expect(JSON.stringify(preview)).not.toContain('compliance-docs')
    expect((await getDiscoveryListings(parseDiscoveryFilters({}), null)).listings.some(item => item.id === fresh.listingId)).toBe(true)
    const grant = await prisma.user.findUniqueOrThrow({ where: { id: host.user.id }, select: { direct_publish_at: true } })
    expect((await command(platformOwner, 'set_direct_publish_permission', host.user.id, { allowed: true })).response.status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: host.user.id } })).direct_publish_at).toEqual(grant.direct_publish_at)
    expect((await command(platformOwner, 'set_direct_publish_permission', host.user.id, { allowed: false })).response.status).toBe(200)
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: fresh.listingId } }))).toMatchObject({ listing_status: 'pending_verification', publication_mode: 'manual_review' })
    expect((await command(platformOwner, 'set_free_posting_permission', host.user.id, { allowed: false })).response.status).toBe(200)
    expect(await prisma.paymentIntent.count()).toBe(0); expect(outbound).not.toHaveBeenCalled()
  }, 20000)
  it('blocks an unpaid trusted submission until a real waiver and preserves original publication receipt semantics', async () => {
    expect((await command(platformOwner, 'set_direct_publish_permission', host.user.id, { allowed: true })).response.status).toBe(200)
    const fresh = await createGallery()
    let row = await prisma.listing.findUniqueOrThrow({ where: { id: fresh.listingId } })
    expect(row).toMatchObject({ listing_status: 'pending_verification', publication_mode: 'trusted_publisher', fee_waived_at: null })
    expect((await searchAdminListings(platformOwner.user.id, { status: 'review', listerId: host.user.id })).items.some(item => item.id === fresh.listingId)).toBe(false)
    expect((await searchAdminListings(platformOwner.user.id, { status: 'pending_verification', query: fresh.listingId })).items.map(item => item.id)).toEqual([fresh.listingId])
    await expect(publishOwnListing(host.user.id, fresh.listingId, { clientId: randomUUID(), expectedRevision: row.revision })).rejects.toMatchObject({ code: 'PUBLICATION_FEE_REQUIRED' })
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: fresh.listingId } })).listing_status).toBe('pending_verification')
    expect((await command(platformOwner, 'waive_fee', fresh.listingId)).response.status).toBe(200)
    row = await prisma.listing.findUniqueOrThrow({ where: { id: fresh.listingId } })
    const instruction = { clientId: randomUUID(), expectedRevision: row.revision }
    expect(await publishOwnListing(host.user.id, fresh.listingId, instruction)).toMatchObject({ status: 'active', trustedPublisher: true })
    expect(await publishOwnListing(host.user.id, fresh.listingId, instruction)).toMatchObject({ status: 'active', trustedPublisher: true })
    expect(await prisma.adminAudit.count({ where: { action: 'trusted_listing_published', target_id: fresh.listingId } })).toBe(1)
    expect(await prisma.documentReview.count({ where: { listing_id: fresh.listingId, status: 'approved' } })).toBe(0)
    expect((await command(platformOwner, 'set_direct_publish_permission', host.user.id, { allowed: false })).response.status).toBe(200)
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: fresh.listingId } })).listing_status).toBe('pending_verification')
    expect(await prisma.paymentIntent.count()).toBe(0); expect(await prisma.financialOperation.count()).toBe(0)
  }, 20000)
  it('keeps privileged grants unavailable to members and does not conflate an upload grant with direct or free posting', async () => {
    expect((await command(host, 'set_free_posting_permission', renter.user.id, { allowed: true })).response.status).toBe(403)
    expect((await command(host, 'set_direct_publish_permission', renter.user.id, { allowed: true })).response.status).toBe(403)
    await grantGallery()
    const row = await prisma.user.findUniqueOrThrow({ where: { id: host.user.id } })
    expect(row.gallery_upload_allowed).toBe(true); expect(row.listing_fee_exempt).toBe(false); expect(row.direct_publish_allowed).toBe(false)
    const listing = await createGallery()
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.listingId } }))).toMatchObject({ listing_status: 'pending_verification', fee_waived_at: null })
    expect((await command(platformOwner, 'publish', listing.listingId)).response.status).toBe(409)
  }, 15000)
  it('retains a trusted video submission while processing is unavailable even when posting is free', async () => {
    await grantGallery()
    expect((await command(platformOwner, 'set_free_posting_permission', host.user.id, { allowed: true })).response.status).toBe(200)
    expect((await command(platformOwner, 'set_direct_publish_permission', host.user.id, { allowed: true })).response.status).toBe(200)
    try {
      const files = await galleryFiles(), videoPath = `${host.user.id}/${randomUUID()}/walkthrough.mp4`
      // A private fixture container signature is enough for storage validation;
      // no transcoder or provider success is invented, and Mux remains disabled.
      await uploadStoredObject(host.user.id, 'listings-media', videoPath, stream(new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])), 'video/mp4')
      const saved = await saveListingForUser(host.user.id, { clientId: randomUUID(), mediaSource: 'approved_gallery', galleryPhotos: [files.photoPath], videoPath, category: 'house', address, basePrice: '100000', documentPath: files.documentPath, metadata })
      expect(saved.success).toBe(true)
      if (!saved.success) throw new Error('Owned video submission fixture could not be saved')
      const row = await prisma.listing.findUniqueOrThrow({ where: { id: saved.listingId } })
      expect(row).toMatchObject({ listing_status: 'pending_verification', publication_mode: 'trusted_publisher', fee_waived_by: platformOwner.user.id })
      await expect(publishOwnListing(host.user.id, saved.listingId, { clientId: randomUUID(), expectedRevision: row.revision })).rejects.toMatchObject({ code: 'PUBLICATION_VIDEO_REQUIRED' })
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: saved.listingId } })).listing_status).toBe('pending_verification')
      expect(await prisma.paymentIntent.count()).toBe(0); expect(outbound).not.toHaveBeenCalled()
    } finally {
      await command(platformOwner, 'set_direct_publish_permission', host.user.id, { allowed: false })
      await command(platformOwner, 'set_free_posting_permission', host.user.id, { allowed: false })
    }
  }, 20000)
  it('requires the exact succeeded same-listing fee, payer, currency, amount and environment before direct publishing', async () => {
    const paymentIds: string[] = []
    vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned_fixture_no_provider_calls'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'test')
    try {
      expect((await command(platformOwner, 'set_direct_publish_permission', host.user.id, { allowed: true })).response.status).toBe(200)
      const listing = await createGallery(), other = await createGallery()
      const base = { listing_id: listing.listingId, user_id: host.user.id, kind: 'listing_fee', status: 'succeeded', currency: 'NGN', amount_kobo: BigInt(PUBLICATION_FEE_KOBO), provider_environment: 'test', customer_email: host.user.email }
      const unrelated = [{ status: 'failed' }, { kind: 'inspection_fee' }, { listing_id: other.listingId }, { user_id: renter.user.id }, { currency: 'USD' }, { amount_kobo: BigInt(PUBLICATION_FEE_KOBO) - BigInt(1) }, { provider_environment: 'live' }]
      for (const fields of unrelated) {
        const payment = await prisma.paymentIntent.create({ data: { ...base, ...fields, reference: `owned-fixture-${randomUUID()}`, idempotency_key: randomUUID() } })
        paymentIds.push(payment.id)
        const current = await prisma.listing.findUniqueOrThrow({ where: { id: listing.listingId } })
        await expect(publishOwnListing(host.user.id, listing.listingId, { clientId: randomUUID(), expectedRevision: current.revision })).rejects.toMatchObject({ code: 'PUBLICATION_FEE_REQUIRED' })
      }
      const exact = await prisma.paymentIntent.create({ data: { ...base, reference: `owned-fixture-${randomUUID()}`, idempotency_key: randomUUID() } })
      paymentIds.push(exact.id)
      const current = await prisma.listing.findUniqueOrThrow({ where: { id: listing.listingId } })
      expect(await publishOwnListing(host.user.id, listing.listingId, { clientId: randomUUID(), expectedRevision: current.revision })).toMatchObject({ status: 'active' })
      expect(await prisma.ledgerEntry.count()).toBe(0); expect(await prisma.financialOperation.count()).toBe(0); expect(outbound).not.toHaveBeenCalled()
    } finally {
      // Only this isolated fixture's synthetic rows are removed. No real PSP is
      // called and no provider success/ledger entry is fabricated by app code.
      await command(platformOwner, 'set_direct_publish_permission', host.user.id, { allowed: false })
      await prisma.paymentIntent.deleteMany({ where: { id: { in: paymentIds } } })
      vi.stubEnv('PAYMENTS_ENABLED', 'false')
    }
  }, 30000)
  it('transfers the only owner atomically and immediately removes old owner transfer authority', async () => {
    expect((await command(platformOwner, 'transfer_ownership', admin.user.id)).response.status).toBe(200)
    expect(await prisma.user.count({ where: { staff_role: 'owner' } })).toBe(1)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.user.id } })).staff_role).toBe('owner')
    expect((await command(platformOwner, 'transfer_ownership', renter.user.id)).response.status).toBe(403)
    expect((await dashboard(request(admin, '/admin'))).status).toBe(200)
    expect(outbound).not.toHaveBeenCalled(); expect(await prisma.paymentIntent.count()).toBe(0); expect(await prisma.ledgerEntry.count()).toBe(0)
  }, 15000)
})
