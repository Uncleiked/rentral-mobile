import prisma from '@/lib/db'
import { LISTING_METADATA_SCHEMAS, LISTING_CATEGORIES, DRAFT_WIZARD_STEPS, ownerListingDetailSchema, ownerListingPageSchema, ownerVaultPageSchema, type ListingCategory } from '@/lib/contracts/listings'
import { deriveListingTitle, formatListingPrice, listingPriceDenomination, type ListingMetadataJson } from '@/lib/profile-data'
import { originalNameFromPath } from '@/lib/storage'
import { archiveBoundary, nextArchiveCursor, type ArchiveQuery } from './archive'
import { ApiError } from './http'
import { vaultNeighborhood } from '@/lib/vault-policy'
import { galleryPhotoPaths, galleryListingSelect } from '@/lib/listings/gallery'

function metadataObject(value: unknown, category: ListingCategory): ListingMetadataJson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const allowed = new Set(Object.keys(LISTING_METADATA_SCHEMAS[category].shape))
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => allowed.has(key) && (typeof item === 'string' && item.length <= 1500 || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item) || item === null)))
}
function categoryValue(value: string): ListingCategory {
  if (!(LISTING_CATEGORIES as readonly string[]).includes(value)) throw new ApiError(409, 'LISTING_UNAVAILABLE', 'This listing category needs review before it can be edited.')
  return value as ListingCategory
}
const summarySelect = { id: true, category: true, listing_status: true, base_rent_amount: true, asset_metadata: true, video_path: true, document_path: true, createdAt: true, archived_at: true, text_address: true, ...galleryListingSelect } as const
export async function ownListingPage(userId: string, query: ArchiveQuery, vault = false) {
  const rows = await prisma.listing.findMany({ where: { lister_id: userId, ...archiveBoundary(query.cursor), ...(vault ? { listing_status: 'draft', AND: [{ OR: [{ video_path: { not: null } }, { gallery_media_paths: { isEmpty: false } }] }] } : {}) },
    select: summarySelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 })
  const items = rows.slice(0, query.limit).map(row => {
    const category = categoryValue(row.category)
    const metadata = metadataObject(row.asset_metadata, category)
    return { id: row.id, category, title: typeof metadata.listingTitle === 'string' && metadata.listingTitle.trim() ? metadata.listingTitle.trim() : deriveListingTitle(category, metadata),
      status: row.listing_status, price: row.base_rent_amount === null ? '' : formatListingPrice(row.base_rent_amount),
      pricePeriod: typeof metadata.pricePeriod === 'string' && ['year', 'month', 'day', 'trip'].includes(metadata.pricePeriod) ? metadata.pricePeriod : listingPriceDenomination(category),
      createdAt: row.createdAt.toISOString(), hasVideo: Boolean(row.video_path), hasDocument: Boolean(row.document_path), archivedAt: row.archived_at?.toISOString() ?? null,
      ...(row.media_source === 'approved_gallery' ? { mediaSource: 'approved_gallery' as const, galleryPhotos: galleryPhotoPaths(row) } : {}),
      ...(vault ? { area: vaultNeighborhood(row.text_address, metadata.neighborhood) } : {}) }
  })
  return (vault ? ownerVaultPageSchema : ownerListingPageSchema).parse({ items, nextCursor: nextArchiveCursor(rows, query.limit), limit: query.limit })
}
export async function ownListingDetail(userId: string, listingId: string) {
  const row = await prisma.listing.findFirst({ where: { id: listingId, lister_id: userId }, select: { ...summarySelect, revision: true, text_address: true, wizard_step: true, poster_path: true, updatedAt: true, capture_id: true,
    privateLocation: { select: { id: true, capture_id: true } } } })
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'This listing is unavailable to your account.')
  const category = categoryValue(row.category)
  const isDraft = row.listing_status === 'draft'
  const capture = row.media_source !== 'approved_gallery' && row.capture_id && row.privateLocation?.capture_id === row.capture_id ? await prisma.listingCapture.findFirst({
    where: { id: row.capture_id, owner_id: userId, state: 'sealed', listing_id: row.id, video_path: row.video_path }, select: { id: true },
  }) : null
  return ownerListingDetailSchema.parse({ id: row.id, revision: row.revision, category, status: row.listing_status, address: row.text_address ?? '', basePrice: row.base_rent_amount === null ? '' : String(row.base_rent_amount),
    metadata: metadataObject(row.asset_metadata, category), wizardStep: (DRAFT_WIZARD_STEPS as readonly string[]).includes(row.wizard_step ?? '') ? row.wizard_step : null,
    videoPath: row.video_path, documentPath: row.document_path, posterPath: row.poster_path, documentName: originalNameFromPath(row.document_path), hasCoords: Boolean(capture), captureId: capture?.id ?? null,
    ...(row.media_source === 'approved_gallery' ? { mediaSource: 'approved_gallery', galleryPhotos: galleryPhotoPaths(row) } : {}),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), archivedAt: row.archived_at?.toISOString() ?? null,
    actions: { edit: !isDraft && !row.archived_at, resume: isDraft && !row.archived_at, archive: !row.archived_at, restore: Boolean(row.archived_at) } })
}
