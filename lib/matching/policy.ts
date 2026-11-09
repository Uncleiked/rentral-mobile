import { z } from 'zod'
import { NEIGHBORHOODS } from '../analytics/policy'

export const MATCH_AREAS = NEIGHBORHOODS
export const MATCH_AREA_LABELS: Record<typeof MATCH_AREAS[number], string> = {
  yaba: 'Yaba', surulere: 'Surulere', gbagada: 'Gbagada', ikeja: 'Ikeja', lekki: 'Lekki', ikoyi: 'Ikoyi',
  'victoria-island': 'Victoria Island', ajah: 'Ajah', 'lagos-other': 'Other Lagos areas',
}
const exactMoney = /^(0|[1-9]\d{0,15})$/
export const matchMoneySchema = z.string().max(16).regex(exactMoney).refine(value => exactMoney.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER))
export const matchPreferencesSchema = z.object({
  bio: z.string().trim().max(500).default(''),
  neighborhoods: z.array(z.enum(MATCH_AREAS)).min(1).max(3).refine(values => new Set(values).size === values.length, 'Choose distinct areas.'),
  monthlyMinKobo: matchMoneySchema, monthlyMaxKobo: matchMoneySchema,
  smoking: z.enum(['smoke_free', 'smoking_ok', 'flexible']), pets: z.enum(['pet_free', 'pets_ok', 'flexible']),
  guests: z.enum(['quiet', 'occasional', 'social', 'flexible']), quietHours: z.enum(['early', 'late', 'flexible']),
}).strict().superRefine((value, context) => {
  if (!matchMoneySchema.safeParse(value.monthlyMinKobo).success || !matchMoneySchema.safeParse(value.monthlyMaxKobo).success) return
  if (BigInt(value.monthlyMaxKobo) <= BigInt(0) || BigInt(value.monthlyMinKobo) > BigInt(value.monthlyMaxKobo)) context.addIssue({ code: 'custom', message: 'Choose a positive monthly budget with the lower value first.' })
})
export const matchingProfileInputSchema = matchPreferencesSchema.safeExtend({ isVisible: z.boolean() }).strict()
export type MatchPreferences = z.infer<typeof matchPreferencesSchema>
export const matchingConnectionInputSchema = z.object({ profileId: z.uuid() }).strict()
export const matchingDecisionSchema = z.object({ decision: z.enum(['accept', 'decline', 'close']) }).strict()
export const matchingMessageInputSchema = z.object({ clientId: z.uuid(), body: z.string().trim().min(1).max(2000) }).strict()
export const matchingReportInputSchema = z.object({ profileId: z.uuid(), connectionId: z.uuid().optional(), messageId: z.uuid().optional(), reason: z.string().trim().min(20).max(4000) }).strict()
  .refine(value => !value.messageId || Boolean(value.connectionId), 'A message report must identify its conversation.')
export const matchingModerationSchema = z.object({ decision: z.enum(['resolve', 'restrict']), reason: z.string().trim().min(30).max(2000) }).strict()
export class MatchingError extends Error {
  constructor(message: string, readonly code = 'MATCH_UNAVAILABLE', readonly status = 409) { super(message) }
}
export function matchingPair(first: string, second: string): { lower: string; upper: string } {
  if (first === second) throw new MatchingError('Choose another member.')
  return first < second ? { lower: first, upper: second } : { lower: second, upper: first }
}
export function matchingThreadAllowed(input: { participant: boolean; accepted: boolean; blocked: boolean; bothVisible: boolean; bothClear: boolean; accountsExist: boolean }): boolean {
  return input.participant && input.accepted && !input.blocked && input.bothVisible && input.bothClear && input.accountsExist
}

/** A transparent overlap calculation over explicitly stated preferences. */
export function preferenceOverlap(first: MatchPreferences, second: MatchPreferences): { score: number; reasons: string[];
  sharedAreas: typeof MATCH_AREAS[number][]; budgetOverlap: { minKobo: string; maxKobo: string } } | null {
  const sharedAreas = first.neighborhoods.filter(area => second.neighborhoods.includes(area))
  if (!sharedAreas.length) return null
  const minimum = BigInt(first.monthlyMinKobo) > BigInt(second.monthlyMinKobo) ? BigInt(first.monthlyMinKobo) : BigInt(second.monthlyMinKobo)
  const maximum = BigInt(first.monthlyMaxKobo) < BigInt(second.monthlyMaxKobo) ? BigInt(first.monthlyMaxKobo) : BigInt(second.monthlyMaxKobo)
  if (minimum > maximum) return null
  const unionMin = BigInt(first.monthlyMinKobo) < BigInt(second.monthlyMinKobo) ? BigInt(first.monthlyMinKobo) : BigInt(second.monthlyMinKobo)
  const unionMax = BigInt(first.monthlyMaxKobo) > BigInt(second.monthlyMaxKobo) ? BigInt(first.monthlyMaxKobo) : BigInt(second.monthlyMaxKobo)
  const budgetPoints = unionMax === unionMin ? 30 : Math.max(5, Number((maximum - minimum) * BigInt(30) / (unionMax - unionMin)))
  const areaPoints = sharedAreas.some(area => area !== 'lagos-other') ? 40 : 20
  const reasons = [`Shared areas: ${sharedAreas.map(area => MATCH_AREA_LABELS[area]).join(', ')}.`, 'Your stated monthly budget ranges overlap.']
  let preferenceUnits = 0
  for (const [key, label] of [['smoking', 'Smoking'], ['pets', 'Pets'], ['guests', 'Guest'], ['quietHours', 'Quiet-hours']] as const) {
    if (first[key] === 'flexible' || second[key] === 'flexible') { preferenceUnits += 1; reasons.push(`${label} preferences allow flexibility.`) }
    else if (first[key] === second[key]) { preferenceUnits += 2; reasons.push(`${label} preferences match.`) }
    else reasons.push(`${label} preferences differ.`)
  }
  return { score: areaPoints + budgetPoints + Math.round(preferenceUnits * 30 / 8), reasons, sharedAreas, budgetOverlap: { minKobo: minimum.toString(), maxKobo: maximum.toString() } }
}

export function budgetNairaToKobo(value: string): string {
  const matched = /^(\d{1,14})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!matched) throw new MatchingError('Enter a valid monthly budget in naira.')
  const kobo = BigInt(matched[1]) * BigInt(100) + BigInt((matched[2] ?? '').padEnd(2, '0'))
  return matchMoneySchema.parse(kobo.toString())
}
