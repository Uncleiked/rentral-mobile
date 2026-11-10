import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), transaction: vi.fn(), lock: vi.fn(), activeOwner: vi.fn(), user: vi.fn(), findListing: vi.fn(), updateListing: vi.fn(), review: vi.fn(), audit: vi.fn(), notify: vi.fn(), report: vi.fn(), booking: vi.fn(), updateReport: vi.fn(), automatedListing: vi.fn(), geocode: vi.fn(), capture: vi.fn(), storedVideo: vi.fn(), prepare: vi.fn(), claim: vi.fn(), gallery: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.authenticated }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work), lockRecord: async (_tx: unknown, model: string, id: string) => { mocks.lock(model, id); return true } }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction, user: { findUnique: mocks.user }, listing: { findUnique: mocks.automatedListing }, adminAudit: { create: mocks.audit } } }))
vi.mock('@/lib/storage-claims/service', () => ({ prepareListingStorage: mocks.prepare, claimStorageObjects: mocks.claim }))
vi.mock('@/lib/listings/gallery', () => ({ assertGalleryPublication: mocks.gallery, assertGalleryListingCurrent: async () => undefined }))
vi.mock('@/lib/listings/spatial', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/listings/spatial')>(), verifyListingAddress: mocks.geocode }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertLifecycleReady: async () => undefined, assertOwnerAdminReady: async () => undefined }))

import { isAdminId, requireAdminId, requireInsightsId } from '@/lib/operations/access'
import { moderateListing, resolveDispute } from '@/lib/operations/service'
import { addressFingerprint } from '@/lib/listings/spatial'
import { adminOperationAction } from '@/app/actions/adminActions'
import { hasStaffPermission } from '@/lib/auth/roles'

const listingId = '11111111-1111-4111-8111-111111111111'
const captureId = '22222222-2222-4222-8222-222222222222'
function eligibleListing() {
  return { id: listingId, lister_id: 'host', listing_status: 'pending_verification', text_address: 'Synthetic Yaba address', document_path: 'host/folder/title.pdf',
    lister: { id: 'host', kyc_verified: true, username: 'host' }, documentReview: { status: 'approved', reviewed_by: 'other-staff', approved_path: 'host/folder/title.pdf', approved_digest: 'd'.repeat(64), findings: {} },
    capture_id: captureId, video_path: 'host/folder/video.mp4', privateLocation: { capture_id: captureId, geometry: { type: 'Point', coordinates: [3.4, 6.45] } },
    verification: { capture_id: captureId, spatial_status: 'matched', address_hash: addressFingerprint('Synthetic Yaba address'), distance_meters: 25 },
    media: { status: 'ready', source_path: 'host/folder/video.mp4' }, payments: [{ amount_kobo: BigInt(100000), currency: 'NGN', user_id: 'host', provider_environment: 'test' as string | null }] }
}

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('RENTRAL_ADMIN_IDS', ' staff,second-staff '); vi.stubEnv('RENTRAL_INSIGHTS_IDS', 'analyst')
  vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned_fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'test')
  vi.stubEnv('MUX_ENABLED', 'true'); for (const name of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) vi.stubEnv(name, 'configured-test-value')
  mocks.findListing.mockResolvedValue(eligibleListing())
  mocks.capture.mockResolvedValue({ id: captureId, video_object_id: 'object', video_digest: 'a'.repeat(64), start_geometry: { type: 'Point', coordinates: [3.4, 6.45] } })
  mocks.storedVideo.mockImplementation(async ({ where }: { where: { bucket?: string } }) => where.bucket === 'compliance-docs' ? { id: 'document-object', digest: 'd'.repeat(64) } : { id: 'object' })
  mocks.automatedListing.mockResolvedValue({ lister_id: 'host', document_path: 'host/folder/title.pdf', listing_status: 'pending_verification' })
  mocks.prepare.mockResolvedValue([{ id: 'document-object', bucket: 'compliance-docs', path: 'host/folder/title.pdf', digest: 'd'.repeat(64), sizeBytes: 100, contentType: 'application/pdf' }])
  mocks.claim.mockResolvedValue(undefined); mocks.gallery.mockResolvedValue({ hasVideo: false }); mocks.audit.mockResolvedValue({ id: listingId })
  mocks.activeOwner.mockResolvedValue({ count: 1 })
  mocks.booking.mockResolvedValue({ listing_id: listingId })
  mocks.report.mockResolvedValue({ id: 'report', booking_id: listingId, status: 'open', booking: { seeker_id: 'renter', lister_id: 'host', status: 'disputed' } })
  mocks.user.mockImplementation(async ({ where }: { where: { id: string } }) => ({ staff_role: ['staff', 'second-staff'].includes(where.id) ? 'admin' : where.id === 'analyst' ? 'analyst' : null }))
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: mocks.lock,
    user: { findUnique: mocks.user, findUniqueOrThrow: mocks.user, updateMany: mocks.activeOwner }, listing: { findUnique: mocks.automatedListing, findUniqueOrThrow: mocks.findListing, update: mocks.updateListing }, documentReview: { upsert: mocks.review }, listingCapture: { findFirst: mocks.capture }, storageObject: { findFirst: mocks.storedVideo },
    adminAudit: { create: mocks.audit }, notification: { create: mocks.notify, createMany: mocks.notify }, booking: { findUnique: mocks.booking },
    dispute: { findUnique: mocks.report, findUniqueOrThrow: mocks.report, updateMany: mocks.updateReport } }))
})
afterEach(() => vi.unstubAllEnvs())

