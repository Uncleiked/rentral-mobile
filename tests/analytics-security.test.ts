import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), consent: vi.fn(), setCookie: vi.fn(), authenticated: vi.fn(), create: vi.fn(), remove: vi.fn(), query: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/lib/action-helpers', () => ({ requireUserId: mocks.authenticated }))
vi.mock('@/lib/db', () => ({ default: { marketEvent: { createMany: mocks.create, deleteMany: mocks.remove }, $queryRaw: mocks.query } }))
import { recordInsightAction } from '@/app/actions/analyticsActions'
import { getMarketInsights } from '@/lib/analytics/insights'

const secret = 'test-only-analytics-secret-at-least-32-characters'
const input = { event: 'search', category: 'house', intent: 'rent', neighborhood: 'yaba', budgetBand: '1m-3m', bedrooms: 2 }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('RENTRAL_ANALYTICS_ENABLED', 'true'); vi.stubEnv('ANALYTICS_HASH_SECRET', secret)
  mocks.cookies.mockResolvedValue({ get: mocks.consent, set: mocks.setCookie }); mocks.consent.mockReturnValue({ value: 'yes' }); mocks.authenticated.mockResolvedValue('raw-user-1')
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
    expect(saved).toMatchObject({ data: [{ subject_hash: expected, event_type: 'search', category: 'house', neighborhood: 'yaba', budget_band: '1m-3m', bedrooms: 2 }], skipDuplicates: true })
    expect(JSON.stringify(saved)).not.toContain('raw-user-1')
  })
  it('uses a current-month distinct-contributor threshold inside the aggregate SQL', async () => {
    mocks.query.mockResolvedValue([])
    expect(await getMarketInsights()).toEqual([])
    const [parts, threshold] = mocks.query.mock.calls[0]
    const query = parts.join('')
    expect(query).toContain("date_trunc('month', now())")
    expect(query).toContain('HAVING count(DISTINCT subject_hash)>=')
    expect(threshold).toBe(10)
    expect(query).not.toContain('SELECT subject_hash')
  })
})
