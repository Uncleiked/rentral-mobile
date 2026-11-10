import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { activeAccountWhere } from '@/lib/accounts/availability'
import { publicAvatarReference } from '@/lib/accounts/avatar-reference'
import { platformEnabled } from '@/lib/platform'
import { muxEnabled } from '@/lib/media/config'
import { listingMediaStatuses } from '@/lib/media/status'
import { listingMediaUrl, listingPhotoUrl } from '@/lib/storage'
import { galleryIsPublic, galleryPhotoPaths, galleryListingSelect, galleryUserSelect } from '@/lib/listings/gallery'
import { formatListingPrice, listingPriceDenomination, type ListingMetadataJson } from '@/lib/profile-data'
import { DISCOVERY_PAGE_SIZE, discoveryLocation, type DiscoveryCursor, type DiscoveryFilters } from '@/lib/discovery-policy'

const listingSelect = {
  id: true, category: true, text_address: true, base_rent_amount: true,
  asset_metadata: true, video_path: true, poster_path: true, listing_status: true,
  createdAt: true, lister_id: true,
  ...galleryListingSelect,
  lister: { select: { username: true, avatar_url: true, kyc_verified: true, account_type: true, bio: true, createdAt: true, ...galleryUserSelect } },
} satisfies Prisma.ListingSelect

type ListingRow = Prisma.ListingGetPayload<{ select: typeof listingSelect }>
export type DiscoveryListing = {
  id: string; title: string; category: 'house' | 'car' | 'boat'; location: string
  price: string; priceDenomination: string; posterUrl: string | null; videoUrl: string | null
  useMux: boolean; username: string; avatarUrl: string | null; isVerified: boolean
  badges: string[]; saved: boolean; savingAvailable: boolean
  intent: string
  holdUntil?: string | null
  mediaSource?: 'recorded' | 'approved_gallery'
  galleryPhotoUrls?: string[]
}
export type ListingDetails = DiscoveryListing & {
  listerId: string; isOwner: boolean; status: string; metadata: ListingMetadataJson
  hostBio: string | null; hostSince: string; hostAccountType: string; postedOn: string
}
export type DiscoveryPage = { listings: DiscoveryListing[]; nextCursor: DiscoveryCursor | null }

function metadataRecord(value: unknown): ListingMetadataJson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number | boolean | null] => {
    const item: unknown = entry[1]
    return item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
  }))
}

function listingTitle(category: string, metadata: ListingMetadataJson): string {
  if (typeof metadata.listingTitle === 'string' && metadata.listingTitle.trim()) return metadata.listingTitle.trim().slice(0, 100)
  if (category === 'house') return String(metadata.bedrooms) === '0' ? 'Studio home' : metadata.bedrooms ? `${metadata.bedrooms}-bedroom home` : 'Home in Lagos'
  if (category === 'car') return metadata.fuelType ? `${metadata.fuelType} car · ${metadata.transmission || 'Rental'}` : 'Car in Lagos'
  return typeof metadata.vesselType === 'string' && metadata.vesselType ? metadata.vesselType : 'Boat in Lagos'
}

function listingBadges(category: string, metadata: ListingMetadataJson): string[] {
  if (category === 'house') return [metadata.bedrooms ? `${metadata.bedrooms} beds` : '', metadata.bathrooms ? `${metadata.bathrooms} baths` : '', metadata.sizeSqm ? `${metadata.sizeSqm} m²` : ''].filter(Boolean)
  if (category === 'car') return [typeof metadata.transmission === 'string' ? metadata.transmission : '', metadata.seats ? `${metadata.seats} seats` : '', metadata.mileageKm ? `${Number(metadata.mileageKm).toLocaleString('en-NG')} km` : ''].filter(Boolean)
  return [metadata.capacityPersons ? `${metadata.capacityPersons} guests` : '', metadata.hasCaptain ? 'Captain included' : ''].filter(Boolean)
}

