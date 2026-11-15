import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { committedMutation, mutationCommand, recordMutation, transactionMutation } from '@/lib/database/mutations'
import { claimStorageObjects, type PreparedStorageObject } from '@/lib/storage-claims/service'
import { assertListingPublicationAssets } from './publication-assets'
import { writeOwnedListingScalars } from './scalar-write'
import { directPublishingGranted, galleryPublishingGranted, publicationReviewBypassed, freePostingGranted, type PublicationGrantAccount } from './publishing-policy'
import { directPublicationCommandSchema, type DirectPublicationState } from '@/lib/contracts/direct-publication'

const accountGrantSelect = { account_type: true, gallery_upload_allowed: true, gallery_permission_revision: true, direct_publish_allowed: true, direct_publish_by: true, direct_publish_at: true, direct_publish_reason: true,
  listing_fee_exempt: true, listing_fee_exempt_by: true, listing_fee_exempt_at: true, listing_fee_exempt_reason: true } as const
const proofBase = { ownerId: z.string().min(1), documentPath: z.string().min(1).max(500), documentDigest: z.string().regex(/^[a-f0-9]{64}$/), submittedAt: z.string().datetime() }
const proofSchema = z.discriminatedUnion('version', [
  z.object({ ...proofBase, version: z.literal(1), grantedBy: z.string().uuid(), grantedAt: z.string().datetime(), grantReason: z.string().min(15) }).strict(),
  z.object({ ...proofBase, version: z.literal(2), basis: z.literal('gallery_permission'), galleryPermissionRevision: z.number().int().nonnegative().safe() }).strict(),
])
type PublicationProof = z.infer<typeof proofSchema>
type ProofListing = { lister_id: string; media_source?: string | null; gallery_permission_revision?: number | null; publication_mode?: string | null; direct_publish_proof?: unknown; document_path: string | null }
function currentGalleryBasis(listing: ProofListing, account: PublicationGrantAccount | null): boolean {
  return listing.media_source === 'approved_gallery' && galleryPublishingGranted(account) && listing.gallery_permission_revision != null && listing.gallery_permission_revision === (account?.gallery_permission_revision ?? 0)
}
function matchingProof(listing: ProofListing, account: PublicationGrantAccount | null): PublicationProof | null {
  const parsed = proofSchema.safeParse(listing.direct_publish_proof)
  if (listing.publication_mode !== 'trusted_publisher' || !parsed.success || parsed.data.ownerId !== listing.lister_id || parsed.data.documentPath !== listing.document_path) return null
  const proof = parsed.data
  if (proof.version === 2) return currentGalleryBasis(listing, account) && proof.galleryPermissionRevision === listing.gallery_permission_revision ? proof : null
  return directPublishingGranted(account) && proof.grantedBy === account?.direct_publish_by && proof.grantedAt === new Date(account!.direct_publish_at!).toISOString() && proof.grantReason === account!.direct_publish_reason!.trim() ? proof : null
}
function proofMetadata(proof: PublicationProof): Prisma.InputJsonObject {
  return proof.version === 1 ? { permissionBasis: 'direct_permission', grantedBy: proof.grantedBy, grantedAt: proof.grantedAt }
    : { permissionBasis: proof.basis, galleryPermissionRevision: proof.galleryPermissionRevision }
}
type SubmittedProofListing = ProofListing & { listing_status: string; archived_at?: Date | null; documentReview?: { status: string } | null }
function legacyGalleryCandidate(listing: SubmittedProofListing, account: PublicationGrantAccount | null): boolean {
  return currentGalleryBasis(listing, account) && listing.listing_status === 'pending_verification' && !listing.archived_at && Boolean(listing.document_path)
    && listing.documentReview?.status !== 'rejected' && listing.direct_publish_proof == null && (listing.publication_mode == null || listing.publication_mode === 'manual_review')
}
function reviewBarrierQuery(listingId: string) {
  return { where: { target_type: 'listing', target_id: listingId, action: { in: ['reject_document', 'suspend', 'suspend_listing'] } }, select: { id: true } } satisfies Prisma.AdminAuditFindFirstArgs
}

