import { z } from 'zod'

export const safetyCategories = ['misrepresentation', 'unexpected_fees', 'unsafe_conduct', 'other'] as const
export const safetyCategoryLabels: Record<typeof safetyCategories[number], string> = {
  misrepresentation: 'Asset or identity misrepresentation',
  unexpected_fees: 'Undisclosed payment demands',
  unsafe_conduct: 'Unsafe conduct',
  other: 'Other reviewed concern',
}
export const issueSafetyNoticeSchema = z.object({
  disputeId: z.uuid(), category: z.enum(safetyCategories),
  reason: z.string().trim().min(30).max(2000),
  evidenceReviewed: z.literal(true),
}).strict()
export const appealSafetyNoticeSchema = z.object({
  noticeId: z.uuid(), statement: z.string().trim().min(30).max(4000),
}).strict()
export const decideSafetyAppealSchema = z.object({
  appealId: z.uuid(), decision: z.enum(['upheld', 'removed']),
  reason: z.string().trim().min(30).max(2000),
}).strict()

/** Reports and star ratings alone never create a public safety finding. */
export const PUBLIC_SAFETY_NOTICE = 'Rentral reviewed a safety report involving this account and issued an active notice. Use caution and keep communication and payments on the platform.'

export function safetyReportSubject(report: { opened_by: string; booking: { seeker_id: string; lister_id: string } }): string | null {
  const { seeker_id, lister_id } = report.booking
  if (seeker_id === lister_id) return null
  return report.opened_by === seeker_id ? lister_id : report.opened_by === lister_id ? seeker_id : null
}

export function independentSafetyReviewer(actorId: string, booking: { seeker_id: string; lister_id: string }, issuerId?: string): boolean {
  return actorId !== booking.seeker_id && actorId !== booking.lister_id && actorId !== issuerId
}
