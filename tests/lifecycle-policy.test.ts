import { expect, it } from 'vitest'
import { assertIndependentLifecycleReviewer, lifecycleDecisionSchema, otherParticipant, renewalPeriod, renewalRequestSchema,
  resolvedBookingState, terminationPeriod } from '@/lib/lifecycle/policy'

const now = new Date('2030-01-01T10:00:00Z'), start = new Date('2029-01-01T10:00:00Z'), end = new Date('2030-02-01T10:00:00Z')
it('requires strictly bounded dates and evidence without accepting client identities or money fields', () => {
  const request = { bookingId: 'c7af3d50-a016-475d-8e51-23fd04989436', reference: 'Bank-reference-1', recipientRoute: 'direct_landlord',
    requestedEndsAt: '2031-02-01T10:00:00Z', evidencePath: 'owner/folder/receipt.pdf' }
  expect(renewalRequestSchema.safeParse(request).success).toBe(true)
  expect(renewalRequestSchema.safeParse({ ...request, approvedBy: 'admin' }).success).toBe(false)
  expect(renewalRequestSchema.safeParse({ ...request, amountKobo: '100' }).success).toBe(false)
  expect(lifecycleDecisionSchema.safeParse({ decision: 'approve', reason: 'A sufficiently detailed review reason.', paymentVerified: true }).success).toBe(false)
})
it('requires future extensions and refuses stale/backward/unbounded periods', () => {
  expect(() => renewalPeriod(end, new Date('2031-02-01T10:00:00Z'), now)).not.toThrow()
  for (const target of [new Date('2030-01-01T10:00:00Z'), end, new Date('2050-01-01T10:00:00Z')]) expect(() => renewalPeriod(end, target, now)).toThrow()
})
it('allows early termination only within the existing term and after the request time', () => {
  expect(() => terminationPeriod(start, end, new Date('2030-01-15T10:00:00Z'), now)).not.toThrow()
  for (const target of [start, end, new Date('2031-01-01T10:00:00Z'), new Date('2029-12-01T10:00:00Z')]) expect(() => terminationPeriod(start, end, target, now)).toThrow()
})
it('requires the counterparty and an independent staff reviewer', () => {
  const participants = { seeker_id: 'renter', lister_id: 'host' }
  expect(otherParticipant('renter', participants)).toBe('host')
  expect(otherParticipant('host', participants)).toBe('renter')
  expect(() => otherParticipant('outsider', participants)).toThrow()
  expect(() => assertIndependentLifecycleReviewer('renter', participants)).toThrow()
  expect(() => assertIndependentLifecycleReviewer('host', participants)).toThrow()
  expect(() => assertIndependentLifecycleReviewer('staff', participants)).not.toThrow()
})
it('separates explicit booking restoration/completion/cancellation from financial settlement', () => {
  const booking = { kind: 'rental', ends_at: end, seeker_checked_in_at: null, lister_checked_in_at: null }
  expect(resolvedBookingState(booking, 'cancel', now)).toBe('cancelled')
  expect(resolvedBookingState(booking, 'resume', now)).toBe('confirmed')
  expect(() => resolvedBookingState(booking, 'complete', now)).toThrow()
  expect(resolvedBookingState({ ...booking, ends_at: new Date('2029-12-01T10:00:00Z') }, 'complete', now)).toBe('completed')
  expect(() => resolvedBookingState({ ...booking, kind: 'hold' }, 'complete', now)).toThrow()
  expect(resolvedBookingState({ ...booking, kind: 'inspection', seeker_checked_in_at: now, lister_checked_in_at: new Date(now.getTime() + 1000) }, 'complete', now)).toBe('completed')
})
