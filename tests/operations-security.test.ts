import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), transaction: vi.fn(), lock: vi.fn(), activeOwner: vi.fn(), user: vi.fn(), findListing: vi.fn(), updateListing: vi.fn(), review: vi.fn(), audit: vi.fn(), notify: vi.fn(), report: vi.fn(), booking: vi.fn(), updateReport: vi.fn(), automatedListing: vi.fn(), geocode: vi.fn(), analyze: vi.fn() }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.authenticated }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: (work: (tx: unknown) => Promise<unknown>) => mocks.transaction(work), lockRecord: async (_tx: unknown, model: string, id: string) => { mocks.lock(model, id); return true } }))
vi.mock('@/lib/db', () => ({ default: { $transaction: mocks.transaction, user: { findUnique: mocks.user }, listing: { findUnique: mocks.automatedListing }, adminAudit: { create: mocks.audit } } }))
vi.mock('@/lib/documents/analyze', () => ({ analyzeListingDocument: mocks.analyze }))
vi.mock('@/lib/listings/spatial', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/listings/spatial')>(), verifyListingAddress: mocks.geocode }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({ assertLifecycleReady: async () => undefined }))

import { isAdminId, requireAdminId, requireInsightsId } from '@/lib/operations/access'
import { moderateListing, resolveDispute } from '@/lib/operations/service'
import { addressFingerprint } from '@/lib/listings/spatial'
import { adminOperationAction } from '@/app/actions/adminActions'
import { hasStaffPermission } from '@/lib/auth/roles'

const listingId = '11111111-1111-4111-8111-111111111111'
function eligibleListing() {
  return { id: listingId, lister_id: 'host', listing_status: 'pending_verification', text_address: 'Synthetic Yaba address', document_path: 'host/folder/title.pdf',
    lister: { id: 'host', kyc_verified: true, username: 'host' }, documentReview: { status: 'approved', reviewed_by: 'other-staff', findings: {} },
    verification: { spatial_status: 'matched', address_hash: addressFingerprint('Synthetic Yaba address'), distance_meters: 25 },
    media: { status: 'ready' }, payments: [{ amount_kobo: BigInt(100000), currency: 'NGN', user_id: 'host', provider_environment: 'test' as string | null }] }
}

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('RENTRAL_ADMIN_IDS', ' staff,second-staff '); vi.stubEnv('RENTRAL_INSIGHTS_IDS', 'analyst')
  vi.stubEnv('PAYMENTS_ENABLED', 'true'); vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_owned_fixture'); vi.stubEnv('PAYSTACK_ENVIRONMENT', 'test')
  vi.stubEnv('MUX_ENABLED', 'true'); for (const name of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) vi.stubEnv(name, 'configured-test-value')
  mocks.findListing.mockResolvedValue(eligibleListing())
  mocks.activeOwner.mockResolvedValue({ count: 1 })
  mocks.booking.mockResolvedValue({ listing_id: listingId })
  mocks.report.mockResolvedValue({ id: 'report', booking_id: listingId, status: 'open', booking: { seeker_id: 'renter', lister_id: 'host', status: 'disputed' } })
  mocks.user.mockImplementation(async ({ where }: { where: { id: string } }) => ({ staff_role: ['staff', 'second-staff'].includes(where.id) ? 'admin' : where.id === 'analyst' ? 'analyst' : null }))
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $queryRaw: mocks.lock,
    user: { findUnique: mocks.user, updateMany: mocks.activeOwner }, listing: { findUnique: mocks.automatedListing, findUniqueOrThrow: mocks.findListing, update: mocks.updateListing }, documentReview: { upsert: mocks.review },
    adminAudit: { create: mocks.audit }, notification: { create: mocks.notify, createMany: mocks.notify }, booking: { findUnique: mocks.booking },
    dispute: { findUnique: mocks.report, findUniqueOrThrow: mocks.report, updateMany: mocks.updateReport } }))
})
afterEach(() => vi.unstubAllEnvs())

describe('server-owned staff access and publication', () => {
  it('denies publishing a closed owner but preserves suspension and document remediation', async () => {
    mocks.activeOwner.mockResolvedValue({ count: 0 })
    await expect(moderateListing('staff', listingId, 'publish', 'Reviewed owner closure')).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
    expect(mocks.updateListing).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
    await moderateListing('staff', listingId, 'suspend', 'Keep the historical listing unavailable')
    expect(mocks.updateListing).toHaveBeenCalledWith(expect.objectContaining({ data: { listing_status: 'pending_verification' } }))
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