async function serializeListings(rows: ListingRow[], userId: string | null, allowOwnUnavailable = false): Promise<DiscoveryListing[]> {
  const useMux = muxEnabled()
  const media = await listingMediaStatuses(rows.map(row => row.id))
  const savingAvailable = platformEnabled() && Boolean(userId)
  const saves = savingAvailable && userId && rows.length ? await prisma.savedListing.findMany({
    where: { user_id: userId, listing_id: { in: rows.map(row => row.id) } }, select: { listing_id: true },
  }) : []
  const savedIds = new Set(saves.map(save => save.listing_id))
  const holds = platformEnabled() && rows.length ? await prisma.booking.findMany({
    where: { listing_id: { in: rows.map(row => row.id) }, kind: 'hold', expires_at: { gt: new Date() }, OR: [
      { status: 'confirmed' }, { status: 'converted', allocated_hold_credit: { rental_booking: { status: 'awaiting_payment', expires_at: { gt: new Date() } } } },
    ] },
    select: { listing_id: true, expires_at: true, allocated_hold_credit: { select: { rental_booking: { select: { expires_at: true } } } } }, orderBy: { expires_at: 'desc' }, take: rows.length * 7,
  }) : []
  const holdDeadlines = new Map<string, string>()
  for (const hold of holds) if (hold.expires_at && !holdDeadlines.has(hold.listing_id)) {
    const paymentDeadline = hold.allocated_hold_credit?.rental_booking.expires_at
    holdDeadlines.set(hold.listing_id, new Date(Math.min(hold.expires_at.getTime(), paymentDeadline?.getTime() ?? Infinity)).toISOString())
  }
  return rows.flatMap(row => {
    if (!galleryIsPublic(row) && !(allowOwnUnavailable && row.lister_id === userId)) return []
    if (!row.lister.username || (row.category !== 'house' && row.category !== 'car' && row.category !== 'boat')) return []
    // An active listing cannot advertise an unfinished video when Mux is enabled.
    const rowUseMux = useMux && Boolean(row.video_path)
    if (rowUseMux && row.listing_status === 'active' && media.get(row.id)?.status !== 'ready') return []
    const metadata = metadataRecord(row.asset_metadata)
    return [{
      id: row.id, title: listingTitle(row.category, metadata), category: row.category,
      location: discoveryLocation(row.text_address), price: formatListingPrice(row.base_rent_amount),
      priceDenomination: typeof metadata.pricePeriod === 'string' && ['year', 'month', 'day', 'trip'].includes(metadata.pricePeriod) ? metadata.pricePeriod : listingPriceDenomination(row.category),
      posterUrl: row.poster_path ? listingMediaUrl(row.id, 'poster') : null,
      videoUrl: !rowUseMux && row.video_path ? listingMediaUrl(row.id, 'video') : null,
      useMux: rowUseMux && row.listing_status !== 'draft', username: row.lister.username,
      mediaSource: row.media_source === 'approved_gallery' ? 'approved_gallery' : 'recorded',
      galleryPhotoUrls: galleryPhotoPaths(row).map((_path, index) => listingPhotoUrl(row.id, index)),
      avatarUrl: publicAvatarReference(row.lister.avatar_url, row.lister_id), isVerified: row.lister.kyc_verified,
      badges: [...listingBadges(row.category, metadata), ...(row.media_source === 'approved_gallery' ? ['Admin-approved gallery'] : [])], saved: savedIds.has(row.id), savingAvailable,
      holdUntil: holdDeadlines.get(row.id) ?? null,
      intent: typeof metadata.rentalIntent === 'string' && ['rent', 'buy', 'squat', 'shortlet'].includes(metadata.rentalIntent) ? metadata.rentalIntent : 'rent',
    }]
  })
}

