import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { assertMongoReady } from '@/lib/database/readiness'
import { traceDatabaseQuery } from '@/lib/database/transaction-trace'

// Only server-built gallery submission and publication values cross this boundary.
// Identifiers, owner, revision, creation time and relation writes are excluded.
const json = z.unknown().transform(value => {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('INVALID_LISTING_JSON')
  // JSON.parse retains own __proto__ keys without assigning object prototypes.
  return JSON.parse(encoded) as Prisma.InputJsonValue | null
})
const nullablePath = z.string().min(1).max(500).nullable()
const scalarPatch = z.object({
  category: z.enum(['house', 'car', 'boat']), text_address: z.string().max(300).nullable(),
  base_rent_amount: z.number().int().positive().max(9999999999).nullable(), asset_metadata: json,
  video_path: nullablePath, poster_path: nullablePath, document_path: nullablePath,
  // Gallery mode can clear an earlier recording binding, never attach/rebind one.
  capture_id: z.null(), media_source: z.literal('approved_gallery'),
  gallery_media: json, gallery_media_paths: z.array(z.string().min(1).max(500)).max(11),
  gallery_permission_revision: z.number().int().nonnegative().safe().nullable(),
  wizard_step: z.enum(['category', 'capture', 'details', 'documents', 'checkout']).nullable(),
  listing_status: z.enum(['draft', 'pending_verification', 'active']),
  fee_waived_at: z.date().nullable(), fee_waived_by: z.string().min(1).nullable(), fee_waiver_reason: z.string().min(15).max(2000).nullable(),
  publication_mode: z.literal('trusted_publisher'), direct_publish_proof: json,
}).partial().strict().refine(value => Object.keys(value).length > 0).superRefine((value, context) => {
  if (Object.hasOwn(value, 'capture_id') && value.media_source !== 'approved_gallery') context.addIssue({ code: 'custom', path: ['capture_id'], message: 'Only gallery mode may clear a recording binding.' })
})

// Prisma raw Mongo commands decode Extended JSON. Reconstruct JSON objects from
// literal key/value expressions so user keys such as $date, dots or $literal are
// stored unchanged, and strings such as $ROOT never become field expressions.
function jsonExpression(value: unknown): Prisma.InputJsonValue {
  if (value === null || typeof value !== 'object') return { $literal: value as string | number | boolean | null }
  if (Array.isArray(value)) return value.map(jsonExpression)
  return { $arrayToObject: [Object.entries(value).map(([key, nested]) => [{ $literal: key }, jsonExpression(nested)])] }
}

/** Caller retains the existing active owner/listing locks and all trust checks. */
export async function writeOwnedListingScalars(tx: Prisma.TransactionClient, id: string, ownerId: string, input: unknown, requireDraft = false): Promise<void> {
  z.string().min(1).parse(id); z.string().min(1).parse(ownerId)
  const patch = scalarPatch.parse(input), fields: Record<string, Prisma.InputJsonValue> = { updatedAt: '$$NOW' }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue // Existing Prisma updates omit optional undefined values.
    fields[key] = value instanceof Date ? { $literal: { $date: value.toISOString() } }
      : key === 'gallery_permission_revision' && value !== null ? { $literal: { $numberLong: String(value) } } : jsonExpression(value)
  }
  if (Object.keys(fields).length === 1) throw new Error('INVALID_LISTING_PATCH')
  await assertMongoReady()
  const result = await traceDatabaseQuery('Listing', 'submissionScalarUpdate', () => tx.$runCommandRaw({
    update: 'Listing', updates: [{ q: { _id: id, lister_id: ownerId, ...(requireDraft ? { listing_status: 'draft' } : {}) },
      u: [{ $set: fields }], multi: false, upsert: false }],
  }))
  if (!result || Array.isArray(result) || typeof result !== 'object' || result.ok !== 1 || result.n !== 1 || ![0, 1].includes(result.nModified as number) ||
    (result.writeErrors !== undefined && (!Array.isArray(result.writeErrors) || result.writeErrors.length !== 0)) || result.writeConcernError != null) throw new Error('LISTING_WRITE_UNCONFIRMED')
}
