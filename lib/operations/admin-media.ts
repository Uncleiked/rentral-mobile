import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { createAdminClient } from '@/lib/admin'
import { ApiError } from '@/lib/api/http'
import { hasStaffPermission } from '@/lib/auth/roles'
import { assertOwnerAdminReady } from '@/lib/database/readiness'
import { adminIdSchema } from '@/lib/api/admin'
import { adminListingMediaSchema } from '@/lib/contracts/admin-media'
import { galleryProofSchema, type GalleryMediaProof } from '@/lib/contracts/gallery'
import { requireOwnedStoragePath, uploadPolicy } from '@/lib/local-storage/policy'
import { storageFileUrl } from '@/lib/local-storage/urls'
import { storageObjectId } from '@/lib/storage-claims/service'

const listingMediaSelect = { id: true, revision: true, lister_id: true, listing_status: true, media_source: true,
  video_path: true, poster_path: true, gallery_media: true, gallery_media_paths: true } satisfies Prisma.ListingSelect
type ListingMediaRow = Prisma.ListingGetPayload<{ select: typeof listingMediaSelect }>
const objectSelect = { id: true, revision: true, bucket: true, path: true, owner_id: true, state: true, digest: true, size_bytes: true, content_type: true } satisfies Prisma.StorageObjectSelect
type MediaObject = Prisma.StorageObjectGetPayload<{ select: typeof objectSelect }>
type Candidate = { kind: 'image' | 'video'; path: string; proof?: GalleryMediaProof }
const PREVIEW_SECONDS = 60
function unavailable(): ApiError { return new ApiError(409, 'MEDIA_UNAVAILABLE', 'The current media could not be confirmed. Refresh the listing or ask its host to upload the original files again.') }
async function requireReviewer(actorId: string): Promise<void> {
  await assertOwnerAdminReady()
  if (!await hasStaffPermission(actorId, 'listing:review')) throw new ApiError(403, 'STAFF_REQUIRED', 'Your current account does not have this administrative permission.')
}
function candidates(row: ListingMediaRow): Candidate[] {
  if (row.media_source === 'approved_gallery') {
    const parsed = galleryProofSchema.safeParse(row.gallery_media)
    if (!parsed.success || !parsed.data.length) throw unavailable()
    const photos = parsed.data.filter(item => item.kind === 'image'), videos = parsed.data.filter(item => item.kind === 'video')
    if ((videos[0]?.path ?? null) !== row.video_path || photos.length && photos[0].path !== row.poster_path
      || row.gallery_media_paths.length !== parsed.data.length || parsed.data.some(item => !row.gallery_media_paths.includes(item.path.toLowerCase()))) throw unavailable()
    return parsed.data.map(proof => ({ kind: proof.kind, path: proof.path, proof }))
  }
  if (row.media_source != null && row.media_source !== 'recorded' || !row.video_path) throw unavailable()
  return [{ kind: 'video', path: row.video_path }, ...(row.poster_path ? [{ kind: 'image' as const, path: row.poster_path }] : [])]
}
function ownedObject(row: ListingMediaRow, item: Candidate, object: MediaObject | undefined): MediaObject {
  try {
    requireOwnedStoragePath('listings-media', item.path, row.lister_id)
    if (!object || object.id !== storageObjectId('listings-media', item.path) || object.bucket !== 'listings-media'
      || object.owner_id !== row.lister_id || object.path.toLowerCase() !== item.path.toLowerCase() || object.state !== 'available'
      || !object.digest || !/^[a-f0-9]{64}$/.test(object.digest) || !Number.isSafeInteger(object.size_bytes) || !object.size_bytes || object.size_bytes <= 0 || !object.content_type) throw unavailable()
    const policy = uploadPolicy('listings-media', item.path, object.content_type)
    if (!object.content_type.startsWith(`${item.kind}/`) || object.size_bytes > policy.maximumBytes) throw unavailable()
    if (item.proof && (item.proof.objectId !== object.id || item.proof.digest !== object.digest || item.proof.sizeBytes !== object.size_bytes || item.proof.contentType !== object.content_type)) throw unavailable()
    return object
  } catch { throw unavailable() }
}

/** Read-only human review. Never adopt files, grant access or expose documents. */
export async function getAdminListingMedia(actorId: string, id: string) {
  await requireReviewer(actorId)
  adminIdSchema.parse(id)
  const row = await prisma.listing.findFirst({ where: { id, listing_status: { not: 'draft' } }, select: listingMediaSelect })
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'This submitted listing is unavailable.')
  const items = candidates(row)
  const ids = items.map(item => { try { requireOwnedStoragePath('listings-media', item.path, row.lister_id); return storageObjectId('listings-media', item.path) } catch { throw unavailable() } })
  if (new Set(ids).size !== items.length) throw unavailable()
  const records = await prisma.storageObject.findMany({ where: { id: { in: ids }, owner_id: row.lister_id, bucket: 'listings-media', state: 'available' }, select: objectSelect })
  const objects = items.map((item, index) => ownedObject(row, item, records.find(record => record.id === ids[index])))
  const storage = createAdminClient().storage.from('listings-media')
  for (let index = 0; index < items.length; index++) {
    const info = await storage.info(items[index].path), object = objects[index]
    if (info.error || !info.data || info.data.digest !== object.digest || info.data.size !== object.size_bytes || info.data.contentType !== object.content_type) throw unavailable()
  }
  // Recheck revisions after file inspection. URLs are issued only for the same
  // submitted listing and immutable objects that the reviewer just requested.
  const current = await prisma.listing.findFirst({ where: { id, revision: row.revision, listing_status: { not: 'draft' } }, select: listingMediaSelect })
  const fresh = await prisma.storageObject.findMany({ where: { id: { in: ids }, owner_id: row.lister_id, bucket: 'listings-media', state: 'available' }, select: objectSelect })
  if (!current || JSON.stringify(current) !== JSON.stringify(row) || objects.some(object => !fresh.some(value => value.id === object.id && value.revision === object.revision && value.digest === object.digest && value.path === object.path && value.size_bytes === object.size_bytes && value.content_type === object.content_type))) throw unavailable()
  await requireReviewer(actorId)
  const expiresAt = new Date(Date.now() + PREVIEW_SECONDS * 1000).toISOString()
  const previews = []
  for (const item of items) {
    const signed = await storage.createSignedUrl(item.path, PREVIEW_SECONDS)
    if (signed.error || !signed.data) throw unavailable()
    try {
      const expected = new URL(storageFileUrl('listings-media', item.path)), url = new URL(signed.data.signedUrl)
      if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash || url.searchParams.size !== 1 || !url.searchParams.get('token')) throw unavailable()
      previews.push({ kind: item.kind, url: `${url.pathname}${url.search}`, expiresAt })
    } catch { throw unavailable() }
  }
  await requireReviewer(actorId)
  return adminListingMediaSchema.parse({ items: previews, source: row.media_source === 'approved_gallery' ? 'approved_gallery' : 'recorded' })
}
