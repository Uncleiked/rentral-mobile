import { z } from 'zod'
import { reviewSchema, disputeSchema } from '@/lib/trust/policy'
import { TrustError } from '@/lib/trust/service'
import { ApiError, apiFailure } from './http'
import prisma from '@/lib/db'

export const bookingReviewInputSchema = reviewSchema.omit({ bookingId: true })
export const bookingReportInputSchema = disputeSchema.omit({ bookingId: true })
export async function bookingFeedbackForApi(userId: string, bookingId: string): Promise<{ reviewSubmitted: boolean; openReport: boolean }> {
  const [review, report] = await Promise.all([
    prisma.review.findFirst({ where: { booking_id: bookingId, author_id: userId }, select: { id: true } }),
    prisma.dispute.findFirst({ where: { booking_id: bookingId, opened_by: userId, status: 'open' }, select: { id: true } }),
  ])
  return { reviewSubmitted: Boolean(review), openReport: Boolean(report) }
}
export function trustFailure(error: unknown, scope: string, started: boolean): Response {
  if (error instanceof TrustError) return apiFailure(new ApiError(409, 'TRUST_ACTION_UNAVAILABLE', error.message), scope)
  if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
    return apiFailure(new ApiError(409, 'ALREADY_SUBMITTED', 'This feedback has already been submitted.'), scope)
  }
  if (started && !(error instanceof ApiError) && !(error instanceof z.ZodError)) {
    return apiFailure(new ApiError(503, 'FEEDBACK_UNCONFIRMED', 'Submission could not be confirmed. Refresh the booking before trying again.'), scope)
  }
  return apiFailure(error, scope)
}
