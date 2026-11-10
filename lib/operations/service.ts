import prisma from '@/lib/db'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { addressFingerprint, decodeGeographicPoint, distanceMetersWgs84, SPATIAL_TOLERANCE_METERS } from '@/lib/listings/spatial'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertStaffPermission, hasStaffPermission, staffPermissions } from '@/lib/auth/roles'
import { resolveBookingDispute } from '@/lib/lifecycle/disputes'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { PUBLICATION_FEE_KOBO } from '@/lib/contracts/listing-payments'
import { paymentsEnabled } from '@/lib/payments/config'
import { paystackEnvironment } from '@/lib/payments/providers/paystack/client'
import type { Prisma } from '@prisma/client'
import { ApiError } from '@/lib/api/http'
import { claimStorageObjects, prepareListingStorage, type PreparedStorageObject } from '@/lib/storage-claims/service'
import { publicationFeeWaived } from '@/lib/listings/fee-policy'
import { assertGalleryPublication } from '@/lib/listings/gallery'
import { assertOwnerAdminReady } from '@/lib/database/readiness'

export async function getAdminQueue(actorId: string) {
  const permissions = await staffPermissions(actorId)
  if (!permissions.includes('staff:workspace')) throw new Error('Staff access required.')
  const [listings, disputes, renewals, audit] = await Promise.all([
    permissions.includes('listing:review') ? prisma.listing.findMany({ where: { listing_status: 'pending_verification' }, take: 50, orderBy: { createdAt: 'asc' },
      select: { id: true, category: true, createdAt: true, documentReview: { select: { status: true, findings: true } },
        verification: { select: { spatial_status: true } }, lister: { select: { username: true, kyc_verified: true } },
        media: { select: { status: true } }, payments: { where: { kind: 'listing_fee', status: 'succeeded' }, select: { id: true } } } }) : [],
    permissions.includes('dispute:review') ? prisma.dispute.findMany({ where: { status: 'open' }, orderBy: { createdAt: 'asc' }, take: 50,
      select: { id: true, booking_id: true, reason: true, createdAt: true } }) : [],
    permissions.includes('renewal:review') ? prisma.renewal.findMany({ where: { status: 'pending_review' }, orderBy: { createdAt: 'asc' }, take: 50,
      select: { id: true, booking_id: true, reference: true, recipient_route: true } }) : [],
    permissions.includes('operations:read') ? prisma.adminAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 30,
      select: { id: true, action: true, target_id: true, reason: true, createdAt: true } }) : [],
  ])
  return { listings, disputes, renewals, audit, permissions }
}

export type ListingModeration = 'approve_document' | 'reject_document' | 'publish' | 'suspend' | 'waive_fee' | 'revoke_fee_waiver'
export type ListingModerationOptions = { expectedRevision?: number; ownerOverride?: boolean; document?: PreparedStorageObject[] }

export async function prepareDocumentApproval(listingId: string): Promise<PreparedStorageObject[]> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { lister_id: true, document_path: true } })
  if (!listing?.document_path) throw new ApiError(409, 'DOCUMENT_REQUIRED', 'There is no document to review.')
  return prepareListingStorage(listing.lister_id, { documentPath: listing.document_path })
}

