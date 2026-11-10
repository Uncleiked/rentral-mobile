import prisma from '@/lib/db'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { addressFingerprint, decodeGeographicPoint, distanceMetersWgs84, SPATIAL_TOLERANCE_METERS } from '@/lib/listings/spatial'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { assertStaffPermission, staffPermissions } from '@/lib/auth/roles'
import { resolveBookingDispute } from '@/lib/lifecycle/disputes'
import { assertActiveAccounts } from '@/lib/accounts/availability'
import { PUBLICATION_FEE_KOBO } from '@/lib/contracts/listing-payments'
import { paymentsEnabled } from '@/lib/payments/config'
import { paystackEnvironment } from '@/lib/payments/providers/paystack/client'

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

export async function moderateListing(actorId: string, listingId: string, operation: 'approve_document' | 'reject_document' | 'publish' | 'suspend', reason: string): Promise<void> {
  await withTransaction(async tx => {
    await lockRecord(tx, 'listing', listingId)
    await assertStaffPermission(tx, actorId, 'listing:review')
    const listing = await tx.listing.findUniqueOrThrow({ where: { id: listingId },
      include: { lister: { select: { id: true, kyc_verified: true, username: true } }, documentReview: true,
        verification: true, privateLocation: true, media: true, payments: { where: { kind: 'listing_fee', status: 'succeeded' } } } })
    await lockRecord(tx, 'user', listing.lister_id)
    if (listing.lister_id === actorId) throw new Error('Staff cannot moderate their own listing.')
    if (operation === 'publish') {
      const environment = paymentsEnabled() ? paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim()) : null
      await assertActiveAccounts(tx, [listing.lister_id])
      const capture = listing.capture_id ? await tx.listingCapture.findFirst({ where: { id: listing.capture_id, owner_id: listing.lister_id, state: 'sealed', listing_id: listing.id, video_path: listing.video_path } }) : null
      const capturePoint = decodeGeographicPoint(capture?.start_geometry), storedPoint = decodeGeographicPoint(listing.privateLocation?.geometry)
      const storedVideo = capture?.video_object_id ? await tx.storageObject.findFirst({ where: { id: capture.video_object_id, owner_id: listing.lister_id, state: 'available', digest: capture.video_digest, path: listing.video_path ?? '' }, select: { id: true } }) : null
      if (listing.listing_status !== 'pending_verification' || listing.archived_at || !listing.lister.id ||
        !capture || !capturePoint || !storedPoint || !storedVideo || listing.privateLocation?.capture_id !== capture.id ||
        distanceMetersWgs84(capturePoint, storedPoint) > 0.001 || listing.verification?.capture_id !== capture.id ||
        !listing.document_path || listing.documentReview?.status !== 'approved' || !listing.documentReview.reviewed_by ||
        listing.verification?.spatial_status !== 'matched' || !listing.text_address ||
        listing.verification.address_hash !== addressFingerprint(listing.text_address) ||
        typeof listing.verification.distance_meters !== 'number' || !Number.isFinite(listing.verification.distance_meters) ||
        listing.verification.distance_meters < 0 || listing.verification.distance_meters > SPATIAL_TOLERANCE_METERS ||
        !muxEnabled() || !muxConfigured() || listing.media?.status !== 'ready' ||
        !environment || !listing.payments.some(payment => payment.amount_kobo === BigInt(PUBLICATION_FEE_KOBO) && payment.currency === 'NGN' && payment.user_id === listing.lister_id && payment.provider_environment === environment)) {
        throw new Error('Publication requires an active owner account, human document approval, a matching address, ready video and a verified publication fee.')
      }
      await tx.listing.update({ where: { id: listingId }, data: { listing_status: 'active' } })
    } else if (operation === 'suspend') {
      await tx.listing.update({ where: { id: listingId }, data: { listing_status: 'pending_verification' } })
    } else {
      if (listing.listing_status === 'draft') throw new Error('Submit a complete listing before reviewing its sealed documents.')
      if (!listing.document_path) throw new Error('There is no document to review.')
      const status = operation === 'approve_document' ? 'approved' : 'rejected'
      await tx.documentReview.upsert({ where: { listing_id: listingId },
        create: { listing_id: listingId, status, reviewed_by: actorId, findings: { note: reason } },
        update: { status, reviewed_by: actorId, findings: { note: reason, previous: listing.documentReview?.findings ?? null } } })
      // Any rejected document immediately removes that listing from discovery.
      if (status === 'rejected') await tx.listing.update({ where: { id: listingId }, data: { listing_status: 'pending_verification' } })
    }
    await tx.adminAudit.create({ data: { actor_id: actorId, action: operation, target_type: 'listing', target_id: listingId, reason } })
    await tx.notification.create({ data: { user_id: listing.lister_id, kind: 'listing_review', title: 'Listing review updated',
      body: operation === 'publish' ? 'Your listing is now live.' : 'Your listing review has an update. Open your assets for details.', href: `/marketplace/listing/${listingId}` } })
  })
}

export async function resolveDispute(actorId: string, disputeId: string, reason: string, decision?: 'resume' | 'complete' | 'cancel'): Promise<void> {
  return resolveBookingDispute(actorId, disputeId, { decision, reason })
}
