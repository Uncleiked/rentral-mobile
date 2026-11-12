import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { lockRecord, withTransaction } from '@/lib/database/transactions'
import { committedMutation, mutationCommand, recordMutation, transactionMutation } from '@/lib/database/mutations'
import { claimStorageObjects, type PreparedStorageObject } from '@/lib/storage-claims/service'
import { assertListingPublicationAssets } from './publication-assets'
import { directPublishingGranted, freePostingGranted, type PublicationGrantAccount } from './publishing-policy'
import { directPublicationCommandSchema, type DirectPublicationState } from '@/lib/contracts/direct-publication'

const accountGrantSelect = { account_type: true, direct_publish_allowed: true, direct_publish_by: true, direct_publish_at: true, direct_publish_reason: true,
  listing_fee_exempt: true, listing_fee_exempt_by: true, listing_fee_exempt_at: true, listing_fee_exempt_reason: true } as const
const proofSchema = z.object({ version: z.literal(1), ownerId: z.string().min(1), grantedBy: z.string().uuid(), grantedAt: z.string().datetime(),
  grantReason: z.string().min(15), documentPath: z.string().min(1).max(500), documentDigest: z.string().regex(/^[a-f0-9]{64}$/), submittedAt: z.string().datetime() }).strict()

type ProofListing = { lister_id: string; publication_mode?: string | null; direct_publish_proof?: unknown; document_path: string | null }
function matchingProof(listing: ProofListing, account: PublicationGrantAccount | null) {
  const proof = proofSchema.safeParse(listing.direct_publish_proof)
  if (!directPublishingGranted(account) || listing.publication_mode !== 'trusted_publisher' || !proof.success ||
    proof.data.ownerId !== listing.lister_id || proof.data.documentPath !== listing.document_path || proof.data.grantedBy !== account?.direct_publish_by ||
    proof.data.grantedAt !== new Date(account!.direct_publish_at!).toISOString() || proof.data.grantReason !== account!.direct_publish_reason!.trim()) return null
  return proof.data
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
  const proof = matchingProof(listing, account)
  if (!proof || !listing.text_address || !listing.document_path) throw missingGrant()
  const document = await tx.storageObject.findFirst({ where: { bucket: 'compliance-docs', owner_id: ownerId, path: proof.documentPath, digest: proof.documentDigest, state: 'available' } })
  if (!document || !document.digest || !document.size_bytes || !document.content_type) throw new ApiError(409, 'PUBLICATION_DOCUMENT_CHANGED', 'The exact submitted authority document is no longer available. Ask an administrator to review the current document.')
  await claimStorageObjects(tx, ownerId, [{ id: document.id, bucket: 'compliance-docs', path: document.path, digest: document.digest, sizeBytes: document.size_bytes, contentType: document.content_type }])
  await assertListingPublicationAssets(tx, listing)
  await tx.listing.update({ where: { id: listingId }, data: { listing_status: 'active' } })
  await tx.adminAudit.create({ data: { actor_id: ownerId, action: 'trusted_listing_published', target_type: 'listing', target_id: listingId,
    reason: 'Published under the current administrator-issued direct publishing permission.', metadata: { grantedBy: proof.grantedBy, grantedAt: proof.grantedAt, documentPath: proof.documentPath, documentDigest: proof.documentDigest, humanDocumentApproval: false, moneyMoved: false } } })
}

/** Called exactly once as part of a validated draft-to-submitted transaction. */
export async function applySubmissionPublishing(tx: Prisma.TransactionClient, ownerId: string, listingId: string, objects: readonly PreparedStorageObject[]): Promise<void> {
  const submitted = await tx.listing.findFirst({ where: { id: listingId, lister_id: ownerId }, select: { listing_status: true, archived_at: true, document_path: true } })
  if (!submitted || submitted.listing_status !== 'pending_verification' || submitted.archived_at) throw new ApiError(409, 'SUBMITTED_LISTING_REQUIRED', 'Only a new complete submission can use account publication permissions.')
  const account = await tx.user.findUnique({ where: { id: ownerId }, select: accountGrantSelect })
  await assertPublisherAdmission(tx, ownerId, account)
  const now = new Date()
  if (freePostingGranted(account)) {
    await tx.listing.update({ where: { id: listingId }, data: { fee_waived_at: now, fee_waived_by: account!.listing_fee_exempt_by, fee_waiver_reason: account!.listing_fee_exempt_reason!.trim() } })
    await tx.adminAudit.create({ data: { actor_id: ownerId, action: 'account_free_posting_applied', target_type: 'listing', target_id: listingId,
      reason: 'Applied the existing administrator-issued free posting permission to a new submission.', metadata: { grantedBy: account!.listing_fee_exempt_by, grantedAt: account!.listing_fee_exempt_at!.toISOString(), moneyMoved: false } } })
  }
  if (!directPublishingGranted(account)) return
  const document = objects.find(object => object.bucket === 'compliance-docs')
  if (!document || document.path !== submitted.document_path) throw new ApiError(409, 'DOCUMENT_REQUIRED', 'A validated authority document is required before submission.')
  await tx.listing.update({ where: { id: listingId }, data: { publication_mode: 'trusted_publisher', direct_publish_proof: {
    version: 1, ownerId, grantedBy: account!.direct_publish_by!, grantedAt: account!.direct_publish_at!.toISOString(), grantReason: account!.direct_publish_reason!.trim(),
    documentPath: document.path, documentDigest: document.digest, submittedAt: now.toISOString(),
  } } })
  await tx.adminAudit.create({ data: { actor_id: ownerId, action: 'trusted_publication_requested', target_type: 'listing', target_id: listingId,
    reason: 'Submitted under an existing administrator-issued direct publishing permission.', metadata: { grantedBy: account!.direct_publish_by!, grantedAt: account!.direct_publish_at!.toISOString(), documentPath: document.path, documentDigest: document.digest, humanDocumentApproval: false, moneyMoved: false } } })
  try { await publishTrustedListingInTransaction(tx, ownerId, listingId) }
  catch (error) {
    // A new submission remains saved while its fee or immutable video finishes.
    // All other trust failures abort the transaction instead of weakening checks.
    if (!(error instanceof ApiError && ['PUBLICATION_FEE_REQUIRED', 'PUBLICATION_VIDEO_REQUIRED'].includes(error.code))) throw error
  }
}

export async function ownedDirectPublication(ownerId: string, listingId: string): Promise<DirectPublicationState | null> {
  const row = await prisma.listing.findFirst({ where: { id: listingId, lister_id: ownerId }, select: { id: true, revision: true, listing_status: true, lister_id: true, publication_mode: true, direct_publish_proof: true, document_path: true, archived_at: true,
    documentReview: { select: { status: true } }, lister: { select: accountGrantSelect } } })
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable to your account.')
  if (row.publication_mode !== 'trusted_publisher') return null
  const eligible = Boolean(matchingProof(row, row.lister)) && row.listing_status === 'pending_verification' && !row.archived_at && row.documentReview?.status !== 'rejected'
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
