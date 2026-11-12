import type { Prisma } from '@prisma/client'
import { ApiError } from '@/lib/api/http'
import { muxConfigured, muxEnabled } from '@/lib/media/config'
import { addressFingerprint, decodeGeographicPoint, distanceMetersWgs84, SPATIAL_TOLERANCE_METERS } from './spatial'
import { assertGalleryPublication } from './gallery'
import { publicationFeeWaived } from './fee-policy'
import { paymentsEnabled } from '@/lib/payments/config'
import { paystackEnvironment } from '@/lib/payments/providers/paystack/client'
import { PUBLICATION_FEE_KOBO } from '@/lib/contracts/listing-payments'

export type PublicationListing = Prisma.ListingGetPayload<{ include: { verification: true; privateLocation: true; media: true; payments: true } }>
/** Shared factual asset/processing/fee checks. This does not approve a document. */
export async function assertListingPublicationAssets(tx: Prisma.TransactionClient, listing: PublicationListing): Promise<void> {
  const environment = paymentsEnabled() ? paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim()) : null
  let needsVideo = true
  if (listing.media_source === 'approved_gallery') {
    needsVideo = (await assertGalleryPublication(tx, listing)).hasVideo
  } else {
    const capture = listing.capture_id ? await tx.listingCapture.findFirst({ where: { id: listing.capture_id, owner_id: listing.lister_id, state: 'sealed', listing_id: listing.id, video_path: listing.video_path } }) : null
    const capturePoint = decodeGeographicPoint(capture?.start_geometry), storedPoint = decodeGeographicPoint(listing.privateLocation?.geometry)
    const storedVideo = capture?.video_object_id ? await tx.storageObject.findFirst({ where: { id: capture.video_object_id, owner_id: listing.lister_id, state: 'available', digest: capture.video_digest, path: listing.video_path ?? '' }, select: { id: true } }) : null
    if (!listing.text_address || !capture || !capturePoint || !storedPoint || !storedVideo || listing.privateLocation?.capture_id !== capture.id ||
      distanceMetersWgs84(capturePoint, storedPoint) > 0.001 || listing.verification?.capture_id !== capture.id || listing.verification?.spatial_status !== 'matched' ||
      listing.verification.address_hash !== addressFingerprint(listing.text_address) || typeof listing.verification.distance_meters !== 'number' ||
      !Number.isFinite(listing.verification.distance_meters) || listing.verification.distance_meters < 0 || listing.verification.distance_meters > SPATIAL_TOLERANCE_METERS) {
      throw new ApiError(409, 'PUBLICATION_LOCATION_REQUIRED', 'Publication requires the exact sealed walkthrough and a matching address.')
    }
  }
  if (needsVideo && (!muxEnabled() || !muxConfigured() || listing.media?.status !== 'ready' || listing.media.source_path !== listing.video_path)) throw new ApiError(409, 'PUBLICATION_VIDEO_REQUIRED', 'Publication requires the current video to finish processing.')
  if (!publicationFeeWaived(listing) && (!environment || !listing.payments.some(payment => payment.listing_id === listing.id && payment.kind === 'listing_fee' && payment.status === 'succeeded' && payment.amount_kobo === BigInt(PUBLICATION_FEE_KOBO) && payment.currency === 'NGN' && payment.user_id === listing.lister_id && payment.provider_environment === environment))) throw new ApiError(409, 'PUBLICATION_FEE_REQUIRED', 'Publication requires a verified publication fee or an explicit administrative waiver.')
}