async function assertPublisherAdmission(tx: Prisma.TransactionClient, ownerId: string, account: { account_type?: string | null } | null): Promise<void> {
  if (!account) throw new ApiError(403, 'ACCOUNT_REQUIRED', 'This account is unavailable.')
  if (account.account_type == null || account.account_type === 'individual') return
  const application = account.account_type === 'organization' ? await tx.organizationApplication.findUnique({ where: { user_id: ownerId }, select: { status: true } }) : null
  if (application?.status !== 'approved') throw new ApiError(403, 'ORGANIZATION_APPROVAL_REQUIRED', 'Organization approval is required before publishing.')
}

function missingGrant(): ApiError { return new ApiError(409, 'DIRECT_PUBLICATION_UNAVAILABLE', 'Direct publishing is unavailable for this listing. Ask an administrator to review it.') }

/** Caller holds the active owner and current listing write locks. Never approves a document. */
export async function publishTrustedListingInTransaction(tx: Prisma.TransactionClient, ownerId: string, listingId: string): Promise<void> {
  const [listing, account] = await Promise.all([
    tx.listing.findFirst({ where: { id: listingId, lister_id: ownerId }, include: { documentReview: true, verification: true, privateLocation: true, media: true, payments: { where: { kind: 'listing_fee', status: 'succeeded' } } } }),
    tx.user.findUnique({ where: { id: ownerId }, select: accountGrantSelect }),
  ])
  if (!listing) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable to your account.')
  await assertPublisherAdmission(tx, ownerId, account)
  if (listing.listing_status !== 'pending_verification' || listing.archived_at || listing.documentReview?.status === 'rejected') throw new ApiError(409, 'PUBLICATION_BLOCKED', 'Only an eligible submitted listing can be published. Archived, rejected or suspended listings require administrative review.')
  let proof = matchingProof(listing, account)
  if (!proof && legacyGalleryCandidate(listing, account) && !await tx.adminAudit.findFirst(reviewBarrierQuery(listingId))) {
    const currentDocument = await tx.storageObject.findFirst({ where: { bucket: 'compliance-docs', owner_id: ownerId, path: listing.document_path!, state: 'available' } })
    const prepared = proofSchema.safeParse({ version: 2, basis: 'gallery_permission', ownerId, galleryPermissionRevision: listing.gallery_permission_revision,
      documentPath: listing.document_path, documentDigest: currentDocument?.digest, submittedAt: new Date().toISOString() })
    if (!prepared.success) throw new ApiError(409, 'PUBLICATION_DOCUMENT_CHANGED', 'The current authority document could not be confirmed. Reselect it or ask an administrator to review this listing.')
    proof = prepared.data
    await writeOwnedListingScalars(tx, listingId, ownerId, { publication_mode: 'trusted_publisher', direct_publish_proof: proof })
    await tx.adminAudit.create({ data: { actor_id: ownerId, action: 'trusted_publication_requested', target_type: 'listing', target_id: listingId,
      reason: 'Owner completed a previously submitted gallery listing under current gallery approval.', metadata: { ...proofMetadata(proof), documentPath: proof.documentPath, documentDigest: proof.documentDigest, humanDocumentApproval: false, moneyMoved: false } } })
  }
  if (!proof || !listing.text_address || !listing.document_path) throw missingGrant()
  const document = await tx.storageObject.findFirst({ where: { bucket: 'compliance-docs', owner_id: ownerId, path: proof.documentPath, digest: proof.documentDigest, state: 'available' } })
  if (!document || !document.digest || !document.size_bytes || !document.content_type) throw new ApiError(409, 'PUBLICATION_DOCUMENT_CHANGED', 'The exact submitted authority document is no longer available. Ask an administrator to review the current document.')
  await claimStorageObjects(tx, ownerId, [{ id: document.id, bucket: 'compliance-docs', path: document.path, digest: document.digest, sizeBytes: document.size_bytes, contentType: document.content_type }])
  await assertListingPublicationAssets(tx, listing)
  await writeOwnedListingScalars(tx, listingId, ownerId, { listing_status: 'active' })
  await tx.adminAudit.create({ data: { actor_id: ownerId, action: 'trusted_listing_published', target_type: 'listing', target_id: listingId,
    reason: proof.version === 2 ? 'Published under current administrator-approved gallery permission.' : 'Published under the current administrator-issued direct publishing permission.', metadata: { ...proofMetadata(proof), documentPath: proof.documentPath, documentDigest: proof.documentDigest, humanDocumentApproval: false, moneyMoved: false } } })
}

