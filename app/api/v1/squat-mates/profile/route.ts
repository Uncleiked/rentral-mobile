import { requireApiIdentity } from '@/lib/api/auth'
import { apiSuccess, readApiJson } from '@/lib/api/http'
import { emptyMatchingBody, matchingFailure } from '@/lib/api/matching'
import { matchingProfileInputSchema } from '@/lib/matching/policy'
import { getOwnMatchingProfile, updateMatchingProfile, withdrawMatchingProfile } from '@/lib/matching/profiles'

export const runtime = 'nodejs'
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireApiIdentity(request, { platform: true }), profile = await getOwnMatchingProfile(actor.userId)
    return apiSuccess({ profile, canDiscover: Boolean(profile?.isVisible && profile.moderationStatus === 'clear') })
  } catch (error) { return matchingFailure(error, 'matching-profile') }
}
export async function PUT(request: Request): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    const input = matchingProfileInputSchema.parse(await readApiJson(request, 8192)); started = true
    const profile = await updateMatchingProfile(actor.userId, input)
    return apiSuccess({ profile, canDiscover: profile.isVisible && profile.moderationStatus === 'clear' })
  } catch (error) { return matchingFailure(error, 'matching-profile-save', started) }
}
export async function DELETE(request: Request): Promise<Response> {
  let started = false
  try {
    const actor = await requireApiIdentity(request, { platform: true, mutation: true, verified: true })
    await emptyMatchingBody(request); started = true
    await withdrawMatchingProfile(actor.userId)
    return apiSuccess({ withdrawn: true })
  } catch (error) { return matchingFailure(error, 'matching-profile-withdraw', started) }
}
