import { z } from 'zod'

export const reviewSchema = z.object({ bookingId: z.uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(10).max(2000) }).strict()
export const disputeSchema = z.object({ bookingId: z.uuid(), reason: z.string().trim().min(20).max(4000) }).strict()
export const renewalSchema = z.object({ bookingId: z.uuid(), reference: z.string().trim().min(6).max(150).regex(/^[\w .:/-]+$/), recipientRoute: z.enum(['original_agent', 'direct_landlord']) }).strict()

export function reviewSubject(userId: string, booking: { seeker_id: string; lister_id: string; status: string }): string | null {
  if (booking.status !== 'completed') return null
  return booking.seeker_id === userId ? booking.lister_id : booking.lister_id === userId ? booking.seeker_id : null
}
