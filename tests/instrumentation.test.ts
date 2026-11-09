import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ construct: vi.fn(), register: vi.fn(), report: vi.fn() }))
vi.mock('@oluso/nextjs', () => ({
  Oluso: class { constructor(options: unknown) { sdk.construct(options) } },
  registerOlusoProcessHandlers: sdk.register,
  createOnRequestError: () => sdk.report,
}))

describe('optional server monitoring', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.stubEnv('NEXT_RUNTIME', 'nodejs'); vi.stubEnv('OLUSO_ENABLED', 'false'); vi.stubEnv('OLUSO_API_KEY', '') })
  afterEach(() => vi.unstubAllEnvs())

  it('starts without an API key or constructing an SDK client', async () => {
    const { register } = await import('../instrumentation')
    await register()
    expect(sdk.construct).not.toHaveBeenCalled()
  })

  it('requires explicit opt-in even if a key is present', async () => {
    vi.stubEnv('OLUSO_API_KEY', 'fixture-monitoring-key')
    const { register } = await import('../instrumentation')
    await register()
    expect(sdk.construct).not.toHaveBeenCalled()
  })

  it('does not load the Node monitor in the Edge runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge'); vi.stubEnv('OLUSO_ENABLED', 'true'); vi.stubEnv('OLUSO_API_KEY', 'fixture-monitoring-key')
    const { register } = await import('../instrumentation')
    await register()
    expect(sdk.construct).not.toHaveBeenCalled()
  })

  it('registers an explicitly configured monitor once and adapts Next 16 request errors', async () => {
    vi.stubEnv('OLUSO_ENABLED', 'true'); vi.stubEnv('OLUSO_API_KEY', 'fixture-monitoring-key')
    const { register, onRequestError } = await import('../instrumentation')
    await register(); await register()
    const failure = new Error('Fixture request error')
    await onRequestError(failure, { path: '/fixture', method: 'GET', headers: { accept: ['text/html', 'application/json'], missing: undefined } }, {
      routerKind: 'App Router', routePath: '/fixture', routeType: 'proxy', revalidateReason: undefined,
    })
    expect(sdk.construct).toHaveBeenCalledOnce()
    expect(sdk.register).toHaveBeenCalledOnce()
    expect(sdk.report).toHaveBeenCalledWith(failure, { path: '/fixture', method: 'GET', headers: { accept: 'text/html, application/json' } }, {
      routerKind: 'App Router', routePath: '/fixture', routeType: 'middleware',
    })
  })
})
