import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
const mocks = vi.hoisted(() => ({ account: vi.fn(), listing: vi.fn(), update: vi.fn(), document: vi.fn(), audit: vi.fn(), claims: vi.fn(), assets: vi.fn(), owned: vi.fn(), active: vi.fn(), lock: vi.fn(), receipt: vi.fn(), receiptCreate: vi.fn(), transaction: vi.fn(), organization: vi.fn(), barrier: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: mocks.owned }, adminAudit: { findFirst: mocks.barrier }, mutationReceipt: { findUnique: mocks.receipt } } }))
vi.mock('@/lib/database/transactions', () => ({ withTransaction: mocks.transaction, lockRecord: mocks.lock }))
vi.mock('@/lib/accounts/availability', () => ({ assertActiveAccounts: mocks.active }))
vi.mock('@/lib/storage-claims/service', () => ({ claimStorageObjects: mocks.claims }))
vi.mock('@/lib/listings/publication-assets', () => ({ assertListingPublicationAssets: mocks.assets }))
import { ApiError } from '@/lib/api/http'
import { applySubmissionPublishing, publishOwnListing, publishTrustedListingInTransaction, ownedDirectPublication } from '@/lib/listings/publishing'

const ownerId = '824ac8a3-930e-44bf-a8aa-6dd7998c2ea1', adminId = '180ffea3-877c-4263-a9d6-b6d13cce9691', listingId = '4498d069-9a31-455b-a88c-f337cfe3bfa1'
const at = new Date('2026-11-12T10:00:00.000Z'), reason = 'Established portfolio operator approved for direct publication.'
const document = { id: 'a'.repeat(64), bucket: 'compliance-docs' as const, path: ownerId + '/folder/authority.pdf', digest: 'b'.repeat(64), sizeBytes: 100, contentType: 'application/pdf' }
let row: Record<string, unknown>, account: Record<string, unknown>, receipts: Record<string, unknown>
const tx = { listing: { findFirst: mocks.listing, update: mocks.update }, user: { findUnique: mocks.account }, organizationApplication: { findUnique: mocks.organization }, storageObject: { findFirst: mocks.document }, adminAudit: { create: mocks.audit, findFirst: mocks.barrier }, mutationReceipt: { findUnique: mocks.receipt, create: mocks.receiptCreate } } as unknown as Prisma.TransactionClient
beforeEach(() => {
  vi.resetAllMocks(); receipts = {}; mocks.barrier.mockResolvedValue(null)
  account = { direct_publish_allowed: true, direct_publish_by: adminId, direct_publish_at: at, direct_publish_reason: reason, listing_fee_exempt: true, listing_fee_exempt_by: adminId, listing_fee_exempt_at: at, listing_fee_exempt_reason: 'Approved promotional free posting for this operator.' }
  row = { id: listingId, revision: 3, lister_id: ownerId, listing_status: 'pending_verification', document_path: document.path, text_address: '14 Yaba Street', archived_at: null, publication_mode: 'trusted_publisher',
    direct_publish_proof: { version: 1, ownerId, grantedBy: adminId, grantedAt: at.toISOString(), grantReason: reason, documentPath: document.path, documentDigest: document.digest, submittedAt: at.toISOString() }, documentReview: null }
  mocks.account.mockImplementation(async () => account)
  mocks.listing.mockImplementation(async ({ where }) => where.id === listingId && where.lister_id === ownerId ? row : null)
  mocks.owned.mockImplementation(async ({ where }) => where.id === listingId && where.lister_id === ownerId ? { ...row, lister: account } : null)
  mocks.update.mockImplementation(async ({ data }) => { Object.assign(row, data); return row })
  mocks.document.mockResolvedValue({ ...document, owner_id: ownerId, size_bytes: 100, content_type: 'application/pdf', state: 'available' })
  mocks.receipt.mockImplementation(async ({ where }) => receipts[where.id] ?? null)
  mocks.receiptCreate.mockImplementation(async ({ data }) => { receipts[data.id] = data; return data })
  mocks.transaction.mockImplementation(async callback => callback(tx))
  mocks.lock.mockImplementation(async () => { row.revision = Number(row.revision) + 1; return true })
})
describe('trusted submission policy', () => {
  it('publishes a ready gallery submission with a current free posting grant without manufacturing a human approval', async () => {
    await applySubmissionPublishing(tx, ownerId, listingId, [document])
    expect(row).toMatchObject({ listing_status: 'active', fee_waived_by: adminId, publication_mode: 'trusted_publisher', documentReview: null })
    expect(row.direct_publish_proof).toMatchObject({ ownerId, grantedBy: adminId, documentPath: document.path, documentDigest: document.digest })
    expect(mocks.assets).toHaveBeenCalledWith(tx, expect.objectContaining({ id: listingId }))
    expect(mocks.claims).toHaveBeenCalledWith(tx, ownerId, [document])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'trusted_listing_published', metadata: expect.objectContaining({ humanDocumentApproval: false, moneyMoved: false }) }) }))
  })
  it('keeps ordinary users in manual review even when free posting is granted', async () => {
    account.direct_publish_allowed = false; row.publication_mode = null; row.direct_publish_proof = null
    await applySubmissionPublishing(tx, ownerId, listingId, [document])
    expect(row.listing_status).toBe('pending_verification')
    expect(row.fee_waived_by).toBe(adminId)
    expect(row.direct_publish_proof).toBeNull()
    expect(mocks.assets).not.toHaveBeenCalled()
  })
  it.each(['PUBLICATION_FEE_REQUIRED', 'PUBLICATION_VIDEO_REQUIRED'])('retains an eligible submission for owner completion when %s is outstanding', async code => {
    account.listing_fee_exempt = false
    mocks.assets.mockRejectedValue(new ApiError(409, code, 'Not ready yet.'))
    await applySubmissionPublishing(tx, ownerId, listingId, [document])
    expect(row.listing_status).toBe('pending_verification')
    expect(row).not.toHaveProperty('fee_waived_at')
    expect(row.direct_publish_proof).toMatchObject({ documentDigest: document.digest })
  })
  it('does not treat incomplete flag-only grants as publication or free posting permission', async () => {
    account.direct_publish_by = null; account.listing_fee_exempt_reason = null
    row.publication_mode = null; row.direct_publish_proof = null
    await applySubmissionPublishing(tx, ownerId, listingId, [document])
    expect(row.listing_status).toBe('pending_verification')
    expect(row).not.toHaveProperty('fee_waived_at')
    expect(row.direct_publish_proof).toBeNull()
  })
  it('does not swallow location or storage trust failures', async () => {
    mocks.assets.mockRejectedValue(new ApiError(409, 'PUBLICATION_LOCATION_REQUIRED', 'Wrong sealed location.'))
    await expect(applySubmissionPublishing(tx, ownerId, listingId, [document])).rejects.toMatchObject({ code: 'PUBLICATION_LOCATION_REQUIRED' })
    expect(row.listing_status).not.toBe('active')
  })
})
describe('owner direct publication boundaries', () => {
  it.each(['draft', 'suspended', 'rented'])('cannot publish a %s listing', async status => {
    row.listing_status = status
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'PUBLICATION_BLOCKED' })
    expect(mocks.assets).not.toHaveBeenCalled()
  })
  it('cannot publish archived or rejected evidence', async () => {
    row.archived_at = at
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'PUBLICATION_BLOCKED' })
    row.archived_at = null; row.documentReview = { status: 'rejected' }
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'PUBLICATION_BLOCKED' })
  })
  it('blocks revoked or reissued grants and replaced documents', async () => {
    account.direct_publish_allowed = false
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'DIRECT_PUBLICATION_UNAVAILABLE' })
    account.direct_publish_allowed = true; account.direct_publish_at = new Date(at.getTime() + 1)
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'DIRECT_PUBLICATION_UNAVAILABLE' })
    account.direct_publish_at = at; row.document_path = ownerId + '/folder/replaced.pdf'
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'DIRECT_PUBLICATION_UNAVAILABLE' })
    row.document_path = document.path; mocks.document.mockResolvedValue(null)
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'PUBLICATION_DOCUMENT_CHANGED' })
    expect(mocks.assets).not.toHaveBeenCalled()
  })
  it('rechecks organization approval during the owner-locked publication transaction', async () => {
    account.account_type = 'organization'; mocks.organization.mockResolvedValue({ status: 'rejected' })
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'ORGANIZATION_APPROVAL_REQUIRED' })
    expect(mocks.assets).not.toHaveBeenCalled()
    mocks.organization.mockResolvedValue({ status: 'approved' })
    await publishTrustedListingInTransaction(tx, ownerId, listingId)
    expect(row.listing_status).toBe('active')
  })
  it('rejects a revision changed between observation and obtaining the listing write lock', async () => {
    mocks.lock.mockImplementationOnce(async () => { row.revision = 5; return true })
    await expect(publishOwnListing(ownerId, listingId, { clientId: '9b0e9231-12fd-4402-a862-e954843fb7ac', expectedRevision: 3 })).rejects.toMatchObject({ code: 'STALE_LISTING' })
    expect(mocks.assets).not.toHaveBeenCalled()
  })
  it('never reapplies a free posting grant to an old pending listing during completion', async () => {
    await publishTrustedListingInTransaction(tx, ownerId, listingId)
    expect(row).not.toHaveProperty('fee_waived_at')
  })
  it('requires ownership and current revision; identical completion requests replay exactly once', async () => {
    const command = { clientId: '9b0e9231-12fd-4402-a862-e954843fb7ac', expectedRevision: 3 }
    await expect(publishOwnListing(adminId, listingId, command)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(publishOwnListing(ownerId, listingId, { ...command, expectedRevision: 2 })).rejects.toMatchObject({ code: 'STALE_LISTING' })
    expect((await publishOwnListing(ownerId, listingId, command)).status).toBe('active')
    expect((await publishOwnListing(ownerId, listingId, command)).status).toBe('active')
    expect(mocks.assets).toHaveBeenCalledTimes(1)
    expect(mocks.receiptCreate).toHaveBeenCalledTimes(1)
    await expect(publishOwnListing(ownerId, listingId, { ...command, expectedRevision: 4 })).rejects.toMatchObject({ code: 'INVALID_RETRY' })
  })
})

