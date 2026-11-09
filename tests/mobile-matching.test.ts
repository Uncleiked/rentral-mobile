import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn(), values: new Map<string, string>() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixture.request, ApiError: class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
} }))
vi.mock('../apps/mobile/src/lib/session-storage', () => ({ sessionStorage: { getItem: fixture.get, setItem: fixture.set, removeItem: fixture.remove } }))
import { ApiError } from '../apps/mobile/src/lib/api'
import { decideMatchingContact, matchingForm, matchingInput, ownMatchingSchema, readMatchingMessages, requestMatchingContact, saveMatchingProfile, setMatchingBlock, submitMatchingReport, withdrawMatchingProfile } from '../apps/mobile/src/lib/matching-api'
import { confirmReadMatchingMessage, dismissPendingMatchingMessage, loadPendingMatchingMessage, submitPendingMatchingMessage } from '../apps/mobile/src/lib/matching-pending-store'
import { latestMatchingWindow, olderMatchingWindow } from '../apps/mobile/src/lib/matching-message-window'
import type { OwnMatchProfile, MatchMessage } from '../lib/matching/contracts'
import { invalidateMatchingPrivacy, matchingPrivacyEpoch, subscribeMatchingPrivacy } from '../apps/mobile/src/lib/matching-privacy'
const actor = '11111111-1111-4111-8111-111111111111', connection = '22222222-2222-4222-8222-222222222222', profileId = '33333333-3333-4333-8333-333333333333'
const clientId = '44444444-4444-4444-8444-444444444444', messageId = '55555555-5555-4555-8555-555555555555', other = '66666666-6666-4666-8666-666666666666', date = '2030-01-01T10:00:00.000Z'
const profile: OwnMatchProfile = { id: profileId, username: 'fixture_member', avatarUrl: null, currency: 'NGN', bio: 'I prefer a quiet shared home.', neighborhoods: ['yaba'], monthlyMinKobo: '0', monthlyMaxKobo: '9007199254740991', smoking: 'smoke_free', pets: 'flexible', guests: 'quiet', quietHours: 'early', isVisible: false, moderationStatus: 'clear', moderationReason: null, createdAt: date, updatedAt: date }
const command = { clientId, body: 'Would an occasional visitor work for you?' }, message: MatchMessage = { id: messageId, clientId, body: command.body, own: true, createdAt: date }
const key = `rentral.match-message.${actor}.${connection}`
beforeEach(() => {
  vi.resetAllMocks(); fixture.values.clear()
  fixture.get.mockImplementation(async key => fixture.values.get(key) ?? null)
  fixture.set.mockImplementation(async (key, value) => { fixture.values.set(key, value) })
  fixture.remove.mockImplementation(async key => { fixture.values.delete(key) })
  fixture.request.mockResolvedValue({ id: messageId })
})
it('invalidates only the affected actor matching cache and notifies subscribers without storing profile or message data',()=>{
 const before=matchingPrivacyEpoch(actor),otherBefore=matchingPrivacyEpoch(other),listener=vi.fn(),unsubscribe=subscribeMatchingPrivacy(listener)
 invalidateMatchingPrivacy(actor)
 expect(matchingPrivacyEpoch(actor)).toBe(before+1);expect(matchingPrivacyEpoch(other)).toBe(otherBefore);expect(listener).toHaveBeenCalledTimes(1)
 unsubscribe();invalidateMatchingPrivacy(actor);expect(listener).toHaveBeenCalledTimes(1)
})
it('starts visibility off and preserves a zero lower budget and maximum safe exact money through the form', () => {
  expect(matchingForm(null).isVisible).toBe(false)
  expect(matchingInput(matchingForm(profile))).toMatchObject({ monthlyMinKobo: '0', monthlyMaxKobo: '9007199254740991', isVisible: false })
})
it.each(['100.001', 'not money', '-10', '90071992547409.92'])('rejects malformed/out-of-range budget %s before networking', value => {
  expect(() => matchingInput({ ...matchingForm(profile), maxNaira: value })).toThrow()
  expect(fixture.request).not.toHaveBeenCalled()
})
it('requires an explicit profile visibility state consistent with server discovery eligibility', () => {
  expect(ownMatchingSchema.safeParse({ profile, canDiscover: true }).success).toBe(false)
  expect(ownMatchingSchema.safeParse({ profile: { ...profile, isVisible: true, moderationStatus: 'restricted' }, canDiscover: false }).success).toBe(true)
  expect(ownMatchingSchema.safeParse({ profile: null, canDiscover: false }).success).toBe(true)
})
it('validates the saved preference acknowledgment and uses the original actor header', async () => {
  fixture.request.mockResolvedValueOnce({ profile, canDiscover: false })
  expect((await saveMatchingProfile(matchingForm(profile), actor)).profile?.id).toBe(profileId)
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith('/squat-mates/profile', { method: 'PUT', body: matchingInput(matchingForm(profile)), expectedUserId: actor })
  fixture.request.mockResolvedValueOnce({ profile: { ...profile, isVisible: true }, canDiscover: true })
  await expect(saveMatchingProfile(matchingForm(profile), actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('keeps existing contact requests scoped to the selected profile with no automatic retry', async () => {
  fixture.request.mockRejectedValueOnce(new ApiError('Unknown contact result', 'NETWORK_ERROR', 0))
  await expect(requestMatchingContact(profileId, actor)).rejects.toMatchObject({ status: 0 })
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith('/squat-mates/connections', { method: 'POST', body: { profileId }, expectedUserId: actor })
})
it('rejects a contradictory contact decision acknowledgment', async () => {
  fixture.request.mockResolvedValueOnce({ status: 'declined' })
  await expect(decideMatchingContact(connection, 'accept', actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('confirms block/withdraw outcomes and binds displayed-message read markers', async () => {
  fixture.request.mockResolvedValueOnce({ blocked: true }).mockResolvedValueOnce({ withdrawn: true }).mockResolvedValueOnce({ readAt: date })
  await setMatchingBlock(profileId, true, actor); await withdrawMatchingProfile(actor); await readMatchingMessages(connection, messageId, actor)
  expect(fixture.request.mock.calls[2]).toEqual([`/squat-mates/connections/${connection}/read`, { method: 'POST', body: { messageId }, expectedUserId: actor }])
  fixture.request.mockResolvedValueOnce({ blocked: false })
  await expect(setMatchingBlock(profileId, true, actor)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('submits private reports without profile/message bodies and keeps the original evidence IDs', async () => {
  const body = { profileId, connectionId: connection, messageId, reason: 'This fixture explains a private matching concern.' }
  await submitMatchingReport(body, actor)
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith('/squat-mates/reports', { method: 'POST', body, expectedUserId: actor })
})
it('durably saves the actor/contact/message nonce before send and never uses listing-chat endpoints', async () => {
  fixture.request.mockImplementationOnce(async () => {
    expect(JSON.parse(fixture.values.get(key)!)).toEqual({ version: 1, actorId: actor, connectionId: connection, command })
    return { id: messageId }
  })
  expect((await submitPendingMatchingMessage(actor, connection, command)).cleanupPending).toBe(false)
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith(`/squat-mates/connections/${connection}/messages`, { method: 'POST', body: command, expectedUserId: actor })
  expect(await loadPendingMatchingMessage(actor, connection)).toBeNull()
})
it('restores an uncertain message without sending it or revealing another account/contact recovery', async () => {
  fixture.request.mockRejectedValueOnce(new ApiError('Unknown send', 'NETWORK_ERROR', 0))
  await expect(submitPendingMatchingMessage(actor, connection, command)).rejects.toMatchObject({ status: 0 })
  expect(await loadPendingMatchingMessage(actor, connection)).toEqual({ command })
  expect(await loadPendingMatchingMessage(other, connection)).toBeNull()
  expect(await loadPendingMatchingMessage(actor, other)).toBeNull()
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('resolves acknowledgment loss by an authoritative own-message nonce/body readback without POST', async () => {
  fixture.request.mockRejectedValueOnce(new ApiError('Unknown send', 'NETWORK_ERROR', 0))
  await expect(submitPendingMatchingMessage(actor, connection, command)).rejects.toMatchObject({ status: 0 })
  expect(await confirmReadMatchingMessage(actor, connection, message)).toEqual({ id: messageId, cleanupPending: false })
  expect(await loadPendingMatchingMessage(actor, connection)).toBeNull()
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
it.each([{ own: false }, { body: 'Different body' }, { clientId: other }])('never clears pending recovery from another message %j', async patch => {
  fixture.request.mockRejectedValueOnce(new ApiError('Unknown send', 'NETWORK_ERROR', 0))
  await expect(submitPendingMatchingMessage(actor, connection, command)).rejects.toMatchObject({ status: 0 })
  await expect(confirmReadMatchingMessage(actor, connection, { ...message, ...patch })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  expect(await loadPendingMatchingMessage(actor, connection)).not.toBeNull()
})
it('does not issue a send when secure persistence fails or when a different pending message exists', async () => {
  fixture.set.mockRejectedValueOnce(new Error('Keychain unavailable'))
  await expect(submitPendingMatchingMessage(actor, connection, command)).rejects.toThrow('Keychain unavailable')
  expect(fixture.request).not.toHaveBeenCalled()
  fixture.request.mockRejectedValueOnce(new ApiError('Unknown send', 'NETWORK_ERROR', 0))
  await expect(submitPendingMatchingMessage(actor, connection, command)).rejects.toMatchObject({ status: 0 })
  await expect(submitPendingMatchingMessage(actor, connection, { ...command, clientId: other })).rejects.toThrow('Confirm the saved')
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('keeps a confirmed acknowledgment after cleanup failure and removes it without resending', async () => {
  fixture.remove.mockRejectedValueOnce(new Error('Keychain unavailable'))
  expect((await submitPendingMatchingMessage(actor, connection, command)).cleanupPending).toBe(true)
  expect((await loadPendingMatchingMessage(actor, connection))?.confirmedId).toBe(messageId)
  await submitPendingMatchingMessage(actor, connection, command)
  expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('requires explicit dismissal for incomplete encrypted chunks', async () => {
  fixture.values.set(`${key}.present`, '1')
  await expect(loadPendingMatchingMessage(actor, connection)).rejects.toThrow('incomplete')
  await expect(submitPendingMatchingMessage(actor, connection, command)).rejects.toThrow('incomplete')
  expect(fixture.request).not.toHaveBeenCalled()
  await dismissPendingMatchingMessage(actor, connection)
  expect(await loadPendingMatchingMessage(actor, connection)).toBeNull()
})
it('preserves only contiguous matching message windows and ignores stale older anchors', () => {
  const old = { items: [message], nextCursor: null, limit: 20 }
  const overlapping = { items: [message, { ...message, id: other, clientId: other, createdAt: '2030-01-01T11:00:00.000Z' }], nextCursor: `older~${other}`, limit: 20 }
  expect(latestMatchingWindow(old, overlapping).page.nextCursor).toBeNull()
  const disconnected = { items: [{ ...message, id: other, clientId: other }], nextCursor: 'valid-earlier-window', limit: 20 }
  expect(latestMatchingWindow(old, disconnected)).toEqual({ page: disconnected, gap: true })
  expect(olderMatchingWindow(disconnected, old, messageId)).toBe(disconnected)
  expect(olderMatchingWindow(disconnected, old, other)?.items).toHaveLength(2)
})
