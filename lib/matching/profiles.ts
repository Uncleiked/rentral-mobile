import { assertMatchingReady } from '@/lib/database/readiness'
import type { Prisma } from '@prisma/client'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import type { ArchiveQuery } from '@/lib/api/archive'
import { accountIsActive, assertActiveAccounts } from '@/lib/accounts/availability'
import { matchCandidatePageSchema } from './contracts'
import { matchingProfileInputSchema, MatchingError, preferenceOverlap } from './policy'
import { matchingPreferences, matchUserSelect, matchingUnavailable, ownMatchingProfile, publicMatchingProfile, visibleMatch } from './access'

export async function getOwnMatchingProfile(actor: string) {
  await assertMatchingReady()
  return withTransaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: actor }, select: matchUserSelect })
    if (!user) throw matchingUnavailable()
    const profile = await tx.matchProfile.findUnique({ where: { user_id: actor } })
    return profile ? ownMatchingProfile(profile, user) : null
  })
}
export async function updateMatchingProfile(actor: string, input: unknown) {
  await assertMatchingReady()
  const data = matchingProfileInputSchema.parse(input)
  return withTransaction(async tx => {
    await assertActiveAccounts(tx, [actor])
    const user = await tx.user.findUnique({ where: { id: actor }, select: matchUserSelect })
    if (!user) throw matchingUnavailable()
    const fields = { bio: data.bio, neighborhoods: data.neighborhoods, monthly_min_kobo: BigInt(data.monthlyMinKobo), monthly_max_kobo: BigInt(data.monthlyMaxKobo),
      smoking: data.smoking, pets: data.pets, guests: data.guests, quiet_hours: data.quietHours, is_visible: data.isVisible }
    const profile = await tx.matchProfile.upsert({ where: { user_id: actor }, create: { user_id: actor, ...fields }, update: { ...fields, revision: { increment: 1 } } })
    // Owner edits cannot clear server-owned moderation or expose another account.
    return ownMatchingProfile(profile, user)
  })
}
export async function withdrawMatchingProfile(actor: string): Promise<void> {
  await assertMatchingReady()
  await withTransaction(async tx => {
    if (!await lockRecord(tx, 'user', actor)) throw matchingUnavailable()
    await tx.matchProfile.updateMany({ where: { user_id: actor }, data: { is_visible: false, revision: { increment: 1 } } })
  })
}
/** Account closure holds the user write lock and checks matching preparation. */
export async function withdrawMatchingAccountInTransaction(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.matchProfile.updateMany({ where: { user_id: userId }, data: { is_visible: false, revision: { increment: 1 } } })
  await tx.matchConnection.updateMany({ where: { OR: [{ lower_user_id: userId }, { upper_user_id: userId }], status: { in: ['requested', 'accepted'] } },
    data: { status: 'closed', closed_at: new Date(), last_activity_at: new Date(), revision: { increment: 1 } } })
}
export async function matchingCandidates(actor: string, query: ArchiveQuery) {
  await assertMatchingReady()
  return withTransaction(async tx => {
    const own = await tx.matchProfile.findUnique({ where: { user_id: actor } })
    if (!own || !visibleMatch(own)) throw new MatchingError('Choose your preferences and opt in before browsing Squat-Mates.', 'MATCH_OPT_IN_REQUIRED', 409)
    const ownUser = await tx.user.findUnique({ where: { id: actor }, select: matchUserSelect })
    if (!accountIsActive(ownUser)) throw matchingUnavailable()
    const ownPreferences = matchingPreferences(own)
    const rows = await tx.matchProfile.findMany({ where: { user_id: { not: actor }, is_visible: true, moderation_status: 'clear',
      neighborhoods: { hasSome: own.neighborhoods }, monthly_min_kobo: { lte: own.monthly_max_kobo }, monthly_max_kobo: { gte: own.monthly_min_kobo },
      ...(query.cursor ? { OR: [{ updatedAt: { lt: query.cursor.createdAt } }, { updatedAt: query.cursor.createdAt, id: { lt: query.cursor.id } }] } : {}),
    }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: query.limit + 1 })
    const page = rows.slice(0, query.limit), userIds = page.map(profile => profile.user_id)
    const blocks = userIds.length ? await tx.matchBlock.findMany({ where: { OR: [
      { blocker_id: actor, blocked_id: { in: userIds } }, { blocked_id: actor, blocker_id: { in: userIds } },
    ] }, select: { blocker_id: true, blocked_id: true } }) : []
    const excluded = new Set(blocks.map(block => block.blocker_id === actor ? block.blocked_id : block.blocker_id))
    const users = userIds.length ? await tx.user.findMany({ where: { id: { in: userIds } }, select: matchUserSelect }) : []
    const items = page.flatMap(profile => {
      if (profile.user_id === actor) return []
      const user = users.find(account => account.id === profile.user_id)
      if (!user || !accountIsActive(user) || excluded.has(profile.user_id)) return []
      const dto = publicMatchingProfile(profile, user), preferences = matchingPreferences(profile)
      const overlap = preferenceOverlap(ownPreferences, preferences)
      return overlap ? [{ ...dto, overlap }] : []
    })
    const last = page.at(-1)
    const result = matchCandidatePageSchema.safeParse({ items, nextCursor: rows.length > query.limit && last ? `${last.updatedAt.toISOString()}~${last.id}` : null, limit: query.limit })
    if (!result.success) throw new MatchingError('Matching suggestions could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
    return result.data
  })
}