function galleryAccount() {
  account.direct_publish_allowed = false; account.gallery_upload_allowed = true; account.gallery_permission_revision = 4
  row.media_source = 'approved_gallery'; row.gallery_permission_revision = 4; row.publication_mode = null; row.direct_publish_proof = null
}
describe('gallery approval includes review bypass with factual evidence', () => {
  it('publishes a ready gallery using only current gallery approval, with no fabricated direct issuer or document approval', async () => {
    galleryAccount()
    await applySubmissionPublishing(tx, ownerId, listingId, [document])
    expect(row).toMatchObject({ listing_status: 'active', publication_mode: 'trusted_publisher', documentReview: null })
    expect(row.direct_publish_proof).toMatchObject({ version: 2, basis: 'gallery_permission', ownerId, galleryPermissionRevision: 4, documentPath: document.path, documentDigest: document.digest })
    expect(row.direct_publish_proof).not.toHaveProperty('grantedBy')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'trusted_listing_published', metadata: expect.objectContaining({ permissionBasis: 'gallery_permission', galleryPermissionRevision: 4, humanDocumentApproval: false }) }) }))
  })
  it('does not waive fees merely because gallery publication is approved', async () => {
    galleryAccount(); account.listing_fee_exempt = false
    mocks.assets.mockRejectedValue(new ApiError(409, 'PUBLICATION_FEE_REQUIRED', 'Fee required.'))
    await applySubmissionPublishing(tx, ownerId, listingId, [document])
    expect(row.listing_status).toBe('pending_verification')
    expect(row).not.toHaveProperty('fee_waived_at')
    expect(row.direct_publish_proof).toMatchObject({ version: 2, basis: 'gallery_permission' })
    await expect(publishOwnListing(ownerId, listingId, { clientId: '9b0e9231-12fd-4402-a862-e954843fb7ac', expectedRevision: 3 })).rejects.toMatchObject({ code: 'PUBLICATION_FEE_REQUIRED' })
    expect(row.listing_status).not.toBe('active')
  })
  it('retains trusted intent while a gallery video finishes processing', async () => {
    galleryAccount(); mocks.assets.mockRejectedValue(new ApiError(409, 'PUBLICATION_VIDEO_REQUIRED', 'Processing.'))
    await applySubmissionPublishing(tx, ownerId, listingId, [document])
    expect(row).toMatchObject({ listing_status: 'pending_verification', publication_mode: 'trusted_publisher' })
  })
  it('does not turn gallery approval into authority for recorded submissions', async () => {
    galleryAccount(); row.media_source = 'recorded'
    await applySubmissionPublishing(tx, ownerId, listingId, [document])
    expect(row.listing_status).toBe('pending_verification'); expect(row.direct_publish_proof).toBeNull()
    expect(mocks.assets).not.toHaveBeenCalled()
  })
  it('rejects stale gallery revisions at submission', async () => {
    galleryAccount(); row.gallery_permission_revision = 3
    await expect(applySubmissionPublishing(tx, ownerId, listingId, [document])).rejects.toMatchObject({ code: 'DIRECT_PUBLICATION_UNAVAILABLE' })
    expect(row.listing_status).not.toBe('active')
  })
  it('rejects revoked or reissued gallery authority at completion', async () => {
    galleryAccount(); await applySubmissionPublishing(tx, ownerId, listingId, [document]); row.listing_status = 'pending_verification'
    account.gallery_upload_allowed = false
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'DIRECT_PUBLICATION_UNAVAILABLE' })
    account.gallery_upload_allowed = true; account.gallery_permission_revision = 5
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'DIRECT_PUBLICATION_UNAVAILABLE' })
  })
  it('offers old eligible gallery submissions an explicit owner completion without duplicate submission', async () => {
    galleryAccount()
    expect(await ownedDirectPublication(ownerId, listingId)).toMatchObject({ canPublish: true, status: 'pending_verification' })
    expect(mocks.update).not.toHaveBeenCalled()
    expect((await publishOwnListing(ownerId, listingId, { clientId: '9b0e9231-12fd-4402-a862-e954843fb7ac', expectedRevision: 3 })).status).toBe('active')
    expect(row.direct_publish_proof).toMatchObject({ version: 2, basis: 'gallery_permission', galleryPermissionRevision: 4 })
    expect(row.documentReview).toBeNull()
  })
  it('preserves immutable negative review barriers for old manual galleries', async () => {
    galleryAccount(); mocks.barrier.mockResolvedValue({ id: 'prior-negative-review' })
    expect(await ownedDirectPublication(ownerId, listingId)).toBeNull()
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'DIRECT_PUBLICATION_UNAVAILABLE' })
    expect(mocks.assets).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
  })
  it('does not revive a prior trusted proof cleared into manual review by an administrator', async () => {
    galleryAccount(); row.direct_publish_proof = { version: 2, basis: 'gallery_permission', ownerId, galleryPermissionRevision: 4, documentPath: document.path, documentDigest: document.digest, submittedAt: at.toISOString() }
    expect(await ownedDirectPublication(ownerId, listingId)).toBeNull()
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'DIRECT_PUBLICATION_UNAVAILABLE' })
  })
  it('requires an available digest-bound current document for legacy completion', async () => {
    galleryAccount(); mocks.document.mockResolvedValue(null)
    await expect(publishTrustedListingInTransaction(tx, ownerId, listingId)).rejects.toMatchObject({ code: 'PUBLICATION_DOCUMENT_CHANGED' })
    expect(mocks.assets).not.toHaveBeenCalled()
  })
})
