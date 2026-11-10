import { createHash } from 'node:crypto'
import { galleryProofSchema } from '../contracts/gallery.ts'
import { BackupError } from './archive.ts'
import type { ObjectMetadata } from '../local-storage/core.ts'

type RecordValue = Record<string, unknown>
/** Verify every gallery item, including photos beyond the primary poster. */
export async function verifyGalleryReferences(listing: RecordValue, file: (path: string, owner: unknown) => Promise<ObjectMetadata>, claim: (id: string) => Promise<RecordValue | null>): Promise<void> {
  if (listing.media_source !== 'approved_gallery') return
  const parsed = galleryProofSchema.safeParse(listing.gallery_media)
  if (!parsed.success || !parsed.data.length && listing.listing_status !== 'draft' || !Number.isSafeInteger(listing.gallery_permission_revision)
    || Number(listing.gallery_permission_revision) < 0 || listing.capture_id != null) throw new BackupError('GALLERY_PROOF_INVALID')
  const paths = listing.gallery_media_paths
  if (!Array.isArray(paths) || paths.length !== parsed.data.length || parsed.data.some(item => !paths.includes(item.path.toLowerCase()))) throw new BackupError('GALLERY_PATHS_INVALID')
  const photos = parsed.data.filter(item => item.kind === 'image'), videos = parsed.data.filter(item => item.kind === 'video')
  if ((videos[0]?.path ?? null) !== (listing.video_path ?? null) || photos.length && photos[0].path !== listing.poster_path) throw new BackupError('GALLERY_BINDING_INVALID')
  for (const item of parsed.data) {
    if (item.objectId !== createHash('sha256').update(`listings-media\0${item.path.toLowerCase()}`).digest('hex')) throw new BackupError('GALLERY_OBJECT_ID_INVALID')
    const info = await file(item.path, listing.lister_id)
    const object = await claim(item.objectId)
    if (info.digest !== item.digest || info.size !== item.sizeBytes || info.contentType !== item.contentType || !object || object.owner_id !== listing.lister_id
      || object.bucket !== 'listings-media' || object.path !== item.path || object.state !== 'available' || object.digest !== item.digest || object.size_bytes !== item.sizeBytes || object.content_type !== item.contentType) throw new BackupError('GALLERY_CLAIM_DIGEST_MISMATCH')
  }
}
