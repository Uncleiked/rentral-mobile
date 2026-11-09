import { expect, it } from 'vitest'
import { budgetNairaToKobo, matchingMessageInputSchema, matchingPair, matchingProfileInputSchema, matchingReportInputSchema,
  matchingThreadAllowed, matchPreferencesSchema, preferenceOverlap } from '@/lib/matching/policy'
import { matchCandidateSchema } from '@/lib/matching/contracts'

const preferences = { bio: 'I like a calm shared home.', neighborhoods: ['yaba'], monthlyMinKobo: '10000000', monthlyMaxKobo: '20000000',
  smoking: 'smoke_free', pets: 'pet_free', guests: 'occasional', quietHours: 'early' }
function parsed(change: Record<string, unknown> = {}) { return matchPreferencesSchema.parse({ ...preferences, ...change }) }
it('keeps preferences explicit and rejects actor/moderation/private/demographic fields', () => {
  expect(matchingProfileInputSchema.safeParse({ ...preferences, isVisible: false }).success).toBe(true)
  for (const field of ['user_id', 'moderationStatus', 'latitude', 'creditScore', 'religion']) expect(matchingProfileInputSchema.safeParse({ ...preferences, isVisible: true, [field]: 'untrusted' }).success).toBe(false)
  expect(matchingProfileInputSchema.safeParse(preferences).success).toBe(false)
})
it.each([{ neighborhoods: ['yaba', 'yaba'] }, { neighborhoods: ['Exact private street address'] }, { monthlyMinKobo: '20000001' }, { monthlyMaxKobo: '0' }, { monthlyMaxKobo: '100.5' }])('rejects invalid areas or exact-money ranges, case %#', change => {
  expect(matchPreferencesSchema.safeParse({ ...preferences, ...change }).success).toBe(false)
})
it('calculates exact naira budgets and validates the score without exposing money as floats', () => {
  expect(budgetNairaToKobo('100000.25')).toBe('10000025')
  expect(budgetNairaToKobo('0')).toBe('0')
  expect(() => budgetNairaToKobo('1e6')).toThrow()
  const overlap = preferenceOverlap(parsed(), parsed())
  expect(overlap).toMatchObject({ score: 100, budgetOverlap: { minKobo: '10000000', maxKobo: '20000000' }, sharedAreas: ['yaba'] })
  expect(matchCandidateSchema.safeParse({ ...preferences, id: 'c7af3d50-a016-475d-8e51-23fd04989436', username: 'member', avatarUrl: null, currency: 'NGN', overlap }).success).toBe(true)
})
it('offers no suggestion without a shared coarse area and overlapping stated budget', () => {
  expect(preferenceOverlap(parsed(), parsed({ neighborhoods: ['lekki'] }))).toBeNull()
  expect(preferenceOverlap(parsed(), parsed({ monthlyMinKobo: '30000000', monthlyMaxKobo: '40000000' }))).toBeNull()
})
it('explains flexible/differing preferences and treats an unspecified Lagos area as broader overlap', () => {
  const exact = preferenceOverlap(parsed(), parsed({ smoking: 'smoking_ok', guests: 'flexible' }))
  expect(exact?.score).toBeLessThan(100)
  expect(exact?.reasons).toContain('Smoking preferences differ.')
  expect(exact?.reasons).toContain('Guest preferences allow flexibility.')
  expect(preferenceOverlap(parsed({ neighborhoods: ['lagos-other'] }), parsed({ neighborhoods: ['lagos-other'] }))?.score).toBe(80)
})
it('normalizes unique user pairs and never treats a self request as mutual contact', () => {
  expect(matchingPair('b', 'a')).toEqual({ lower: 'a', upper: 'b' })
  expect(() => matchingPair('a', 'a')).toThrow()
})
it('requires current consent/visibility/moderation/no block for every accepted thread operation', () => {
  const input = { participant: true, accepted: true, blocked: false, bothVisible: true, bothClear: true, accountsExist: true }
  expect(matchingThreadAllowed(input)).toBe(true)
  for (const field of ['participant', 'accepted', 'bothVisible', 'bothClear', 'accountsExist']) expect(matchingThreadAllowed({ ...input, [field]: false })).toBe(false)
  expect(matchingThreadAllowed({ ...input, blocked: true })).toBe(false)
})
it('bounds message retries and report evidence to an explicit conversation', () => {
  const id = 'c7af3d50-a016-475d-8e51-23fd04989436'
  expect(matchingMessageInputSchema.safeParse({ clientId: id, body: 'Hello', sender_id: 'victim' }).success).toBe(false)
  expect(matchingReportInputSchema.safeParse({ profileId: id, messageId: id, reason: 'A sufficiently detailed report of this message.' }).success).toBe(false)
  expect(matchingReportInputSchema.safeParse({ profileId: id, connectionId: id, messageId: id, reason: 'A sufficiently detailed report of this message.' }).success).toBe(true)
})
