import type { MatchConnection, MatchProfile, Prisma } from '@prisma/client'
import { lockRecord } from '@/lib/database/transactions'
import { publicAvatarReference } from '@/lib/accounts/avatar-reference'
import { accountIsActive, assertActiveAccounts } from '@/lib/accounts/availability'
import { ownMatchProfileSchema, publicMatchProfileSchema } from './contracts'
import { MatchingError, matchingPair, matchPreferencesSchema } from './policy'

export type MatchUser = { id: string; username: string | null; avatar_url: string | null; closed_at: Date | null }
export const matchUserSelect = { id: true, username: true, avatar_url: true, closed_at: true } as const
export function matchingUnavailable(): MatchingError { return new MatchingError('This Squat-Mates contact is unavailable.', 'NOT_FOUND', 404) }
export function visibleMatch(profile: MatchProfile): boolean { return profile.is_visible && profile.moderation_status === 'clear' }
export function matchingPreferences(profile: MatchProfile) {
  const result = matchPreferencesSchema.safeParse({ bio: profile.bio, neighborhoods: profile.neighborhoods, monthlyMinKobo: profile.monthly_min_kobo.toString(), monthlyMaxKobo: profile.monthly_max_kobo.toString(),
    smoking: profile.smoking, pets: profile.pets, guests: profile.guests, quietHours: profile.quiet_hours })
  if (!result.success) throw new MatchingError('Matching preferences could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
  return result.data
}
function profileFields(profile: MatchProfile, user: MatchUser) {
  return { ...matchingPreferences(profile), id: profile.id,
    username: user.username, avatarUrl: publicAvatarReference(user.avatar_url, user.id), currency: 'NGN' }
}
export function publicMatchingProfile(profile: MatchProfile, user: MatchUser) {
  if (!visibleMatch(profile) || profile.user_id !== user.id || !accountIsActive(user)) throw matchingUnavailable()
  const result = publicMatchProfileSchema.safeParse(profileFields(profile, user))
  if (!result.success) throw new MatchingError('Matching preferences could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
  return result.data
}
export function ownMatchingProfile(profile: MatchProfile, user: MatchUser) {
  if (profile.user_id !== user.id) throw matchingUnavailable()
  const result = ownMatchProfileSchema.safeParse({ ...profileFields(profile, user), isVisible: profile.is_visible, moderationStatus: profile.moderation_status,
    moderationReason: profile.moderation_reason, createdAt: profile.createdAt.toISOString(), updatedAt: profile.updatedAt.toISOString() })
  if (!result.success) throw new MatchingError('Your matching preferences could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
  return result.data
}
export async function lockMatchingUsers(tx: Prisma.TransactionClient, first: string, second: string, active = false): Promise<void> {
  const pair = matchingPair(first, second)
  if (active) { await assertActiveAccounts(tx, [pair.lower, pair.upper]); return }
  for (const id of [pair.lower, pair.upper]) if (!await lockRecord(tx, 'user', id)) throw matchingUnavailable()
}
export async function matchingPairState(tx: Prisma.TransactionClient, first: string, second: string) {
  const pair = matchingPair(first, second)
  const profiles = await tx.matchProfile.findMany({ where: { user_id: { in: [pair.lower, pair.upper] } } })
  const users = await tx.user.findMany({ where: { id: { in: [pair.lower, pair.upper] } }, select: matchUserSelect })
  const block = await tx.matchBlock.findFirst({ where: { OR: [{ blocker_id: first, blocked_id: second }, { blocker_id: second, blocked_id: first }] }, select: { id: true } })
  const own = profiles.find(profile => profile.user_id === first), other = profiles.find(profile => profile.user_id === second)
  const ownUser = users.find(user => user.id === first), otherUser = users.find(user => user.id === second)
  if (!own || !other || !ownUser || !otherUser || !accountIsActive(ownUser) || !accountIsActive(otherUser) || !visibleMatch(own) || !visibleMatch(other) || block) throw matchingUnavailable()
  return { own, other, ownUser, otherUser }
}
export async function matchingConnectionAccess(tx: Prisma.TransactionClient, actor: string, id: string, options: { lock?: boolean; accepted?: boolean } = {}) {
  let connection = await tx.matchConnection.findUnique({ where: { id } })
  if (!connection || ![connection.lower_user_id, connection.upper_user_id].includes(actor)) throw matchingUnavailable()
  if (options.lock) {
    await lockMatchingUsers(tx, connection.lower_user_id, connection.upper_user_id, true)
    await lockRecord(tx, 'matchConnection', id)
    connection = await tx.matchConnection.findUnique({ where: { id } })
  }
  if (!connection || ![connection.lower_user_id, connection.upper_user_id].includes(actor) || !['requested', 'accepted'].includes(connection.status)) throw matchingUnavailable()
  const otherId = connection.lower_user_id === actor ? connection.upper_user_id : connection.lower_user_id
  const state = await matchingPairState(tx, actor, otherId)
  if (options.accepted && connection.status !== 'accepted') throw new MatchingError('Both members must accept before sharing messages.', 'CONTACT_NOT_ACCEPTED', 409)
  return { connection, ...state }
}
export function ownConnectionReadAt(connection: MatchConnection, actor: string): Date | null {
  return connection.lower_user_id === actor ? connection.lower_read_at : connection.upper_read_at
}