/** Called exactly once as part of a validated draft-to-submitted transaction. */
export async function applySubmissionPublishing(tx: Prisma.TransactionClient, ownerId: string, listingId: string, objects: readonly PreparedStorageObject[]): Promise<void> {
  const submitted = await tx.listing.findFirst({ where: { id: listingId, lister_id: ownerId }, select: { listing_status: true, archived_at: true, document_path: true, media_source: true, gallery_permission_revision: true } })
  if (!submitted || submitted.listing_status !== 'pending_verification' || submitted.archived_at) throw new ApiError(409, 'SUBMITTED_LISTING_REQUIRED', 'Only a new complete submission can use account publication permissions.')
  const account = await tx.user.findUnique({ where: { id: ownerId }, select: accountGrantSelect })
  await assertPublisherAdmission(tx, ownerId, account)
  const now = new Date()
  if (freePostingGranted(account)) {
    await writeOwnedListingScalars(tx, listingId, ownerId, { fee_waived_at: now, fee_waived_by: account!.listing_fee_exempt_by, fee_waiver_reason: account!.listing_fee_exempt_reason!.trim() })
    await tx.adminAudit.create({ data: { actor_id: ownerId, action: 'account_free_posting_applied', target_type: 'listing', target_id: listingId,
      reason: 'Applied the existing administrator-issued free posting permission to a new submission.', metadata: { grantedBy: account!.listing_fee_exempt_by, grantedAt: account!.listing_fee_exempt_at!.toISOString(), moneyMoved: false } } })
  }
  if (!publicationReviewBypassed(account, submitted.media_source)) return
  const document = objects.find(object => object.bucket === 'compliance-docs')
  if (!document || document.path !== submitted.document_path) throw new ApiError(409, 'DOCUMENT_REQUIRED', 'A validated authority document is required before submission.')
  const gallery = submitted.media_source === 'approved_gallery' && galleryPublishingGranted(account)
  if (gallery && submitted.gallery_permission_revision !== (account?.gallery_permission_revision ?? 0)) throw missingGrant()
  const common = { ownerId, documentPath: document.path, documentDigest: document.digest, submittedAt: now.toISOString() }
  const proof: PublicationProof = gallery ? { ...common, version: 2, basis: 'gallery_permission', galleryPermissionRevision: submitted.gallery_permission_revision! }
    : { ...common, version: 1, grantedBy: account!.direct_publish_by!, grantedAt: account!.direct_publish_at!.toISOString(), grantReason: account!.direct_publish_reason!.trim() }
  await writeOwnedListingScalars(tx, listingId, ownerId, { publication_mode: 'trusted_publisher', direct_publish_proof: proof })
  await tx.adminAudit.create({ data: { actor_id: ownerId, action: 'trusted_publication_requested', target_type: 'listing', target_id: listingId,
    reason: gallery ? 'Submitted under current administrator-approved gallery permission.' : 'Submitted under an existing administrator-issued direct publishing permission.', metadata: { ...proofMetadata(proof), documentPath: document.path, documentDigest: document.digest, humanDocumentApproval: false, moneyMoved: false } } })
  try { await publishTrustedListingInTransaction(tx, ownerId, listingId) }
  catch (error) {
    // A new submission remains saved while its fee or immutable video finishes.
    // All other trust failures abort the transaction instead of weakening checks.
    if (!(error instanceof ApiError && ['PUBLICATION_FEE_REQUIRED', 'PUBLICATION_VIDEO_REQUIRED'].includes(error.code))) throw error
  }
}

