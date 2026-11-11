import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthProviders } from '@/lib/auth-providers'
import { googleConfigurationCheck } from '@/lib/auth/google-config'
import { MongoReadinessError } from '@/lib/database/readiness'
import { inspectEnvironment } from '../scripts/check-environment.mjs'

const { prepared } = vi.hoisted(() => ({ prepared: vi.fn() }))
vi.mock('@/lib/database/readiness', () => ({
  googleAuthPrepared: prepared,
  MongoReadinessError: class extends Error {
    readonly status = 503
    constructor(readonly code: string) { super('private fixture database response'); this.name = 'MongoReadinessError' }
  },
}))

const backend = {
  GOOGLE_AUTH_ENABLED: 'true',
  GOOGLE_CLIENT_ID: '1234567890-fixture.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'private-fixture-client-secret',
  NEXT_PUBLIC_APP_URL: 'https://rentral.example.test',
  MONGODB_URL: 'mongodb://127.0.0.1:27017/fixture?replicaSet=rs0',
  JWT_SECRET: 'private-fixture-signing-secret-at-least32bytes',
}
const mobile = { EXPO_PUBLIC_API_URL: 'http://localhost:3000' }
beforeEach(() => {
  for (const [key, value] of Object.entries(backend)) vi.stubEnv(key, value)
  prepared.mockReset().mockResolvedValue(true)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('Google provider activation diagnostics', () => {
  it('offers Google only with valid settings and prepared identity storage', async () => {
    expect(await getAuthProviders()).toEqual({ google: true, apple: false })
    expect(console.warn).not.toHaveBeenCalled()
  })
  it.each([
    ['GOOGLE_AUTH_ENABLED', undefined, 'GOOGLE_AUTH_NOT_ENABLED'],
    ['GOOGLE_AUTH_ENABLED', '"true"', 'GOOGLE_AUTH_NOT_ENABLED'],
    ['GOOGLE_AUTH_ENABLED', 'true\n', 'GOOGLE_AUTH_NOT_ENABLED'],
    ['GOOGLE_CLIENT_ID', undefined, 'GOOGLE_CLIENT_ID_INVALID'],
    ['GOOGLE_CLIENT_ID', 'short.apps.googleusercontent.com', 'GOOGLE_CLIENT_ID_INVALID'],
    ['GOOGLE_CLIENT_ID', '1234567890~fixture.apps.googleusercontent.com', 'GOOGLE_CLIENT_ID_INVALID'],
    ['GOOGLE_CLIENT_SECRET', undefined, 'GOOGLE_CLIENT_SECRET_INVALID'],
    ['GOOGLE_CLIENT_SECRET', 'copied private secret', 'GOOGLE_CLIENT_SECRET_INVALID'],
    ['GOOGLE_CLIENT_SECRET', 'x'.repeat(501), 'GOOGLE_CLIENT_SECRET_INVALID'],
    ['NEXT_PUBLIC_APP_URL', undefined, 'NEXT_PUBLIC_APP_URL_INVALID'],
    ['NEXT_PUBLIC_APP_URL', 'https://rentral.example.test/sign-in', 'NEXT_PUBLIC_APP_URL_INVALID'],
    ['NEXT_PUBLIC_APP_URL', 'http://rentral.example.test', 'NEXT_PUBLIC_APP_URL_INVALID'],
  ])('identifies invalid %s safely without contacting MongoDB', async (key, value, reason) => {
    vi.stubEnv(key, value)
    expect(await getAuthProviders()).toEqual({ google: false, apple: false })
    expect(prepared).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith('[auth/google/readiness]', { reasons: [reason] })
    const output = JSON.stringify(vi.mocked(console.warn).mock.calls)
    expect(output).not.toContain(backend.GOOGLE_CLIENT_SECRET)
    expect(output).not.toContain(backend.GOOGLE_CLIENT_ID)
  })
  it('does not treat the unused NEXT_APP_URL setting as the app origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined)
    vi.stubEnv('NEXT_APP_URL', backend.NEXT_PUBLIC_APP_URL)
    expect(await getAuthProviders()).toEqual({ google: false, apple: false })
    expect(console.warn).toHaveBeenCalledWith('[auth/google/readiness]', { reasons: ['NEXT_PUBLIC_APP_URL_INVALID'] })
  })
  it('reports missing Google storage preparation separately from base setup', async () => {
    prepared.mockResolvedValue(false)
    expect(await getAuthProviders()).toEqual({ google: false, apple: false })
    expect(console.warn).toHaveBeenCalledWith('[auth/google/readiness]', { reasons: ['GOOGLE_DATABASE_SETUP_REQUIRED'] })
  })
  it.each(['DATABASE_SETUP_REQUIRED', 'DATABASE_UNAVAILABLE'] as const)('reports only the allowlisted %s readiness code', async code => {
    prepared.mockRejectedValue(new MongoReadinessError(code))
    expect(await getAuthProviders()).toEqual({ google: false, apple: false })
    expect(console.warn).toHaveBeenCalledWith('[auth/google/readiness]', { reasons: [code] })
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('private fixture')
  })
  it('never logs arbitrary database errors or error codes', async () => {
    prepared.mockRejectedValue(Object.assign(new Error('mongodb://private:password@server/secret'), { code: 'private-code' }))
    expect(await getAuthProviders()).toEqual({ google: false, apple: false })
    expect(console.warn).toHaveBeenCalledWith('[auth/google/readiness]', { reasons: ['GOOGLE_DATABASE_CHECK_FAILED'] })
  })
})

describe('offline and runtime Google validation agree', () => {
  it.each([
    ['GOOGLE_CLIENT_ID', 'short.apps.googleusercontent.com'],
    ['GOOGLE_CLIENT_ID', '1234567890~fixture.apps.googleusercontent.com'],
    ['GOOGLE_CLIENT_SECRET', 'copied private secret'],
    ['GOOGLE_CLIENT_SECRET', 'x'.repeat(501)],
    ['NEXT_PUBLIC_APP_URL', 'http://public.example.test'],
  ])('rejects invalid %s in both checkers', (key, value) => {
    vi.stubEnv(key, value)
    expect(googleConfigurationCheck().configuration).toBeNull()
    const result = inspectEnvironment({ ...backend, [key]: value }, mobile)
    expect(result.errors).toContainEqual(expect.objectContaining({ key }))
    expect(JSON.stringify(result)).not.toContain(backend.GOOGLE_CLIENT_SECRET)
  })
  it('accepts the same complete web OAuth settings in both checkers', () => {
    expect(googleConfigurationCheck().configuration?.callback).toBe('https://rentral.example.test/auth/google/callback')
    expect(inspectEnvironment(backend, mobile).ok).toBe(true)
  })
})
