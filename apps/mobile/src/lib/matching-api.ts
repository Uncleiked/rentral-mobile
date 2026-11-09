import { z } from 'zod'
import { ownMatchProfileSchema, matchConnectionSchema, matchMessagePageSchema, type OwnMatchProfile } from '../../../../lib/matching/contracts'
import { budgetNairaToKobo, matchingDecisionSchema, matchingMessageInputSchema, matchingProfileInputSchema, matchingReportInputSchema } from '../../../../lib/matching/policy'
import { api, ApiError } from './api'
import { koboToNaira } from './financial-input'
import { invalidateMatchingPrivacy } from './matching-privacy'

export const ownMatchingSchema = z.object({ profile: ownMatchProfileSchema.nullable(), canDiscover: z.boolean() }).strict()
  .refine(value => value.canDiscover === Boolean(value.profile?.isVisible && value.profile.moderationStatus === 'clear'))
export const matchingReportContextSchema = z.object({ profileId: z.uuid(), connectionId: z.uuid() }).strict()
const idSchema = z.object({ id: z.uuid() }).strict()
function valid<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError('This Squat-Mates response could not be confirmed. Refresh before continuing.', 'INVALID_RESPONSE', 200)
  return result.data
}
function input<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Check your Squat-Mates details.', 'INVALID_INPUT', 400)
  return parsed.data
}
export function matchingForm(profile: OwnMatchProfile | null) {
  return { bio: profile?.bio ?? '', neighborhoods: profile?.neighborhoods ?? [], minNaira: profile ? koboToNaira(profile.monthlyMinKobo) : '0', maxNaira: profile ? koboToNaira(profile.monthlyMaxKobo) : '',
    smoking: profile?.smoking ?? 'flexible', pets: profile?.pets ?? 'flexible', guests: profile?.guests ?? 'flexible', quietHours: profile?.quietHours ?? 'flexible', isVisible: profile?.isVisible ?? false }
}
export type MatchingForm = ReturnType<typeof matchingForm>
export function matchingInput(form: MatchingForm) {
  try { return input(matchingProfileInputSchema, { bio: form.bio, neighborhoods: form.neighborhoods, monthlyMinKobo: budgetNairaToKobo(form.minNaira), monthlyMaxKobo: budgetNairaToKobo(form.maxNaira), smoking: form.smoking, pets: form.pets, guests: form.guests, quietHours: form.quietHours, isVisible: form.isVisible }) }
  catch (reason) { if (reason instanceof ApiError) throw reason; throw new ApiError('Choose one to three areas and a positive monthly budget range in naira.', 'INVALID_INPUT', 400) }
}
export async function saveMatchingProfile(form: MatchingForm, actorId: string) {
  const body = matchingInput(form)
  const result = valid(ownMatchingSchema, await api<unknown>('/squat-mates/profile', { method: 'PUT', body, expectedUserId: actorId }))
  if (!result.profile || JSON.stringify(matchingInput(matchingForm(result.profile))) !== JSON.stringify(body)) throw new ApiError('The saved preferences do not match your request. Refresh before continuing.', 'INVALID_RESPONSE', 200)
  if (!result.canDiscover) invalidateMatchingPrivacy(actorId)
  return result
}
export async function withdrawMatchingProfile(actorId: string) {
  const result = valid(z.object({ withdrawn: z.literal(true) }).strict(), await api<unknown>('/squat-mates/profile', { method: 'DELETE', expectedUserId: actorId }))
  invalidateMatchingPrivacy(actorId)
  return result
}
export async function requestMatchingContact(profileId: string, actorId: string) {
  return valid(idSchema, await api<unknown>('/squat-mates/connections', { method: 'POST', body: { profileId: z.uuid().parse(profileId) }, expectedUserId: actorId }))
}
export async function decideMatchingContact(connectionId: string, decision: 'accept' | 'decline' | 'close', actorId: string) {
  const body = input(matchingDecisionSchema, { decision }), expected = decision === 'accept' ? 'accepted' : decision === 'decline' ? 'declined' : 'closed'
  const result = valid(z.object({ status: z.literal(expected) }).strict(), await api<unknown>(`/squat-mates/connections/${z.uuid().parse(connectionId)}`, { method: 'PATCH', body, expectedUserId: actorId }))
  if (decision !== 'accept') invalidateMatchingPrivacy(actorId)
  return result
}
export async function sendMatchingMessage(connectionId: string, body: z.infer<typeof matchingMessageInputSchema>, actorId: string) {
  return valid(idSchema, await api<unknown>(`/squat-mates/connections/${z.uuid().parse(connectionId)}/messages`, { method: 'POST', body: input(matchingMessageInputSchema, body), expectedUserId: actorId }))
}
export async function loadMatchingMessages(connectionId: string, actorId: string, cursor?: string, signal?: AbortSignal) {
  return valid(matchMessagePageSchema, await api<unknown>(`/squat-mates/connections/${z.uuid().parse(connectionId)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { expectedUserId: actorId, signal }))
}
export async function setMatchingBlock(profileId: string, blocked: boolean, actorId: string) {
  const result = valid(z.object({ blocked: z.literal(blocked) }).strict(), await api<unknown>(`/squat-mates/blocks/${z.uuid().parse(profileId)}`, { method: blocked ? 'PUT' : 'DELETE', expectedUserId: actorId }))
  invalidateMatchingPrivacy(actorId)
  return result
}
export async function submitMatchingReport(body: z.infer<typeof matchingReportInputSchema>, actorId: string) {
  return valid(idSchema, await api<unknown>('/squat-mates/reports', { method: 'POST', body: input(matchingReportInputSchema, body), expectedUserId: actorId }))
}
export async function readMatchingMessages(connectionId: string, messageId: string, actorId: string) {
  return valid(z.object({ readAt: z.string().datetime({ offset: true }) }).strict(), await api<unknown>(`/squat-mates/connections/${z.uuid().parse(connectionId)}/read`, { method: 'POST', body: { messageId: z.uuid().parse(messageId) }, expectedUserId: actorId }))
}
export { matchConnectionSchema }