function discoveryConditions(filters: DiscoveryFilters): Prisma.InputJsonObject[] {
  const conditions: Prisma.InputJsonObject[] = [{ listing_status: 'active' }]
  if (filters.category !== 'all') conditions.push({ category: filters.category })
  // Regex syntax is data here: escape it so free-text search cannot introduce
  // Mongo operators, regex wildcards or expensive user-authored expressions.
  const literalRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (filters.q) conditions.push({ text_address: { $regex: literalRegex(filters.q), $options: 'i' } })
  if (filters.intent) conditions.push(filters.intent === 'rent' ? { $or: [
    { 'asset_metadata.rentalIntent': 'rent' },
    // Mongo equality to null includes an absent optional metadata field.
    { 'asset_metadata.rentalIntent': null },
  ] } : { 'asset_metadata.rentalIntent': filters.intent })
  if (filters.state) conditions.push({ 'asset_metadata.state': { $regex: literalRegex(filters.state), $options: 'i' } })
  const metadataKeys = ['bedrooms', 'bathrooms', 'kitchens', 'transmission', 'seats', 'capacityPersons'] satisfies (keyof DiscoveryFilters)[]
  for (const key of metadataKeys) {
    const value = filters[key]
    if (typeof value === 'string' && value) conditions.push({ [`asset_metadata.${key}`]: value })
  }
  if (filters.captain) conditions.push({ 'asset_metadata.hasCaptain': filters.captain === 'yes' })
  if (filters.minPrice || filters.maxPrice) conditions.push({ base_rent_amount: {
    ...(filters.minPrice ? { $gte: Number(filters.minPrice) } : {}), ...(filters.maxPrice ? { $lte: Number(filters.maxPrice) } : {}),
  } })
  if (filters.cursor) conditions.push({ $or: [
    { createdAt: { $lt: { $date: filters.cursor.createdAt } } },
    { createdAt: { $date: filters.cursor.createdAt }, _id: { $lt: filters.cursor.id } },
  ] })
  return conditions
}

export async function getDiscoveryListings(filters: DiscoveryFilters, userId: string | null = null): Promise<DiscoveryPage> {
  const conditions = discoveryConditions(filters)
  // Prisma's Mongo connector does not support PostgreSQL JSON-path filters.
  // Raw MQL only returns ids; all public fields use the same typed allowlist.
  const found: unknown = await prisma.listing.findRaw({
    filter: { $and: conditions },
    // Prisma 6 deserializes find options through Rust FindOptions: its timeout
    // needs a Duration object, which the driver sends as 3000ms to MongoDB.
    options: { projection: { _id: 1 }, sort: { createdAt: -1, _id: -1 }, limit: DISCOVERY_PAGE_SIZE + 1, maxTimeMS: { secs: 3, nanos: 0 } },
  })
  if (!Array.isArray(found)) throw new Error('INVALID_DISCOVERY_RESULT')
  const ids = found.map((item: unknown): string => {
    if (!item || typeof item !== 'object' || !('_id' in item) || typeof item._id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item._id)) throw new Error('INVALID_DISCOVERY_RESULT')
    return item._id
  })
  if (!ids.length) return { listings: [], nextCursor: null }
  const rows = await prisma.listing.findMany({
    where: { id: { in: ids }, listing_status: 'active', lister: { is: activeAccountWhere } }, select: listingSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: DISCOVERY_PAGE_SIZE + 1,
  })
  const pageRows = rows.slice(0, DISCOVERY_PAGE_SIZE)
  const last = pageRows.at(-1)
  return {
    listings: await serializeListings(pageRows, userId),
    nextCursor: found.length > DISCOVERY_PAGE_SIZE && last ? { id: last.id, createdAt: last.createdAt.toISOString() } : null,
  }
}

/** Sponsored placement uses the same filters and typed public/media projection,
 * preserving the paid-placement order without changing organic ranking. */
