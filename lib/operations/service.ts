import prisma from '@/lib/db'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { addressFingerprint, SPATIAL_TOLERANCE_METERS } from '@/lib/listings/spatial'

export async function getAdminQueue() {
  const [listings, disputes, renewals, audit] = await Promise.all([
    prisma.listing.findMany({ where: { listing_status: 'pending_verification' }, take: 50, orderBy: { createdAt: 'asc' },
      select: { id: true, category: true, createdAt: true, documentReview: { select: { status: true, findings: true } },
        verification: { select: { spatial_status: true } }, lister: { select: { username: true, kyc_verified: true } },
        media: { select: { status: true } }, payments: { where: { kind: 'listing_fee', status: 'succeeded' }, select: { id: true } } } }),
    prisma.dispute.findMany({ where: { status: 'open' }, orderBy: { createdAt: 'asc' }, take: 50,
      select: { id: true, booking_id: true, reason: true, createdAt: true } }),
    prisma.renewal.findMany({ where: { status: 'pending_review' }, orderBy: { createdAt: 'asc' }, take: 50,
      select: { id: true, booking_id: true, reference: true, recipient_route: true } }),
    prisma.adminAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 30,
      select: { id: true, action: true, target_id: true, reason: true, createdAt: true } }),
  ])
  return { listings, disputes, renewals, audit }
}

export async function moderateListing(actorId: string, listingId: string, operation: 'approve_document' | 'reject_document' | 'publish' | 'suspend', reason: string): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Listing" WHERE id=${listingId} FOR UPDATE`
    await tx.$queryRaw`SELECT u.id FROM "User" u INNER JOIN "Listing" l ON l.lister_id=u.id WHERE l.id=${listingId} FOR UPDATE OF u`
    const listing = await tx.listing.findUniqueOrThrow({ where: { id: listingId },
      include: { lister: { select: { id: true, kyc_verified: true, username: true } }, documentReview: true,
        verification: true, media: true, payments: { where: { kind: 'listing_fee', status: 'succeeded' } } } })
    if (listing.lister_id === actorId) throw new Error('Staff cannot moderate their own listing.')
    if (operation === 'publish') {
      if (listing.listing_status !== 'pending_verification' || !listing.lister.kyc_verified || !listing.lister.username ||
        !listing.document_path || listing.documentReview?.status !== 'approved' || !listing.documentReview.reviewed_by ||
        listing.verification?.spatial_status !== 'matched' || !listing.text_address ||
        listing.verification.address_hash !== addressFingerprint(listing.text_address) ||
        typeof listing.verification.distance_meters !== 'number' || !Number.isFinite(listing.verification.distance_meters) ||
        listing.verification.distance_meters < 0 || listing.verification.distance_meters > SPATIAL_TOLERANCE_METERS ||
        !muxEnabled() || !muxConfigured() || listing.media?.status !== 'ready' ||
        !listing.payments.some(payment => payment.amount_kobo === BigInt(100000) && payment.currency === 'NGN' && payment.user_id === listing.lister_id)) {
        throw new Error('Publication requires current identity, human document approval, a matching address, ready video and a verified publication fee.')
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

export async function resolveDispute(actorId: string, disputeId: string, reason: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const report = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId }, include: { booking: true } })
    if ([report.booking.seeker_id, report.booking.lister_id].includes(actorId)) throw new Error('Staff cannot resolve their own dispute.')
    const updated = await tx.dispute.updateMany({ where: { id: disputeId, status: 'open' }, data: { status: 'resolved', resolution: reason } })
    if (!updated.count) throw new Error('This report has already been resolved.')
    // Resolving a report never pretends that money moved or a contract completed.
    await tx.adminAudit.create({ data: { actor_id: actorId, action: 'resolve_dispute', target_type: 'dispute', target_id: disputeId, reason } })
    await tx.notification.createMany({ data: [report.booking.seeker_id, report.booking.lister_id].map(user_id => ({ user_id,
      kind: 'dispute', title: 'Report reviewed', body: reason, href: `/marketplace/bookings/${report.booking_id}` })) })
  })
}
