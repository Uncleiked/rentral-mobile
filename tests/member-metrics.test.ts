import { describe, expect, it } from 'vitest'
import { responseObservations, inspectionObservations } from '@/lib/accounts/metrics-policy'
import { memberActivitySchema } from '@/lib/contracts/dashboard'
const date = (minutes: number) => new Date(Date.UTC(2030, 0, 1, 10, minutes))
const message = (id: string, sender: string, minute: number, thread = 'thread-1') => ({ id, sender_id: sender, createdAt: date(minute), conversation_id: thread })
describe('evidence-derived member activity', () => {
  it('counts one reply to an incoming turn, preserving its earliest wait', () => {
    const result = responseObservations('member', [message('a', 'other', 0), message('b', 'other', 2), message('c', 'member', 5), message('d', 'member', 6), message('e', 'other', 10), message('f', 'member', 13)], true)
    expect(result).toEqual({ averageMinutes: 4, samples: 2, complete: true })
  })
  it('keeps thread waits independent and ignores outgoing messages without an incoming turn', () => {
    expect(responseObservations('member', [message('a', 'member', 0), message('b', 'other', 1), message('c', 'member', 2, 'another'), message('d', 'member', 3)], true)).toEqual({ averageMinutes: 2, samples: 1, complete: true })
  })
  it('orders observations deterministically and withholds a truncated average', () => {
    expect(responseObservations('member', [message('b', 'member', 1), message('a', 'other', 0)], false)).toEqual({ averageMinutes: null, samples: 1, complete: false })
    expect(responseObservations('member', [], true).averageMinutes).toBeNull()
  })
  it('uses the actor’s actual role and bounded check-in evidence', () => {
    const rows = [{ seeker_id: 'member', starts_at: date(0), seeker_checked_in_at: date(5), lister_checked_in_at: null },
      { seeker_id: 'other', starts_at: date(0), seeker_checked_in_at: date(5), lister_checked_in_at: null },
      { seeker_id: 'other', starts_at: date(0), seeker_checked_in_at: null, lister_checked_in_at: date(10) }]
    expect(inspectionObservations('member', rows, true)).toEqual({ eligible: 3, recorded: 2, ratePercent: 66.7, complete: true })
    expect(inspectionObservations('member', [{ ...rows[0], seeker_checked_in_at: new Date(date(0).getTime() + 5 * 3600000) }], true).recorded).toBe(0)
  })
  it('distinguishes no inspection sample from a zero recorded rate and suppresses incomplete totals', () => {
    expect(inspectionObservations('member', [], true)).toEqual({ eligible: 0, recorded: 0, ratePercent: null, complete: true })
    expect(inspectionObservations('member', [], false)).toEqual({ eligible: null, recorded: null, ratePercent: null, complete: false })
  })
  it('rejects fabricated rates without a valid denominator or completed review count', () => {
    const value = { periodDays: 90, windowStart: date(0).toISOString(), windowEnd: date(60).toISOString(), response: { averageMinutes: null, samples: 0, complete: true }, inspections: { eligible: 0, recorded: 0, ratePercent: null, complete: true }, reviews: { count: 0, averageRating: null } }
    expect(memberActivitySchema.safeParse(value).success).toBe(true)
    expect(memberActivitySchema.safeParse({ ...value, response: { ...value.response, averageMinutes: 1 } }).success).toBe(false)
    expect(memberActivitySchema.safeParse({ ...value, inspections: { ...value.inspections, ratePercent: 100 } }).success).toBe(false)
    expect(memberActivitySchema.safeParse({ ...value, reviews: { count: 0, averageRating: 5 } }).success).toBe(false)
  })
})
