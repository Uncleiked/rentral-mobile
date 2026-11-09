import { z } from 'zod'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const memberActivitySchema = z.object({
  periodDays: z.literal(90), windowStart: z.string().datetime({ offset: true }), windowEnd: z.string().datetime({ offset: true }),
  response: z.object({ averageMinutes: z.number().nonnegative().nullable(), samples: count, complete: z.boolean() }).strict(),
  inspections: z.object({ eligible: count.nullable(), recorded: count.nullable(), ratePercent: z.number().min(0).max(100).nullable(), complete: z.boolean() }).strict(),
  reviews: z.object({ count, averageRating: z.number().min(1).max(5).nullable() }).strict(),
}).strict().superRefine((value, context) => {
  if ((!value.response.complete || value.response.samples === 0) && value.response.averageMinutes !== null) context.addIssue({ code: 'custom', message: 'Response sample is incomplete.' })
  const inspection = value.inspections
  if ((!inspection.complete || !inspection.eligible) && inspection.ratePercent !== null) context.addIssue({ code: 'custom', message: 'Inspection sample is incomplete.' })
  if (inspection.recorded !== null && inspection.eligible !== null && inspection.recorded > inspection.eligible) context.addIssue({ code: 'custom', message: 'Inspection counts are inconsistent.' })
  if ((value.reviews.count === 0) !== (value.reviews.averageRating === null)) context.addIssue({ code: 'custom', message: 'Review counts are inconsistent.' })
})
export const memberDashboardSchema = z.object({
  counts: z.object({ assets: count, activeAssets: count, drafts: count, activeBookings: count, completedRentals: count, saved: count, conversations: count }).strict(),
  activity: memberActivitySchema,
}).strict()
export type MemberDashboard = z.infer<typeof memberDashboardSchema>
export type MemberActivity = z.infer<typeof memberActivitySchema>