export async function ownedDirectPublication(ownerId: string, listingId: string): Promise<DirectPublicationState | null> {
  const row = await prisma.listing.findFirst({ where: { id: listingId, lister_id: ownerId }, select: { id: true, revision: true, listing_status: true, lister_id: true, publication_mode: true, direct_publish_proof: true, document_path: true, archived_at: true, media_source: true, gallery_permission_revision: true,
    documentReview: { select: { status: true } }, lister: { select: accountGrantSelect } } })
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable to your account.')
  const legacyGallery = legacyGalleryCandidate(row, row.lister) && !await prisma.adminAudit.findFirst(reviewBarrierQuery(listingId))
  if (row.publication_mode !== 'trusted_publisher' && !legacyGallery) return null
  const eligible = (Boolean(matchingProof(row, row.lister)) || legacyGallery) && row.listing_status === 'pending_verification' && !row.archived_at && row.documentReview?.status !== 'rejected'
  return { id: row.id, revision: row.revision, status: row.listing_status, trustedPublisher: true, canPublish: eligible,
    message: row.listing_status === 'active' ? 'Your listing is live.' : eligible ? 'This listing can publish without human review once its publication fee and media requirements are complete.' : 'Direct publishing is unavailable for this listing. Administrative review is required.' }
}

export async function publishOwnListing(ownerId: string, listingId: string, input: unknown): Promise<DirectPublicationState> {
  const parsed = directPublicationCommandSchema.parse(input)
  const command = mutationCommand(ownerId, 'listing_publish', parsed.clientId, { ...parsed, listingId })
  const saved = await committedMutation(command)
  if (saved && saved !== listingId) throw new ApiError(409, 'INVALID_RETRY', 'This saved request belongs to another listing.')
  if (!saved) {
    await withTransaction(async tx => {
      await assertActiveAccounts(tx, [ownerId])
      const replay = await transactionMutation(tx, command)
      if (replay) { if (replay !== listingId) throw new ApiError(409, 'INVALID_RETRY', 'This saved request belongs to another listing.'); return }
      const owned = await tx.listing.findFirst({ where: { id: listingId, lister_id: ownerId }, select: { id: true, revision: true } })
      if (!owned) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable to your account.')
      if (owned.revision !== parsed.expectedRevision || !await lockRecord(tx, 'listing', listingId)) throw new ApiError(409, 'STALE_LISTING', 'This listing changed. Refresh it before publishing.')
      const locked = await tx.listing.findFirst({ where: { id: listingId, lister_id: ownerId }, select: { revision: true } })
      if (!locked || locked.revision !== parsed.expectedRevision + 1) throw new ApiError(409, 'STALE_LISTING', 'This listing changed. Refresh it before publishing.')
      await publishTrustedListingInTransaction(tx, ownerId, listingId)
      await recordMutation(tx, command, listingId)
    })
  }
  const state = await ownedDirectPublication(ownerId, listingId)
  if (!state) throw missingGrant()
  return state
}

export async function readOwnPublicationRequest(ownerId: string, listingId: string, input: unknown): Promise<DirectPublicationState> {
  const parsed = directPublicationCommandSchema.parse(input)
  const command = mutationCommand(ownerId, 'listing_publish', parsed.clientId, { ...parsed, listingId })
  if (await committedMutation(command) !== listingId) throw new ApiError(404, 'REQUEST_UNCONFIRMED', 'The original publication request has no saved receipt yet. You may explicitly retry that exact request.')
  const state = await ownedDirectPublication(ownerId, listingId)
  if (!state) throw missingGrant()
  return state
}
