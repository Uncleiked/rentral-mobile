import { z } from 'zod'

const archiveCursor = z.string().max(100).transform((value, context) => {
  const [createdAt, id, ...extra] = value.split('~')
  const parsed = z.object({ createdAt: z.string().datetime({ offset: true }), id: z.uuid() }).safeParse({ createdAt, id })
  if (!parsed.success || extra.length) { context.addIssue({ code: 'custom', message: 'Invalid archive cursor.' }); return z.NEVER }
  return { createdAt: new Date(parsed.data.createdAt), id: parsed.data.id }
})
export const archiveQuerySchema = z.object({
  cursor: archiveCursor.optional(), limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict()
export type ArchiveQuery = z.infer<typeof archiveQuerySchema>

export function archiveBoundary(cursor: ArchiveQuery['cursor']) {
  return cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}
}
export function nextArchiveCursor(rows: { id: string; createdAt: Date }[], limit: number): string | null {
  const last = rows[limit - 1]
  return rows.length > limit && last ? `${last.createdAt.toISOString()}~${last.id}` : null
}