/** Shared by web actions and native commands. Caller owns the transaction/receipt. */
export async function moderateListingInTransaction(tx: Prisma.TransactionClient, actorId: string, listingId: string, operation: ListingModeration, reason: string, options: ListingModerationOptions = {}): Promise<string> {
    await assertStaffPermission(tx, actorId, ['waive_fee', 'revoke_fee_waiver'].includes(operation) ? 'listing:waive' : 'listing:review')
    if (!await lockRecord(tx, 'listing', listingId)) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable.')
    const listing = await tx.listing.findUniqueOrThrow({ where: { id: listingId },
      include: { lister: { select: { id: true, kyc_verified: true, username: true } }, documentReview: true,
        verification: true, privateLocation: true, media: true, payments: { where: { kind: 'listing_fee', status: 'succeeded' } } } })
    if (options.expectedRevision !== undefined && listing.revision !== options.expectedRevision + 1) throw new ApiError(409, 'ADMIN_TARGET_CHANGED', 'This listing changed. Refresh it before reviewing again.')
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId }, select: { staff_role: true } })
    const selfReview = listing.lister_id === actorId
    if (selfReview && !(actor.staff_role === 'owner' && options.ownerOverride && reason.trim().length >= 30)) throw new ApiError(403, 'INDEPENDENT_REVIEW_REQUIRED', 'Another reviewer is required. The owner must explicitly record an owner override to review their own listing.')
    await lockRecord(tx, 'user', listing.lister_id)
    let reviewMetadata: Prisma.InputJsonObject = {}
    if (operation === 'publish') {
      const environment = paymentsEnabled() ? paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim()) : null
      await assertActiveAccounts(tx, [listing.lister_id])
      const document = listing.document_path ? await tx.storageObject.findFirst({ where: { bucket: 'compliance-docs', path: listing.document_path, owner_id: listing.lister_id, state: 'available' }, select: { digest: true } }) : null
      if (!['pending_verification', 'suspended'].includes(listing.listing_status) || listing.archived_at || !listing.lister.id || !listing.text_address || !listing.document_path || !document?.digest ||
        listing.documentReview?.status !== 'approved' || !listing.documentReview.reviewed_by || listing.documentReview.approved_path !== listing.document_path || listing.documentReview.approved_digest !== document.digest) {
        throw new ApiError(409, 'PUBLICATION_REQUIREMENTS', 'Publication requires a submitted listing and human approval of its exact current document.')
      }
      let needsVideo = true
      if (listing.media_source === 'approved_gallery') {
        needsVideo = (await assertGalleryPublication(tx, listing)).hasVideo
      } else {
        const capture = listing.capture_id ? await tx.listingCapture.findFirst({ where: { id: listing.capture_id, owner_id: listing.lister_id, state: 'sealed', listing_id: listing.id, video_path: listing.video_path } }) : null
        const capturePoint = decodeGeographicPoint(capture?.start_geometry), storedPoint = decodeGeographicPoint(listing.privateLocation?.geometry)
        const storedVideo = capture?.video_object_id ? await tx.storageObject.findFirst({ where: { id: capture.video_object_id, owner_id: listing.lister_id, state: 'available', digest: capture.video_digest, path: listing.video_path ?? '' }, select: { id: true } }) : null
        if (!capture || !capturePoint || !storedPoint || !storedVideo || listing.privateLocation?.capture_id !== capture.id ||
          distanceMetersWgs84(capturePoint, storedPoint) > 0.001 || listing.verification?.capture_id !== capture.id || listing.verification?.spatial_status !== 'matched' ||
          listing.verification.address_hash !== addressFingerprint(listing.text_address) || typeof listing.verification.distance_meters !== 'number' ||
          !Number.isFinite(listing.verification.distance_meters) || listing.verification.distance_meters < 0 || listing.verification.distance_meters > SPATIAL_TOLERANCE_METERS) {
          throw new ApiError(409, 'PUBLICATION_LOCATION_REQUIRED', 'Publication requires the exact sealed walkthrough and a matching address.')
        }
      }
      if (needsVideo && (!muxEnabled() || !muxConfigured() || listing.media?.status !== 'ready' || listing.media.source_path !== listing.video_path)) throw new ApiError(409, 'PUBLICATION_VIDEO_REQUIRED', 'Publication requires the current video to finish processing.')
      if (!publicationFeeWaived(listing) && (!environment || !listing.payments.some(payment => payment.amount_kobo === BigInt(PUBLICATION_FEE_KOBO) && payment.currency === 'NGN' && payment.user_id === listing.lister_id && payment.provider_environment === environment))) throw new ApiError(409, 'PUBLICATION_FEE_REQUIRED', 'Publication requires a verified publication fee or an explicit administrative waiver.')
      await tx.listing.update({ where: { id: listingId }, data: { listing_status: 'active' } })
    } else if (operation === 'suspend') {
      await tx.listing.update({ where: { id: listingId }, data: { listing_status: 'suspended' } })
    } else if (operation === 'waive_fee' || operation === 'revoke_fee_waiver') {
      if (listing.listing_status === 'draft' || listing.archived_at) throw new ApiError(409, 'SUBMITTED_LISTING_REQUIRED', 'Submit the listing before reviewing its publication fee.')
      await tx.listing.update({ where: { id: listingId }, data: operation === 'waive_fee' ? { fee_waived_at: new Date(), fee_waived_by: actorId, fee_waiver_reason: reason } :
        { fee_waived_at: null, fee_waived_by: null, fee_waiver_reason: null, ...(listing.listing_status === 'active' ? { listing_status: 'pending_verification' } : {}) } })
    } else {
      if (listing.listing_status === 'draft') throw new Error('Submit a complete listing before reviewing its sealed documents.')
      if (!listing.document_path) throw new Error('There is no document to review.')
      const status = operation === 'approve_document' ? 'approved' : 'rejected'
      const approved = options.document?.find(object => object.bucket === 'compliance-docs' && object.path === listing.document_path)
      if (status === 'approved' && !approved) throw new ApiError(409, 'DOCUMENT_CHANGED', 'The document changed or is unavailable. Open the current document before approving it.')
      if (approved) await claimStorageObjects(tx, listing.lister_id, [approved])
      reviewMetadata = { documentPath: listing.document_path, approvedDigest: status === 'approved' ? approved!.digest : null, previousFindings: listing.documentReview?.findings ?? null }
      await tx.documentReview.upsert({ where: { listing_id: listingId },
        create: { listing_id: listingId, status, reviewed_by: actorId, approved_path: status === 'approved' ? approved!.path : null, approved_digest: status === 'approved' ? approved!.digest : null, findings: { note: reason, source: 'human_review' } },
        update: { status, reviewed_by: actorId, approved_path: status === 'approved' ? approved!.path : null, approved_digest: status === 'approved' ? approved!.digest : null, findings: { note: reason, source: 'human_review' } } })
      // Any rejected document immediately removes that listing from discovery.
      if (status === 'rejected') await tx.listing.update({ where: { id: listingId }, data: { listing_status: 'pending_verification' } })
    }
    const audit = await tx.adminAudit.create({ data: { actor_id: actorId, action: operation, target_type: 'listing', target_id: listingId, reason, metadata: { ...reviewMetadata, ownerOverride: selfReview, moneyMoved: false } } })
    await tx.notification.create({ data: { user_id: listing.lister_id, kind: 'listing_review', title: 'Listing review updated',
      body: operation === 'publish' ? 'Your listing is now live.' : 'Your listing review has an update. Open your assets for details.', href: `/marketplace/listing/${listingId}` } })
    return audit.id
}

export async function moderateListing(actorId: string, listingId: string, operation: ListingModeration, reason: string, options: ListingModerationOptions = {}): Promise<void> {
  await assertOwnerAdminReady()
  const permission = operation === 'waive_fee' || operation === 'revoke_fee_waiver' ? 'listing:waive' : 'listing:review'
  if (!await hasStaffPermission(actorId, permission)) throw new Error('Staff access required.')
  const document = operation === 'approve_document' ? await prepareDocumentApproval(listingId) : undefined
  await withTransaction(tx => moderateListingInTransaction(tx, actorId, listingId, operation, reason, { ...options, document }))
}

export async function resolveDispute(actorId: string, disputeId: string, reason: string, decision?: 'resume' | 'complete' | 'cancel'): Promise<void> {
  return resolveBookingDispute(actorId, disputeId, { decision, reason })
}
