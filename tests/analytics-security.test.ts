import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), consent: vi.fn(), setCookie: vi.fn(), authenticated: vi.fn(), create: vi.fn(), remove: vi.fn(), query: vi.fn(), lock: vi.fn(), active: vi.fn(), user: vi.fn(), updateUser: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.authenticated }))
vi.mock('@/lib/db', () => ({ default: { marketEvent: { deleteMany: mocks.remove, aggregateRaw: mocks.query } } }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({
  user: { findUnique: mocks.user, update: mocks.updateUser, updateMany: mocks.active }, marketEvent: { upsert: mocks.create, deleteMany: mocks.remove },
}) }))
import { recordInsightAction } from '@/app/actions/analyticsActions'
import { getMarketInsights } from '@/lib/analytics/insights'

const secret = 'test-only-analytics-secret-at-least-32-characters'
const input = { event: 'search', category: 'house', intent: 'rent', neighborhood: 'yaba', budgetBand: '1m-3m', bedrooms: 2 }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('RENTRAL_ANALYTICS_ENABLED', 'true'); vi.stubEnv('ANALYTICS_HASH_SECRET', secret)
  mocks.cookies.mockResolvedValue({ get: mocks.consent, set: mocks.setCookie }); mocks.consent.mockReturnValue({ value: 'yes' }); mocks.authenticated.mockResolvedValue('raw-user-1')
  mocks.lock.mockResolvedValue(true)
  mocks.active.mockResolvedValue({ count: 1 })
  mocks.user.mockResolvedValue({ analytics_consent: true, analytics_subjects: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('consented aggregate analytics boundaries', () => {
  it.each(['platform', 'analytics', 'secret', 'consent'])('does no auth or database work without %s gate', async gate => {
    if (gate === 'platform') vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
    if (gate === 'analytics') vi.stubEnv('RENTRAL_ANALYTICS_ENABLED', 'false')
    if (gate === 'secret') vi.stubEnv('ANALYTICS_HASH_SECRET', 'short')
    if (gate === 'consent') mocks.consent.mockReturnValue({ value: 'no' })
    expect(await recordInsightAction(input)).toMatchObject({ success: true })
    expect(mocks.authenticated).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('rejects exact addresses, coordinates and arbitrary values before identity lookup', async () => {
    expect(await recordInsightAction({ ...input, latitude: 6.45 })).toMatchObject({ success: false })
    expect(await recordInsightAction({ ...input, neighborhood: 'Exact private address' })).toMatchObject({ success: false })
    expect(mocks.authenticated).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('persists a monthly pseudonym and day-deduplicated coarse fields, never raw identity', async () => {
    expect(await recordInsightAction(input)).toMatchObject({ success: true })
    const saved = mocks.create.mock.calls[0][0]
    const expected = createHmac('sha256', secret).update(`${new Date().toISOString().slice(0, 7)}:raw-user-1`).digest('hex')
    expect(saved).toMatchObject({ create: { subject_hash: expected, event_type: 'search', category: 'house', neighborhood: 'yaba', budget_band: '1m-3m', bedrooms: 2 }, update: {} })
    expect(saved.where.dedupe_key).toBe(saved.create.dedupe_key)
    expect(mocks.active).toHaveBeenCalledWith({ where: { id: 'raw-user-1', AND: [
      { OR: [{ closed_at: null }, { closed_at: { isSet: false } }] },
      { OR: [{ suspended_at: null }, { suspended_at: { isSet: false } }] },
    ] }, data: { revision: { increment: 1 } } })
    expect(JSON.stringify(saved)).not.toContain('raw-user-1')
  })
  it('does not record an event after the authenticated account disappears', async () => {
    mocks.active.mockResolvedValue({ count: 0 })
    expect(await recordInsightAction(input)).toMatchObject({ success: false })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('uses a UTC current-month distinct-contributor threshold inside the Mongo pipeline', async () => {
    mocks.query.mockResolvedValue([])
    expect(await getMarketInsights()).toEqual([])
    const { pipeline } = mocks.query.mock.calls[0][0]
    const now = new Date()
    expect(pipeline[0]).toEqual({ $match: { createdAt: { $gte: { $date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString() } }, event_type: { $in: ['search', 'detail', 'checkout'] } } })
    expect(pipeline[1].$group._id.subject).toBe('$subject_hash')
    expect(pipeline[2].$group.people).toEqual({ $sum: 1 })
    expect(pipeline[3]).toEqual({ $match: { people: { $gte: 10 } } })
    expect(pipeline.at(-1).$project).not.toHaveProperty('subject_hash')
  })
  it('parses coarse aggregate counts including Mongo extended JSON long values', async () => {
    mocks.query.mockResolvedValue([{ category: 'house', intent: 'rent', neighborhood: 'yaba', budget_band: '1m-3m', people: { $numberLong: '10' }, searches: 30 }])
    expect(await getMarketInsights()).toEqual([{ category: 'house', intent: 'rent', neighborhood: 'yaba', budget_band: '1m-3m', people: 10, searches: 30 }])
  })
  it.each([
    { people: 9 }, { subject_hash: 'private-contributor' }, { neighborhood: 'Exact street address' }, { people: { $numberLong: '9007199254740992' } },
  ])('rejects private, malformed or under-threshold aggregate output %o', async change => {
    mocks.query.mockResolvedValue([{ category: 'house', intent: 'rent', neighborhood: 'yaba', budget_band: '1m-3m', people: 10, searches: 30, ...change }])
    await expect(getMarketInsights()).rejects.toThrow()
  })
})
