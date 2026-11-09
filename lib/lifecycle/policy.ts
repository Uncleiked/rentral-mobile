import { z } from 'zod'
export { renewalRequestSchema, terminationRequestSchema, lifecycleCounterpartySchema } from '@/lib/contracts/lifecycle'
export const lifecycleDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().min(30).max(2000) }).strict()
export const disputeResolutionSchema = z.object({ decision: z.enum(['resume', 'complete', 'cancel']), reason: z.string().trim().min(30).max(2000) }).strict()
export class LifecycleError extends Error {}

export function assertIndependentLifecycleReviewer(actorId: string, participants: { seeker_id: string; lister_id: string }): void {
  if ([participants.seeker_id, participants.lister_id].includes(actorId)) throw new LifecycleError('A staff reviewer independent of both participants is required.')
}
export function renewalPeriod(originalEnd: Date, requestedEnd: Date, now = new Date()): void {
  if (!Number.isFinite(requestedEnd.getTime()) || requestedEnd <= originalEnd || requestedEnd <= now || requestedEnd.getTime() - originalEnd.getTime() > 3660 * 86400000) {
    throw new LifecycleError('Choose an extension ending after the current lease and today, within ten years of the original end.')
  }
}
export function terminationPeriod(startsAt: Date, originalEnd: Date, requestedEnd: Date, now = new Date()): void {
  if (!Number.isFinite(requestedEnd.getTime()) || requestedEnd <= startsAt || requestedEnd >= originalEnd || requestedEnd.getTime() < now.getTime() - 60000) {
    throw new LifecycleError('Choose a future end within the current lease period.')
  }
}
export function otherParticipant(actorId: string, participants: { seeker_id: string; lister_id: string }): string {
  if (participants.seeker_id === participants.lister_id) throw new LifecycleError('This lease has invalid participants.')
  if (actorId === participants.seeker_id) return participants.lister_id
  if (actorId === participants.lister_id) return participants.seeker_id
  throw new LifecycleError('This lease is unavailable.')
}

export function resolvedBookingState(booking: { kind: string; ends_at: Date; seeker_checked_in_at: Date | null; lister_checked_in_at: Date | null }, decision: 'resume' | 'complete' | 'cancel', now = new Date()): 'confirmed' | 'completed' | 'cancelled' {
  if (decision === 'cancel') return 'cancelled'
  if (decision === 'resume') {
    if (booking.ends_at <= now) throw new LifecycleError('An ended booking cannot resume. Review completion or cancellation instead.')
    return 'confirmed'
  }
  if (booking.kind === 'rental' && booking.ends_at <= now) return 'completed'
  if (booking.kind === 'inspection' && booking.seeker_checked_in_at && booking.lister_checked_in_at &&
    Math.abs(booking.seeker_checked_in_at.getTime() - booking.lister_checked_in_at.getTime()) < 15 * 60000) return 'completed'
  throw new LifecycleError('Completion requires an ended rental or recorded check-in by both inspection participants.')
}