describe('server-owned staff access and publication', () => {
  it('denies an unprivileged direct domain caller before document lookup, storage preparation or transaction writes', async () => {
    mocks.user.mockResolvedValue({ staff_role: null })
    await expect(moderateListing('ordinary-user', listingId, 'approve_document', 'Unprivileged attempted document review')).rejects.toThrow('Staff access required')
    expect(mocks.automatedListing).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.review).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('denies publishing a closed owner but preserves suspension and document remediation', async () => {
    mocks.activeOwner.mockResolvedValue({ count: 0 })
    await expect(moderateListing('staff', listingId, 'publish', 'Reviewed owner closure')).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
    expect(mocks.updateListing).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
    await moderateListing('staff', listingId, 'suspend', 'Keep the historical listing unavailable')
    expect(mocks.updateListing).toHaveBeenCalledWith(expect.objectContaining({ data: { listing_status: 'suspended' } }))
  })
  it('uses current persisted roles and ignores obsolete environment allowlists', async () => {
    expect(await isAdminId('staff')).toBe(true); expect(await isAdminId('sta')).toBe(false); expect(await isAdminId('Staff')).toBe(false)
    mocks.authenticated.mockResolvedValue('ordinary-user')
    expect(await requireAdminId()).toBeNull(); expect(await requireInsightsId()).toBeNull()
    mocks.authenticated.mockResolvedValue('analyst'); expect(await requireInsightsId()).toBe('analyst'); expect(await requireAdminId()).toBeNull()
    vi.stubEnv('RENTRAL_ADMIN_IDS', 'ordinary-user'); mocks.authenticated.mockResolvedValue('staff'); expect(await requireAdminId()).toBe('staff')
    mocks.user.mockResolvedValue({ staff_role: null }); expect(await requireAdminId()).toBeNull()
  })
  it('denies untrusted admin action fields and unauthenticated callers before mutation', async () => {
    mocks.authenticated.mockResolvedValue('ordinary-user')
    expect(await adminOperationAction({ id: listingId, operation: 'publish', reason: 'Synthetic test moderation reason', is_admin: true })).toMatchObject({ success: false })
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.geocode).not.toHaveBeenCalled()
  })
  it('locks the listing and identity before publishing and records the decision', async () => {
    await moderateListing('staff', listingId, 'publish', 'Synthetic test moderation reason')
    expect(mocks.lock).toHaveBeenCalledTimes(3)
    expect(mocks.updateListing).toHaveBeenCalledWith({ where: { id: listingId }, data: { listing_status: 'active' } })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actor_id: 'staff', action: 'publish' }) }))
  })
  it.each(['account', 'document', 'human', 'address', 'distance', 'media', 'fee', 'feeAmount', 'feeOwner', 'status'])('fails closed when publication lacks %s', async missing => {
    const listing = eligibleListing()
    if (missing === 'account') listing.lister.id = ''
    if (missing === 'document') listing.documentReview.status = 'needs_review'
    if (missing === 'human') listing.documentReview.reviewed_by = ''
    if (missing === 'address') listing.verification.address_hash = 'stale-address-hash'
    if (missing === 'distance') listing.verification.distance_meters = 101
    if (missing === 'media') listing.media.status = 'processing'
    if (missing === 'fee') listing.payments = []
    if (missing === 'feeAmount') listing.payments[0].amount_kobo = BigInt(1)
    if (missing === 'feeOwner') listing.payments[0].user_id = 'other'
    if (missing === 'status') listing.listing_status = 'draft'
    mocks.findListing.mockResolvedValue(listing)
    await expect(moderateListing('staff', listingId, 'publish', 'Synthetic reason')).rejects.toThrow('Publication requires')
    expect(mocks.updateListing).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('publishes an otherwise approved listing without owner KYC or a chosen username', async () => {
    const listing = eligibleListing()
    listing.lister.kyc_verified = false
    listing.lister.username = ''
    mocks.findListing.mockResolvedValue(listing)
    await moderateListing('staff', listingId, 'publish', 'Reviewed listing evidence')
    expect(mocks.updateListing).toHaveBeenCalledWith({ where: { id: listingId }, data: { listing_status: 'active' } })
  })
  it('requires the current configured mode for new publication and preserves old fee records', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_owned_fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'live')
    for (const saved of ['test', null]) {
      const listing = eligibleListing(); listing.payments[0].provider_environment = saved
      mocks.findListing.mockResolvedValue(listing)
      await expect(moderateListing('staff', listingId, 'publish', 'Review current-mode payment evidence')).rejects.toThrow('Publication requires')
      expect(listing.payments[0].provider_environment).toBe(saved)
    }
    expect(mocks.updateListing).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
    const current = eligibleListing(); current.payments[0].provider_environment = 'live'; mocks.findListing.mockResolvedValue(current)
    await moderateListing('staff', listingId, 'publish', 'Reviewed matching live collection and asset evidence')
    expect(mocks.updateListing).toHaveBeenCalledWith({ where: { id: listingId }, data: { listing_status: 'active' } })
  })
  it('fails closed on new publication when payment configuration is disabled', async () => {
    vi.stubEnv('PAYMENTS_ENABLED', 'false')
    await expect(moderateListing('staff', listingId, 'publish', 'Reviewed existing historical fee')).rejects.toThrow('Publication requires')
    expect(mocks.updateListing).not.toHaveBeenCalled()
  })
  it('does not publish a legacy listing without a sealed recording-time capture', async () => {
    mocks.findListing.mockResolvedValue({ ...eligibleListing(), capture_id: null })
    await expect(moderateListing('staff', listingId, 'publish', 'Reviewed legacy recording evidence')).rejects.toThrow('Publication requires')
    expect(mocks.updateListing).not.toHaveBeenCalled()
  })
  it('binds human approval to the exact current durable document digest and path', async () => {
    await moderateListing('staff', listingId, 'approve_document', 'Human inspected this exact uploaded document')
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ approved_path: 'host/folder/title.pdf', approved_digest: 'd'.repeat(64), status: 'approved', reviewed_by: 'staff' }) }))
    expect(mocks.claim).toHaveBeenCalled()
    const changed = eligibleListing(); changed.documentReview.approved_digest = 'e'.repeat(64); mocks.findListing.mockResolvedValue(changed)
    await expect(moderateListing('staff', listingId, 'publish', 'Recheck changed document bytes')).rejects.toMatchObject({ code: 'PUBLICATION_REQUIREMENTS' })
  })
  it('publishes approved photo-only gallery inventory with an explicit fee waiver while payments and Mux are off', async () => {
    vi.stubEnv('PAYMENTS_ENABLED', 'false'); vi.stubEnv('MUX_ENABLED', 'false')
    mocks.findListing.mockResolvedValue({ ...eligibleListing(), media_source: 'approved_gallery', video_path: null, capture_id: null, privateLocation: null, verification: null, media: null, payments: [],
      fee_waived_at: new Date(), fee_waived_by: listingId, fee_waiver_reason: 'Approved publication without collecting a listing fee.' })
    await moderateListing('staff', listingId, 'publish', 'Human reviewed approved gallery and waiver')
    expect(mocks.gallery).toHaveBeenCalled(); expect(mocks.capture).not.toHaveBeenCalled()
    expect(mocks.updateListing).toHaveBeenCalledWith({ where: { id: listingId }, data: { listing_status: 'active' } })
  })
  it('still requires video processing for an approved gallery video and fails closed on permission revocation', async () => {
    mocks.findListing.mockResolvedValue({ ...eligibleListing(), media_source: 'approved_gallery', capture_id: null })
    mocks.gallery.mockRejectedValueOnce(new Error('GALLERY_PERMISSION_REQUIRED'))
    await expect(moderateListing('staff', listingId, 'publish', 'Reviewed current gallery permission')).rejects.toThrow('GALLERY_PERMISSION_REQUIRED')
    mocks.gallery.mockResolvedValue({ hasVideo: true }); vi.stubEnv('MUX_ENABLED', 'false')
    await expect(moderateListing('staff', listingId, 'publish', 'Reviewed unprocessed gallery video')).rejects.toMatchObject({ code: 'PUBLICATION_VIDEO_REQUIRED' })
    expect(mocks.updateListing).not.toHaveBeenCalled()
  })
  it('owner self-publication needs an explicit detailed override and records it without relaxing other prerequisites', async () => {
    mocks.user.mockResolvedValue({ staff_role: 'owner' })
    await expect(moderateListing('host', listingId, 'publish', 'Detailed human review of my own listing without explicit override')).rejects.toMatchObject({ code: 'INDEPENDENT_REVIEW_REQUIRED' })
    await moderateListing('host', listingId, 'publish', 'Detailed human review and explicit owner override for my own listing.', { ownerOverride: true })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: { ownerOverride: true, moneyMoved: false } }) }))
  })
  it('requires verification and private location to bind the same sealed capture', async () => {
    const listing = eligibleListing(); listing.verification.capture_id = listingId
    mocks.findListing.mockResolvedValue(listing)
    await expect(moderateListing('staff', listingId, 'publish', 'Reviewed changed capture evidence')).rejects.toThrow('Publication requires')
    expect(mocks.updateListing).not.toHaveBeenCalled()
  })
  it('prevents self moderation, draft document approval and self dispute resolution', async () => {
    mocks.user.mockResolvedValue({ staff_role: 'admin' })
    await expect(moderateListing('host', listingId, 'approve_document', 'Synthetic reason')).rejects.toThrow('own listing')
    mocks.findListing.mockResolvedValue({ ...eligibleListing(), listing_status: 'draft' })
    await expect(moderateListing('staff', listingId, 'approve_document', 'Synthetic reason')).rejects.toThrow('complete listing')
    mocks.report.mockResolvedValue({ booking_id: listingId, status: 'open', booking: { seeker_id: 'staff', lister_id: 'host', status: 'disputed' } })
    await expect(resolveDispute('staff', 'report', 'A sufficiently detailed synthetic review reason.', 'cancel')).rejects.toThrow('independent')
  })
  it('rejects role revocation between the initial action and its database transaction', async () => {
    mocks.authenticated.mockResolvedValue('staff')
    mocks.user.mockResolvedValueOnce({ staff_role: 'admin' }).mockResolvedValue({ staff_role: null })
    expect(await adminOperationAction({ id: listingId, operation: 'publish', reason: 'Synthetic moderation evidence reason' })).toMatchObject({ success: false })
    expect(mocks.updateListing).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('limits finance and analyst roles to their declared capabilities', async () => {
    mocks.user.mockResolvedValue({ staff_role: 'finance' })
    expect(await hasStaffPermission('staff', 'finance:review')).toBe(true)
    await expect(moderateListing('staff', listingId, 'publish', 'Synthetic reason')).rejects.toThrow('Staff access')
    await expect(resolveDispute('staff', 'report', 'A sufficiently detailed synthetic review reason.', 'cancel')).rejects.toThrow('Staff access')
    mocks.user.mockResolvedValue({ staff_role: 'analyst' })
    expect(await hasStaffPermission('staff', 'insights:view')).toBe(true)
    expect(await hasStaffPermission('staff', 'staff:workspace')).toBe(false)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('audits automated review attempts before provider work and forbids self review', async () => {
    mocks.authenticated.mockResolvedValue('staff'); mocks.automatedListing.mockResolvedValue({ lister_id: 'staff', listing_status: 'pending_verification' })
    expect(await adminOperationAction({ id: listingId, operation: 'check_address', reason: 'Synthetic check address reason' })).toMatchObject({ success: false })
    expect(mocks.geocode).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
    mocks.automatedListing.mockResolvedValue({ lister_id: 'host', listing_status: 'pending_verification' }); mocks.geocode.mockResolvedValue('matched')
    expect(await adminOperationAction({ id: listingId, operation: 'check_address', reason: 'Synthetic check address reason' })).toMatchObject({ success: true })
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.geocode.mock.invocationCallOrder[0])
  })
})
