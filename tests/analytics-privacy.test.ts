import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), lock: vi.fn(), active: vi.fn(), user: vi.fn(), update: vi.fn(), create: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/db', () => ({ default: { user: { findUnique: mocks.user } } }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({
  user: { findUnique: mocks.user, update: mocks.update, updateMany: mocks.active }, marketEvent: { upsert: mocks.create, deleteMany: mocks.remove },
}) }))
import { ApiError } from '@/lib/api/http'
import { recordConsentedInsight, setAnalyticsConsent, withdrawAnalyticsHistory, withdrawAnalyticsHistoryInTransaction, pruneAnalyticsSubjects } from '@/lib/analytics/service'
import type { Prisma } from '@prisma/client'
import { GET as getPrivacy, PATCH as setPrivacy } from '@/app/api/v1/privacy/analytics/route'
import { POST as event } from '@/app/api/v1/privacy/analytics/events/route'
import { DELETE as removeHistory } from '@/app/api/v1/privacy/analytics/history/route'

const userId = '55bfc098-ff33-4fdd-b7ae-68d810a74050'
const secret = 'test-only-analytics-key-at-least-32-characters'
const now = '2030-01-09T10:00:00.000Z'
const input = { event: 'search', category: 'house', intent: 'rent', neighborhood: 'lekki', budgetBand: '1m-3m' }
const oldSubject = 'a'.repeat(64)
function request(path: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost:3000/api/v1/privacy/analytics${path}`, { method,
    headers: { authorization: 'Bearer test-session', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now)
  vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('RENTRAL_ANALYTICS_ENABLED', 'true'); vi.stubEnv('ANALYTICS_HASH_SECRET', secret)
  mocks.identity.mockResolvedValue({ userId, mode: 'bearer' }); mocks.lock.mockResolvedValue(true)
  mocks.active.mockResolvedValue({ count: 1 })
  mocks.user.mockResolvedValue({ analytics_consent: true, analytics_consent_at: new Date(now), analytics_subjects: null })
  mocks.update.mockResolvedValue({}); mocks.remove.mockResolvedValue({ count: 0 }); mocks.create.mockResolvedValue({})
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

it('exposes only persisted consent settings and never pseudonyms or a private hashing secret', async () => {
  const response = await getPrivacy(request(''))
  expect(await response.json()).toEqual({ success: true, data: { allowed: true, updatedAt: now, collectionEnabled: true, retentionDays: 90 } })
  expect(mocks.user).toHaveBeenCalledWith({ where: { id: userId }, select: { analytics_consent: true, analytics_consent_at: true } })
})

it.each([null, undefined, false])('treats missing/null/false database consent as opt-out (%s)', async consent => {
  mocks.user.mockResolvedValue({ analytics_consent: consent, analytics_subjects: null })
  expect(await recordConsentedInsight(userId, input)).toBe(false)
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
})

it('writes explicit consent under the same actor lock used for collection and withdrawal', async () => {
  const response = await setPrivacy(request('', 'PATCH', { allowed: false }))
  expect(response.status).toBe(200)
  expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(expect.any(Object), 'user', userId)
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: userId }, data: { analytics_consent: false, analytics_consent_at: new Date(now) } })
  expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { mutation: true, verified: true })
})

it('requires authentication and rejects client identities, GPS and exact addresses before collection', async () => {
  expect((await setPrivacy(request('', 'PATCH', { allowed: true, userId: 'victim' }))).status).toBe(400)
  expect((await event(request('/events', 'POST', { ...input, latitude: 6.4 }))).status).toBe(400)
  expect((await event(request('/events', 'POST', { ...input, neighborhood: 'Private street address' }))).status).toBe(400)
  expect(mocks.lock).not.toHaveBeenCalled()
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
  expect((await removeHistory(request('/history', 'DELETE'))).status).toBe(401)
  expect(mocks.remove).not.toHaveBeenCalled()
})

it('uses monthly pseudonyms and stable daily deduplication without raw actor IDs in event data', async () => {
  expect(await recordConsentedInsight(userId, input)).toBe(true)
  const subject = createHmac('sha256', secret).update(`2030-01:${userId}`).digest('hex')
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: userId }, data: { analytics_subjects: [{ month: '2030-01', subject }] } })
  const saved = mocks.create.mock.calls[0][0]
  expect(saved.create).toMatchObject({ subject_hash: subject, event_type: 'search', category: 'house', neighborhood: 'lekki', budget_band: '1m-3m' })
  expect(saved.where.dedupe_key).toBe(saved.create.dedupe_key)
  expect(JSON.stringify(saved)).not.toContain(userId)
})

it('keeps one monthly contributor and the same daily dedupe key after hash-secret rotation', async () => {
  mocks.user.mockResolvedValue({ analytics_consent: true, analytics_subjects: [{ month: '2030-01', subject: oldSubject }] })
  await recordConsentedInsight(userId, input)
  const first = mocks.create.mock.calls[0][0]
  vi.stubEnv('ANALYTICS_HASH_SECRET', 'a-new-private-test-key-of-at-least-32-characters')
  await recordConsentedInsight(userId, input)
  const second = mocks.create.mock.calls[1][0]
  expect(first.create.subject_hash).toBe(oldSubject)
  expect(second.create.subject_hash).toBe(oldSubject)
  expect(second.where.dedupe_key).toBe(first.where.dedupe_key)
})

it('deletes expired subject events before evicting their private withdrawal mapping', async () => {
  mocks.user.mockResolvedValue({ analytics_consent: true, analytics_subjects: [{ month: '2029-09', subject: oldSubject }] })
  await recordConsentedInsight(userId, input)
  expect(mocks.remove.mock.calls[0][0]).toEqual({ where: { subject_hash: { in: [oldSubject] } } })
  expect(mocks.update.mock.calls[0][0].data.analytics_subjects).not.toContainEqual({ month: '2029-09', subject: oldSubject })
  expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0])
})

it('bounds mapping growth and deletes an evicted rotated subject before forgetting it', async () => {
  const mappings = Array.from({ length: 64 }, (_, index) => ({ month: '2029-12', subject: index.toString(16).padStart(64, '0') }))
  mocks.user.mockResolvedValue({ analytics_consent: true, analytics_subjects: mappings })
  await recordConsentedInsight(userId, input)
  const retained = mocks.update.mock.calls[0][0].data.analytics_subjects
  expect(retained).toHaveLength(64)
  expect(retained).not.toContainEqual(mappings[0])
  expect(mocks.remove.mock.calls[0][0]).toEqual({ where: { subject_hash: { in: [mappings[0].subject] } } })
})

it('prunes expired mappings for an inactive opted-out member without changing their consent', async () => {
  mocks.user.mockResolvedValue({ analytics_subjects: [{ month: '2029-09', subject: oldSubject }] })
  expect(await pruneAnalyticsSubjects(userId)).toBe(true)
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ where: { subject_hash: { in: [oldSubject] } } })
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: userId }, data: { analytics_subjects: [] } })
  expect(mocks.lock).toHaveBeenCalledWith(expect.any(Object), 'user', userId)
})

it('deletes all mapped rotated subjects plus current-secret legacy subjects, then opts out in one locked transaction', async () => {
  mocks.user.mockResolvedValue({ analytics_subjects: [{ month: '2029-12', subject: oldSubject }] })
  await withdrawAnalyticsHistory(userId)
  expect(mocks.remove.mock.calls[0][0].where.subject_hash.in).toContain(oldSubject)
  expect(mocks.remove.mock.calls[0][0].where.subject_hash.in).toContain(createHmac('sha256', secret).update(`2030-01:${userId}`).digest('hex'))
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: userId }, data: { analytics_consent: false, analytics_consent_at: new Date(now), analytics_subjects: [] } })
  expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0])
  expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(expect.any(Object), 'user', userId)
})

it('withdraws mapped history even after the hashing key is removed and rejects client-selected subjects', async () => {
  vi.stubEnv('ANALYTICS_HASH_SECRET', '')
  mocks.user.mockResolvedValue({ analytics_subjects: [{ month: '2029-12', subject: oldSubject }] })
  expect((await removeHistory(request('/history', 'DELETE', { subject: oldSubject }))).status).toBe(400)
  expect(mocks.remove).not.toHaveBeenCalled()
  expect(await (await removeHistory(request('/history', 'DELETE'))).json()).toEqual({ success: true, data: { removed: true, allowed: false } })
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ where: { subject_hash: { in: [oldSubject] } } })
})

it('fails closed for corrupt private mappings and vanished accounts without writing events', async () => {
  mocks.user.mockResolvedValue({ analytics_consent: true, analytics_subjects: [{ month: '2030-01', subject: 'malformed' }] })
  expect((await event(request('/events', 'POST', input))).status).toBe(503)
  expect(mocks.create).not.toHaveBeenCalled()
  mocks.active.mockResolvedValue({ count: 0 })
  expect((await setPrivacy(request('', 'PATCH', { allowed: true }))).status).toBe(409)
  expect(mocks.update).not.toHaveBeenCalled()
})

it('denies new opt-in and collection when the active-account write loses to closure, while opt-out still works', async () => {
  mocks.active.mockResolvedValue({ count: 0 })
  await expect(setAnalyticsConsent(userId, true)).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
  await expect(recordConsentedInsight(userId, input)).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
  await setAnalyticsConsent(userId, false)
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: userId }, data: { analytics_consent: false, analytics_consent_at: new Date(now) } })
})

it('lets an existing account-closure transaction purge mapped history without taking a second lock or transaction', async () => {
  mocks.user.mockResolvedValue({ analytics_subjects: [{ month: '2029-12', subject: oldSubject }] })
  const tx = { user: { findUnique: mocks.user, update: mocks.update }, marketEvent: { deleteMany: mocks.remove } } as unknown as Prisma.TransactionClient
  await withdrawAnalyticsHistoryInTransaction(tx, userId)
  expect(mocks.remove.mock.calls[0][0].where.subject_hash.in).toContain(oldSubject)
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { analytics_consent: false, analytics_consent_at: new Date(now), analytics_subjects: [] } }))
  expect(mocks.lock).not.toHaveBeenCalled(); expect(mocks.active).not.toHaveBeenCalled()
})
