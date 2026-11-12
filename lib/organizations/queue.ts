import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { ApiError } from '@/lib/api/http'
import type { OrganizationQueueSearch } from '@/lib/contracts/organizations'

const cursorSchema = z.object({ version: z.literal(1), id: z.uuid(), at: z.string().datetime(), filter: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const organizationQueueResultSchema = z.array(z.object({ items: z.array(z.object({ id: z.uuid(), at: z.string().datetime() }).strict()).max(51),
  total: z.array(z.object({ count: z.number().int().nonnegative().safe() }).strict()).max(1) }).strict()).max(1)
export type OrganizationQueueHit = z.infer<typeof organizationQueueResultSchema>[number]['items'][number]
function fingerprint(input: OrganizationQueueSearch): string {
  return createHash('sha256').update(JSON.stringify({ query: input.query.toLowerCase(), status: input.status, sort: input.sort })).digest('hex')
}
export function organizationQueueCursor(hit: OrganizationQueueHit, input: OrganizationQueueSearch): string {
  return Buffer.from(JSON.stringify({ version: 1, ...hit, filter: fingerprint(input) })).toString('base64url')
}
function readCursor(input: OrganizationQueueSearch) {
  if (!input.cursor) return null
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')))
    if (cursor.filter !== fingerprint(input)) throw new Error('Different filters')
    return cursor
  } catch { throw new ApiError(400, 'INVALID_CURSOR', 'This page no longer matches the organization filters. Start from the first page.') }
}
/** Fixed literal field filtering. No regular-expression, Mongo operator or ranking input is accepted. */
export function organizationQueuePipeline(input: OrganizationQueueSearch): Prisma.InputJsonObject[] {
  const cursor = readCursor(input), direction = input.sort === 'oldest' ? 1 : -1, comparison = direction === 1 ? '$gt' : '$lt'
  const pipeline: Prisma.InputJsonObject[] = [{ $match: input.status === 'all' ? {} : { status: input.status } }]
  if (input.query) pipeline.push({ $match: { $expr: { $or: ['legal_name', 'registration_number', 'representative_name'].map(field => ({ $gte: [
    { $indexOfCP: [{ $toLower: { $cond: [{ $eq: [{ $type: '$' + field }, 'string'] }, '$' + field, ''] } }, { $literal: input.query.toLowerCase() }] }, 0],
  })) } } })
  const at = { $dateToString: { date: '$submitted_at', format: '%Y-%m-%dT%H:%M:%S.%LZ', timezone: 'UTC' } }
  const items: Prisma.InputJsonObject[] = []
  if (cursor) items.push({ $match: { $expr: { $or: [ { [comparison]: [at, cursor.at] }, { $and: [{ $eq: [at, cursor.at] }, { [comparison]: ['$_id', cursor.id] }] } ] } } })
  items.push({ $sort: { submitted_at: direction, _id: direction } }, { $limit: input.limit + 1 }, { $project: { _id: 0, id: '$_id', at } })
  pipeline.push({ $facet: { items, total: [{ $count: 'count' }] } })
  return pipeline
}
