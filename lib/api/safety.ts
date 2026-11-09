import { z } from 'zod'
import { ApiError } from './http'
import { getOwnSafetyNotices, safetyEnabled } from '@/lib/trust/safety'
import { appealSafetyNoticeSchema, safetyCategories } from '@/lib/trust/safety-policy'

const date = z.string().datetime({ offset: true })
const ownNoticeSchema = z.object({ id: z.uuid(), category: z.enum(safetyCategories), reason: z.string().min(1).max(2000),
  status: z.enum(['active', 'removed']), createdAt: date, removedAt: date.nullable(),
  appeal: z.object({ statement: z.string().min(30).max(4000), status: z.enum(['pending', 'upheld', 'removed']),
    decisionReason: z.string().max(2000).nullable(), decidedAt: date.nullable(), createdAt: date }).strict().nullable(),
}).strict()
export const safetyAppealInputSchema = appealSafetyNoticeSchema.omit({ noticeId: true })
export async function ownSafetyForApi(userId: string) {
  const rows = await getOwnSafetyNotices(userId)
  const result = z.object({ enabled: z.boolean(), items: z.array(ownNoticeSchema).max(100), limit: z.literal(100) }).strict().safeParse({ enabled: safetyEnabled(),
    items: rows.map(row => ({ id: row.id, category: row.category, reason: row.private_reason, status: row.status, createdAt: row.createdAt.toISOString(),
      removedAt: row.removed_at?.toISOString() ?? null, appeal: row.appeal ? { statement: row.appeal.statement, status: row.appeal.status,
        decisionReason: row.appeal.decision_reason, decidedAt: row.appeal.decided_at?.toISOString() ?? null, createdAt: row.appeal.createdAt.toISOString() } : null })), limit: 100 })
  if (!result.success) throw new ApiError(503, 'SAFETY_UNAVAILABLE', 'Your reviewed notices could not be verified. Please refresh.')
  return result.data
}
