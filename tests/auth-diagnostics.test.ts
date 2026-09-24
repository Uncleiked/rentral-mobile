import { afterEach, describe, expect, it, vi } from 'vitest'
import { authErrorMessage } from '@/lib/auth-errors'
import { getAuthProviders } from '@/lib/auth-providers'
import { telemetryEnabled } from '@/lib/telemetry-config'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('safe auth feedback', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'Email or password is incorrect.'],
    [{ code: 'email_not_confirmed' }, 'Confirm your email address before signing in.'],
    [{ status: 429 }, 'Too many attempts. Please wait a moment before trying again.'],
    [{ code: 'provider_disabled' }, 'This sign-in provider is unavailable. Please use email and password.'],
    [{ message: 'private provider response' }, 'Sign-in could not be completed. Please try again.'],
  ])('maps %j without leaking provider internals', (error, message) => {
    expect(authErrorMessage(error)).toBe(message)
  })
})

describe('configured OAuth providers', () => {
  it('only offers explicitly enabled providers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ external: { google: true, apple: false } })))
    expect(await getAuthProviders()).toEqual({ google: true, apple: false })
  })
  it.each([null, {}, { external: { google: 'true', apple: 1 } }])('rejects malformed settings %j', async (settings) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(settings)))
    expect(await getAuthProviders()).toEqual({ google: false, apple: false })
  })
  it('keeps email login available during settings outages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await getAuthProviders()).toEqual({ google: false, apple: false })
  })
})

describe('local telemetry', () => {
  it('requires opt-in during development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'test-token')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_ENABLED', undefined)
    expect(telemetryEnabled()).toBe(false)
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_ENABLED', 'true')
    expect(telemetryEnabled()).toBe(true)
  })
  it('retains production telemetry unless explicitly disabled', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'test-token')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_ENABLED', undefined)
    expect(telemetryEnabled()).toBe(true)
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_ENABLED', 'false')
    expect(telemetryEnabled()).toBe(false)
  })
})
