import type { Prisma } from '@prisma/client'
import { ApiError } from '@/lib/api/http'
import { activeAccountWhere } from '@/lib/accounts/availability'
import { assertOwnerAdminReady } from '@/lib/database/readiness'
import { claimStorageObjects, prepareGalleryPhotos, prepareListingStorage, storageObjectId, type PreparedStorageObject } from '@/lib/storage-claims/service'
import { galleryProofSchema, type GalleryMediaProof } from '@/lib/contracts/gallery'
export type { GalleryMediaProof } from '@/lib/contracts/gallery'

export type GalleryListingState = { id: string; lister_id: string; media_source?: string | null; gallery_media: Prisma.JsonValue | null; gallery_media_paths?: string[]; gallery_permission_revision: number | null; video_path: string | null; poster_path: string | null }
type GalleryPermissionState = { media_source?: string | null; lister_id: string; gallery_permission_revision?: number | null }
type GalleryVisibilityState = { media_source?: string | null; gallery_media?: unknown; gallery_permission_revision?: number | null; lister?: { gallery_upload_allowed?: boolean | null; gallery_permission_revision?: number | null } | null }
export const galleryListingSelect = { media_source: true, gallery_media: true, gallery_permission_revision: true } as const
export const galleryUserSelect = { gallery_upload_allowed: true, gallery_permission_revision: true } as const

function denied(): ApiError { return new ApiError(403, 'GALLERY_PERMISSION_REQUIRED', 'Gallery uploads require current administrator approval. Contact support or record a new walkthrough with its location.') }
function invalidMedia(): ApiError { return new ApiError(409, 'GALLERY_MEDIA_UNAVAILABLE', 'These gallery files could not be confirmed. Keep the draft and choose the original uploaded files again.') }
export function galleryPhotoPaths(row: { gallery_media?: unknown }): string[] {
  const parsed = galleryProofSchema.safeParse(row.gallery_media)
  return parsed.success ? parsed.data.filter(item => item.kind === 'image').map(item => item.path) : []
}

/** A user-row write serializes attachment/publication with grant revocation. */
export async function assertGalleryPermission(tx: Prisma.TransactionClient, ownerId: string, expectedRevision?: number): Promise<number> {
  await assertOwnerAdminReady()
  const owner = await tx.user.findFirst({ where: { id: ownerId, ...activeAccountWhere }, select: { gallery_upload_allowed: true, gallery_permission_revision: true } })
  const revision = owner?.gallery_permission_revision ?? 0
  if (!owner?.gallery_upload_allowed || !Number.isSafeInteger(revision) || revision < 0 || expectedRevision !== undefined && revision !== expectedRevision) throw denied()
  const locked = await tx.user.updateMany({ where: { id: ownerId, ...activeAccountWhere, gallery_upload_allowed: true,
    OR: revision === 0 ? [{ gallery_permission_revision: 0 }, { gallery_permission_revision: null }, { gallery_permission_revision: { isSet: false } }] : [{ gallery_permission_revision: revision }] }, data: { revision: { increment: 1 } } })
  if (locked.count !== 1) throw denied()
  return revision
}

/** Recorded rows retain their existing policy. Gallery grants must match exactly. */
export async function assertGalleryListingCurrent(tx: Prisma.TransactionClient, listing: GalleryPermissionState): Promise<void> {
  if (listing.media_source == null || listing.media_source === 'recorded') return
  if (listing.media_source !== 'approved_gallery' || listing.gallery_permission_revision == null) throw denied()
  await assertGalleryPermission(tx, listing.lister_id, listing.gallery_permission_revision)
}

/** Used only for public projections, never to authorize a write. */
export function galleryIsPublic(row: GalleryVisibilityState): boolean {
  if (row.media_source == null || row.media_source === 'recorded') return true
  if (row.media_source !== 'approved_gallery' || row.lister?.gallery_upload_allowed !== true || row.gallery_permission_revision == null
    || !Number.isSafeInteger(row.gallery_permission_revision) || row.gallery_permission_revision < 0 || row.gallery_permission_revision !== (row.lister.gallery_permission_revision ?? 0)) return false
  const parsed = galleryProofSchema.safeParse(row.gallery_media)
  return parsed.success && parsed.data.length > 0
}

/** Byte work is outside retry callbacks. The transaction later reclaims exact metadata. */
export async function prepareGalleryMedia(ownerId: string, input: { galleryPhotos?: string[]; videoPath?: string; posterPath?: string; documentPath?: string }) {
  const photos = await prepareGalleryPhotos(ownerId, input.galleryPhotos ?? [])
  const other = await prepareListingStorage(ownerId, { videoPath: input.videoPath, documentPath: input.documentPath, posterPath: photos.length ? undefined : input.posterPath })
  const media = [...photos, ...other.filter(object => object.bucket === 'listings-media')]
  const proof: GalleryMediaProof[] = media.map(object => ({ kind: object.contentType.startsWith('image/') ? 'image' : 'video', path: object.path, objectId: object.id, digest: object.digest, sizeBytes: object.sizeBytes, contentType: object.contentType as GalleryMediaProof['contentType'] }))
  if (!galleryProofSchema.safeParse(proof).success) throw invalidMedia()
  return { objects: [...photos, ...other], proof, paths: proof.map(item => item.path.toLowerCase()), posterPath: photos[0]?.path ?? input.posterPath ?? null }
}

/** Call under the listing lock, in the same transaction that publishes it. */
export async function assertGalleryPublication(tx: Prisma.TransactionClient, listing: GalleryListingState): Promise<{ hasVideo: boolean }> {
  if (listing.media_source !== 'approved_gallery') throw invalidMedia()
  await assertGalleryListingCurrent(tx, listing)
  const parsed = galleryProofSchema.safeParse(listing.gallery_media)
  if (!parsed.success || !parsed.data.length) throw invalidMedia()
  const photos = parsed.data.filter(item => item.kind === 'image'), videos = parsed.data.filter(item => item.kind === 'video')
  if ((videos[0]?.path ?? null) !== listing.video_path || photos.length && photos[0].path !== listing.poster_path
    || !listing.gallery_media_paths || listing.gallery_media_paths.length !== parsed.data.length || parsed.data.some(item => !listing.gallery_media_paths!.includes(item.path.toLowerCase()))) throw invalidMedia()
  const objects: PreparedStorageObject[] = parsed.data.map(item => {
    if (!item.path.startsWith(`${listing.lister_id}/`) || item.objectId !== storageObjectId('listings-media', item.path)) throw invalidMedia()
    return { id: item.objectId, bucket: 'listings-media', path: item.path, digest: item.digest, sizeBytes: item.sizeBytes, contentType: item.contentType }
  })
  await claimStorageObjects(tx, listing.lister_id, objects)
  return { hasVideo: videos.length > 0 }
}
