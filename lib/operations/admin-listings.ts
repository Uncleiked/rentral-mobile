import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { hasStaffPermission } from '@/lib/auth/roles'
import { assertOwnerAdminReady } from '@/lib/database/readiness'
import { paymentsEnabled } from '@/lib/payments/config'
import { paystackEnvironment } from '@/lib/payments/providers/paystack/client'
import { PUBLICATION_FEE_KOBO } from '@/lib/contracts/listing-payments'
import { ADMIN_LISTING_EXPORT_LIMIT, adminListingExportSearchSchema, adminListingPageSchema, adminListingSearchSchema, type AdminListingExportSearch, type AdminListingSearch } from '@/lib/contracts/admin-search'
import type { AdminListing } from '@/lib/contracts/admin'
import { listingSelect, listingViews } from './admin-console'

type Filters = AdminListingExportSearch
const cursorSchema = z.object({ version: z.literal(1), id: z.uuid(), at: z.string().datetime(), filter: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const hitSchema = z.object({ id: z.uuid(), at: z.string().datetime() }).strict()
const resultSchema = z.array(z.object({ items: z.array(hitSchema).max(ADMIN_LISTING_EXPORT_LIMIT + 1), total: z.array(z.object({ count: z.number().int().nonnegative().safe() })).max(1) })).max(1)
type Hit = z.infer<typeof hitSchema>
const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'

function filterFingerprint(input: Filters): string {
  return createHash('sha256').update(JSON.stringify({
    query: input.query.toLowerCase(), status: input.status, category: input.category, source: input.source,
    fee: input.fee, listerId: input.listerId ?? null, archived: input.archived, sort: input.sort,
  })).digest('hex')
}
function decodeCursor(value: string | undefined, input: Filters): z.infer<typeof cursorSchema> | null {
  if (!value) return null
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
    if (parsed.filter !== filterFingerprint(input)) throw new Error('Different filters')
    return parsed
  } catch { throw new ApiError(400, 'INVALID_CURSOR', 'This results page no longer matches the filters. Start the search again.') }
}
function encodeCursor(hit: Hit, input: Filters): string {
  return Buffer.from(JSON.stringify({ version: 1, id: hit.id, at: hit.at, filter: filterFingerprint(input) })).toString('base64url')
}
export function escapeAdminSearch(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function stringValue(field: string): Prisma.InputJsonObject {
  return { $cond: [{ $eq: [{ $type: field }, 'string'] }, field, ''] }
}
function waiverExpression(): Prisma.InputJsonObject {
  return { $and: [
    { $eq: [{ $type: '$fee_waived_at' }, 'date'] },
    { $regexMatch: { input: stringValue('$fee_waived_by'), regex: uuidPattern } },
    { $gte: [{ $strLenCP: { $trim: { input: stringValue('$fee_waiver_reason') } } }, 15] },
  ] }
}
function providerEnvironment(): string | null {
  return paymentsEnabled() ? paystackEnvironment(process.env.PAYSTACK_SECRET_KEY?.trim() ?? '', process.env.PAYSTACK_ENVIRONMENT?.trim()) : null
}

/** Fixed, read-only pipeline. User search is an escaped literal, never a Mongo operator.
 * Raw Mongo aggregation supports the existing JSON title field without inventing a
 * Prisma JSON-path filter unsupported by its Mongo connector. Only IDs/times/count
 * leave this phase; the ordinary allowlisted admin projection supplies the rows. */
export function adminListingPipeline(input: AdminListingSearch | Filters, take: number, environment: string | null): Prisma.InputJsonObject[] {
  const normalized = adminListingSearchSchema.parse({ ...input, limit: Math.min(take, 50) })
  const cursor = decodeCursor('cursor' in input ? input.cursor : undefined, normalized)
  const match: Record<string, Prisma.InputJsonValue | null> = {
    listing_status: normalized.status === 'all' ? { $ne: 'draft' } : normalized.status === 'review' ? 'pending_verification' : normalized.status,
  }
  if (normalized.status === 'review') match.publication_mode = { $ne: 'trusted_publisher' }
  if (normalized.category !== 'all') match.category = normalized.category
  if (normalized.listerId) match.lister_id = normalized.listerId
  if (normalized.source === 'approved_gallery') match.media_source = 'approved_gallery'
  if (normalized.source === 'recorded') match.media_source = { $ne: 'approved_gallery' }
  if (normalized.archived === 'exclude') match.archived_at = null
  if (normalized.archived === 'only') match.archived_at = { $ne: null }
  const pipeline: Prisma.InputJsonObject[] = [{ $match: match }]
  if (normalized.query) {
    const literal = { $regex: escapeAdminSearch(normalized.query), $options: 'i' }
    const handle = normalized.query.startsWith('@') && normalized.query.length > 1 ? normalized.query.slice(1) : normalized.query
    const hostLiteral = { $regex: escapeAdminSearch(handle), $options: 'i' }
    pipeline.push({ $lookup: { from: 'User', let: { hostId: '$lister_id' }, as: '__adminHost', pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$hostId'] } } }, { $project: { _id: 0, username: 1, email: 1 } }] } })
    pipeline.push({ $match: { $or: [
      { 'asset_metadata.listingTitle': literal }, { text_address: literal },
      { '__adminHost.username': hostLiteral }, { '__adminHost.email': literal },
      ...(z.uuid().safeParse(normalized.query).success ? [{ _id: normalized.query.toLowerCase() }] : []),
    ] } })
  }
  if (normalized.fee !== 'all') {
    pipeline.push({ $set: { __adminFeeWaived: waiverExpression() } })
    if (environment) pipeline.push({ $lookup: {
      from: 'PaymentIntent', let: { listingId: '$_id', listerId: '$lister_id' }, as: '__adminPaidFee',
      pipeline: [
        { $match: { kind: 'listing_fee', status: 'succeeded', currency: 'NGN', provider_environment: environment, $expr: { $and: [
          { $eq: ['$listing_id', '$$listingId'] }, { $eq: ['$user_id', '$$listerId'] },
          { $eq: [{ $convert: { input: '$amount_kobo', to: 'string', onError: '', onNull: '' } }, String(PUBLICATION_FEE_KOBO)] },
        ] } } }, { $limit: 1 }, { $project: { _id: 1 } },
      ],
    } })
    else pipeline.push({ $set: { __adminPaidFee: [] } })
    pipeline.push({ $match: normalized.fee === 'waived' ? { __adminFeeWaived: true }
      : normalized.fee === 'paid' ? { '__adminPaidFee.0': { $exists: true } }
      : { __adminFeeWaived: false, '__adminPaidFee.0': { $exists: false } } })
  }
  const at = { $dateToString: { date: '$createdAt', format: '%Y-%m-%dT%H:%M:%S.%LZ', timezone: 'UTC' } }
  const direction = normalized.sort === 'oldest' ? 1 : -1
  const comparison = direction === 1 ? '$gt' : '$lt'
  const items: Prisma.InputJsonObject[] = []
  if (cursor) items.push({ $match: { $expr: { $or: [
    { [comparison]: [at, cursor.at] },
    { $and: [{ $eq: [at, cursor.at] }, { [comparison]: ['$_id', cursor.id] }] },
  ] } } })
  items.push({ $sort: { createdAt: direction, _id: direction } }, { $limit: take + 1 }, { $project: { _id: 0, id: '$_id', at } })
  pipeline.push({ $facet: { items, total: [{ $count: 'count' }] } })
  return pipeline
}
async function permission(actorId: string): Promise<void> {
  await assertOwnerAdminReady()
  if (!await hasStaffPermission(actorId, 'listing:review')) throw new ApiError(403, 'STAFF_REQUIRED', 'Listing review permission is required.')
}
async function search(actorId: string, input: AdminListingSearch | Filters, maximum: number) {
  await permission(actorId)
  const raw = await prisma.listing.aggregateRaw({ pipeline: adminListingPipeline(input, maximum, providerEnvironment()), options: { maxTimeMS: 10000 } })
  const result = resultSchema.parse(raw)[0]
  const allHits = result?.items ?? [], hits = allHits.slice(0, maximum)
  const rows = hits.length ? await prisma.listing.findMany({
    where: { id: { in: hits.map(hit => hit.id) }, listing_status: { not: 'draft' } }, select: listingSelect,
  }) : []
  const views = await listingViews(rows)
  const byId = new Map(views.map(item => [item.id, item]))
  // Records removed between bounded reads are omitted; drafts never escape.
  const items = hits.flatMap(hit => { const item = byId.get(hit.id); return item ? [item] : [] })
  await permission(actorId)
  return { items, hits, hasMore: allHits.length > maximum, total: result?.total[0]?.count ?? 0 }
}
export async function searchAdminListings(actorId: string, value: unknown) {
  const input = adminListingSearchSchema.parse(value)
  const result = await search(actorId, input, input.limit)
  return adminListingPageSchema.parse({ items: result.items, total: result.total, hasMore: result.hasMore,
    nextCursor: result.hasMore && result.hits.length ? encodeCursor(result.hits[result.hits.length - 1], input) : null })
}

/** Quote all cells and neutralize formula prefixes, including whitespace/control
 * characters before spreadsheet operators. This is a text export, never a macro. */
export function adminCsvCell(value: string | number): string {
  const text = String(value).replace(/\u0000/g, '')
  const safe = /^[\s\u0001-\u001f]*[=+@-]/.test(text) ? "'" + text : text
  return '"' + safe.replaceAll('"', '""') + '"'
}
export function adminListingsCsv(items: readonly AdminListing[]): string {
  const columns = ['Listing ID', 'Title', 'Category', 'Address', 'Status', 'Publication method', 'Media source', 'Host username', 'Document review', 'Publication fee', 'Created UTC']
  const rows = items.map(item => [item.id, item.title, item.category, item.address, item.status, item.publicationMode, item.source,
    item.lister.username ?? '', item.document.status, item.fee.waived ? 'waived' : item.fee.paid ? 'paid' : 'unpaid', item.createdAt])
  return '\uFEFF' + [columns, ...rows].map(row => row.map(adminCsvCell).join(',')).join('\r\n') + '\r\n'
}
export async function exportAdminListings(actorId: string, value: unknown) {
  const input = adminListingExportSearchSchema.parse(value)
  const result = await search(actorId, input, ADMIN_LISTING_EXPORT_LIMIT)
  return { csv: adminListingsCsv(result.items), rows: result.items.length, total: result.total,
    truncated: result.hasMore || result.total > ADMIN_LISTING_EXPORT_LIMIT, generatedAt: new Date().toISOString() }
}
