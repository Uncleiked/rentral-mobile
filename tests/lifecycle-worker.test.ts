import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ batch: vi.fn() }))
vi.mock('@/lib/operations/lifecycle', () => ({ runLifecycleBatch: mocks.batch }))
import { lifecycleAuthorized } from '@/lib/operations/worker-policy'
import { POST } from '@/app/api/internal/lifecycle-worker/route'

describe('lifecycle worker boundary', () => {
  beforeEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
  it('does not accept an absent, short or whitespace-containing secret', () => {
    expect(lifecycleAuthorized('Bearer anything')).toBe(false)
    vi.stubEnv('LIFECYCLE_WORKER_SECRET', 'short'); expect(lifecycleAuthorized('Bearer short')).toBe(false)
    vi.stubEnv('LIFECYCLE_WORKER_SECRET', `${'a'.repeat(32)} `); expect(lifecycleAuthorized(`Bearer ${'a'.repeat(32)} `)).toBe(false)
  })
  it('requires the exact bearer credential and scheme', () => {
    const secret = 'unit-test-worker-credential-'.repeat(2)
    vi.stubEnv('LIFECYCLE_WORKER_SECRET', secret)
    expect(lifecycleAuthorized(`Bearer ${secret}`)).toBe(true)
    expect(lifecycleAuthorized(`Bearer ${secret}x`)).toBe(false)
    expect(lifecycleAuthorized(`bearer ${secret}`)).toBe(false)
  })
  it('denies anonymous requests before the batch', async () => {
    const response = await POST(new Request('https://rentral.test/api/internal/lifecycle-worker', { method: 'POST' }))
    expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.batch).not.toHaveBeenCalled()
  })
  it('keeps disabled jobs isolated from the database', async () => {
    const secret = 'unit-test-worker-credential-'.repeat(2)
    vi.stubEnv('LIFECYCLE_WORKER_SECRET', secret)
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'false')
    const response = await POST(new Request('https://rentral.test/api/internal/lifecycle-worker', { method: 'POST', headers: { Authorization: `Bearer ${secret}` } }))
    expect(response.status).toBe(503); expect(mocks.batch).not.toHaveBeenCalled()
  })
  it('reports operational failure honestly', async () => {
    const secret = 'unit-test-worker-credential-'.repeat(2)
    vi.stubEnv('LIFECYCLE_WORKER_SECRET', secret); vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true'); vi.stubEnv('LIFECYCLE_WORKER_ENABLED', 'true')
    mocks.batch.mockRejectedValue(new Error('internal connection details'))
    const response = await POST(new Request('https://rentral.test/api/internal/lifecycle-worker', { method: 'POST', headers: { Authorization: `Bearer ${secret}` } }))
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('connection details')
  })
})
