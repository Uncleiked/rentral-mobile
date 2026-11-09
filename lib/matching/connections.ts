import { z } from 'zod'
import { assertMatchingReady } from '@/lib/database/readiness'
import { withTransaction, lockRecord } from '@/lib/database/transactions'
import { matchingConnectionInputSchema, matchingDecisionSchema, matchingPair, MatchingError } from './policy'
import { lockMatchingUsers, matchingConnectionAccess, matchingPairState, matchingUnavailable } from './access'

const DAY_MS = 86400000
export async function requestMatchingConnection(actor: string, input: unknown): Promise<string> {
  await assertMatchingReady()
  const data = matchingConnectionInputSchema.parse(input)
  return withTransaction(async tx => {
    const target = await tx.matchProfile.findUnique({ where: { id: data.profileId }, select: { id: true, user_id: true } })
    if (!target || target.user_id === actor) throw matchingUnavailable()
    await lockMatchingUsers(tx, actor, target.user_id, true)
    const state = await matchingPairState(tx, actor, target.user_id)
    if (state.other.id !== data.profileId) throw matchingUnavailable()
    const pair = matchingPair(actor, target.user_id), now = new Date()
    const existing = await tx.matchConnection.findUnique({ where: { lower_user_id_upper_user_id: { lower_user_id: pair.lower, upper_user_id: pair.upper } } })
    if (existing?.status === 'accepted' || (existing?.status === 'requested' && existing.requested_by === actor)) return existing.id
    if (existing?.status === 'requested') throw new MatchingError('Review the existing contact request from this member first.', 'CONTACT_REQUEST_EXISTS')
    if (existing?.closed_at && existing.closed_at.getTime() > now.getTime() - 7 * DAY_MS) throw new MatchingError('This contact request is unavailable. Allow time before requesting contact again.', 'CONTACT_COOLDOWN')
    if (await tx.matchConnection.count({ where: { requested_by: actor, last_requested_at: { gte: new Date(now.getTime() - DAY_MS) } } }) >= 5) {
      throw new MatchingError('You have reached the daily contact-request limit. Try another day.', 'CONTACT_RATE_LIMITED', 429)
    }
    if (existing && !['declined', 'closed'].includes(existing.status)) throw new MatchingError('This contact state could not be verified. Please refresh.', 'MATCH_DATA_UNAVAILABLE', 503)
    const fields = { requested_by: actor, status: 'requested', last_requested_at: now, last_activity_at: now, last_message_id: null,
      accepted_at: null, closed_at: null, lower_read_at: null, upper_read_at: null }
    if (existing) await lockRecord(tx, 'matchConnection', existing.id)
    const connection = existing ? await tx.matchConnection.update({ where: { id: existing.id }, data: fields }) :
      await tx.matchConnection.create({ data: { lower_user_id: pair.lower, upper_user_id: pair.upper, ...fields } })
    await tx.notification.create({ data: { user_id: target.user_id, kind: 'match_request', title: 'A Squat-Mates contact request',
      body: 'Review the request before choosing to share messages.', href: `/marketplace/squat-mates/connections/${connection.id}`, dedupe_key: `match-request:${connection.id}:${now.toISOString()}` } })
    return connection.id
  })
}
export async function decideMatchingConnection(actor: string, id: string, input: unknown): Promise<'accepted' | 'declined' | 'closed'> {
  await assertMatchingReady()
  z.uuid().parse(id)
  const data = matchingDecisionSchema.parse(input)
  return withTransaction(async tx => {
    const { connection, other } = await matchingConnectionAccess(tx, actor, id, { lock: true })
    if (data.decision !== 'close' && (connection.status !== 'requested' || connection.requested_by === actor)) throw new MatchingError('Only the invited member can accept or decline a pending request.', 'CONTACT_DECISION_UNAVAILABLE')
    const status = data.decision === 'accept' ? 'accepted' : data.decision === 'decline' ? 'declined' : 'closed'
    await tx.matchConnection.update({ where: { id }, data: { status, last_activity_at: new Date(), ...(status === 'accepted' ? { accepted_at: new Date() } : { closed_at: new Date() }) } })
    if (status === 'accepted') await tx.notification.create({ data: { user_id: other.user_id, kind: 'match_accepted', title: 'Your Squat-Mates contact was accepted',
      body: 'Both members accepted. You can now share messages.', href: `/marketplace/squat-mates/connections/${id}`, dedupe_key: `match-accepted:${id}:${connection.last_requested_at.toISOString()}` } })
    return status
  })
}