export async function getPublicListingsByIds(ids: string[], userId: string | null = null, filters?: DiscoveryFilters): Promise<DiscoveryListing[]> {
  if (ids.length > 12 || ids.some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))) throw new Error('INVALID_PUBLIC_LISTING_IDS')
  const unique = [...new Set(ids)]
  if (!unique.length) return []
  const conditions = filters ? discoveryConditions({ ...filters, cursor: null }) : [{ listing_status: 'active' }]
  const found: unknown = await prisma.listing.findRaw({ filter: { $and: [...conditions, { _id: { $in: unique } }] },
    options: { projection: { _id: 1 }, limit: 12, maxTimeMS: { secs: 3, nanos: 0 } } })
  if (!Array.isArray(found) || found.some(row => !row || typeof row !== 'object' || typeof row._id !== 'string' || !unique.includes(row._id))) throw new Error('INVALID_DISCOVERY_RESULT')
  const rows = await prisma.listing.findMany({ where: { id: { in: found.map(row => row._id as string) }, listing_status: 'active', lister: { is: activeAccountWhere },
    OR: [{ archived_at: null }, { archived_at: { isSet: false } }] }, select: listingSelect, take: 12 })
  const listings = await serializeListings(rows, userId)
  return unique.flatMap(id => { const row = listings.find(listing => listing.id === id); return row ? [row] : [] })
}

export async function getListingDetails(id: string, userId: string | null): Promise<ListingDetails | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const row = await prisma.listing.findFirst({
    where: { id, lister: { is: activeAccountWhere }, OR: [{ listing_status: 'active' }, ...(userId ? [{ lister_id: userId }] : [])] }, select: listingSelect,
  })
  if (!row) return null
  const [listing] = await serializeListings([row], userId, true)
  if (!listing) return null
  return {
    ...listing, listerId: row.lister_id, isOwner: row.lister_id === userId,
    status: row.listing_status, metadata: metadataRecord(row.asset_metadata),
    hostBio: row.lister.bio, hostSince: row.lister.createdAt.toISOString(),
    hostAccountType: row.lister.account_type === 'organization' ? 'Organization' : 'Individual', postedOn: row.createdAt.toISOString(),
  }
}

/** Public host archives share the discovery allowlist/media and saved-state policy. */
export async function getPublicHostListings(listerId: string, viewerId: string | null, cursor: DiscoveryCursor | null, limit: number): Promise<DiscoveryPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('INVALID_ARCHIVE_LIMIT')
  const rows = await prisma.listing.findMany({ where: { lister_id: listerId, listing_status: 'active', lister: { is: activeAccountWhere }, ...(cursor ? { OR: [
    { createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
  ] } : {}) }, select: listingSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 })
  const pageRows = rows.slice(0, limit), last = pageRows.at(-1)
  return { listings: await serializeListings(pageRows, viewerId),
    nextCursor: rows.length > limit && last ? { id: last.id, createdAt: last.createdAt.toISOString() } : null }
}

export async function getSavedListings(userId: string): Promise<DiscoveryListing[]> {
  if (!platformEnabled()) return []
  const saves = await prisma.savedListing.findMany({
    where: { user_id: userId, listing: { listing_status: 'active', lister: { is: activeAccountWhere } } },
    orderBy: { createdAt: 'desc' }, take: 100, select: { listing: { select: listingSelect } },
  })
  return serializeListings(saves.map(save => save.listing), userId)
}

export async function getProfileReviews(subjectId: string): Promise<{ id: string; rating: number; comment: string; author: string; date: string }[]> {
  if (!platformEnabled()) return []
  const rows = await prisma.review.findMany({
    where: { subject_id: subjectId, booking: { status: 'completed' } }, orderBy: { createdAt: 'desc' }, take: 20,
    select: { id: true, rating: true, comment: true, createdAt: true, author: { select: { username: true } } },
  })
  return rows.map(row => ({ id: row.id, rating: row.rating, comment: row.comment, author: row.author.username ?? 'Rentral member', date: row.createdAt.toISOString() }))
}
