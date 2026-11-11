import { describe, expect, it } from 'vitest'
import { inspectEnvironment } from '../scripts/check-environment.mjs'

const backend = { MONGODB_URL: 'mongodb://127.0.0.1:27017/rentral?replicaSet=rs0', JWT_SECRET: 'private-fixture-signing-secret-at-least32bytes',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000', AUTH_DEV_EMAIL_OUTBOX: 'true', RENTRAL_PLATFORM_ENABLED: 'true' }
const mobile = { EXPO_PUBLIC_API_URL: 'http://192.0.2.10:3000' }
describe('private environment file inspection', () => {
  it('checks a local baseline without exposing configured addresses or signing values', () => {
    const result = inspectEnvironment(backend, mobile)
    expect(result.ok).toBe(true)
    for (const value of Object.values({ ...backend, ...mobile })) if (value.length > 10) expect(JSON.stringify(result)).not.toContain(value)
  })
  it('rejects a PostgreSQL URI, short signing key and a credential-bearing mobile URL', () => {
    const result = inspectEnvironment({ ...backend, MONGODB_URL: 'postgresql://private:password@host/db', JWT_SECRET: 'short' }, { EXPO_PUBLIC_API_URL: 'http://private:password@host:3000' })
    expect(result.errors.map(item => item.key)).toEqual(expect.arrayContaining(['MONGODB_URL', 'JWT_SECRET', 'EXPO_PUBLIC_API_URL']))
    expect(JSON.stringify(result)).not.toContain('password@')
  })
  it('rejects insecure Atlas TLS options and public mobile secrets', () => {
    const result = inspectEnvironment({ ...backend, MONGODB_URL: 'mongodb://atlas.example.test/rentral?tlsAllowInvalidCertificates=true' }, { ...mobile, EXPO_PUBLIC_JWT_SECRET: 'private-value', PAYSTACK_SECRET_KEY: 'backend-only' })
    expect(result.errors.map(item => item.key)).toEqual(expect.arrayContaining(['MONGODB_URL', 'EXPO_PUBLIC_JWT_SECRET', 'PAYSTACK_SECRET_KEY']))
    expect(JSON.stringify(result)).not.toContain('private-value')
  })
  it('does not require disabled providers and rejects false-looking flag typos', () => {
    expect(inspectEnvironment({ ...backend, PAYMENTS_ENABLED: 'false', PUSH_NOTIFICATIONS_ENABLED: 'false' }, mobile).ok).toBe(true)
    expect(inspectEnvironment({ ...backend, PAYMENTS_ENABLED: 'TRUE' }, mobile).errors).toContainEqual(expect.objectContaining({ key: 'PAYMENTS_ENABLED' }))
  })
  it('rejects copied template credentials and phone addresses without printing them', () => {
    const result = inspectEnvironment({ ...backend, JWT_SECRET: 'YOUR_EXISTING_PRIVATE_SIGNING_SECRET' }, { EXPO_PUBLIC_API_URL: 'http://YOUR_COMPUTER_LAN_IP:3000' })
    expect(result.ok).toBe(false)
    expect(result.errors.map(item => item.key)).toEqual(expect.arrayContaining(['JWT_SECRET', 'EXPO_PUBLIC_API_URL']))
    expect(JSON.stringify(result)).not.toContain('YOUR_EXISTING_PRIVATE_SIGNING_SECRET')
  })
  it('recognizes masked Geoapify values and copied request URLs without exposing the key', () => {
    for (const key of ['masked**project', 'https://api.geoapify.com/v1/geocode/search?apiKey=private-fixture', 'invalid key']) {
      const result = inspectEnvironment({ ...backend, GEOAPIFY_API_KEY: key }, mobile)
      expect(result.errors).toContainEqual(expect.objectContaining({ key: 'GEOAPIFY_API_KEY' }))
      expect(JSON.stringify(result)).not.toContain(key)
    }
    expect(inspectEnvironment({ ...backend, GEOAPIFY_API_KEY: 'synthetic-project-key' }, mobile).ok).toBe(true)
  })
  it('rejects mismatched Paystack environments and public collection keys', () => {
    expect(inspectEnvironment({ ...backend, PAYMENTS_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_fixture', PAYSTACK_ENVIRONMENT: 'live' }, mobile).errors).toContainEqual(expect.objectContaining({ key: 'PAYSTACK_ENVIRONMENT' }))
    expect(inspectEnvironment({ ...backend, PAYMENTS_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'pk_test_fixture', PAYSTACK_ENVIRONMENT: 'test' }, mobile).ok).toBe(false)
  })
  it('requires dedicated encoded keys and a cutoff before enabling real mail', () => {
    const result = inspectEnvironment({ ...backend, AUTH_EMAIL_ENABLED: 'true', NOTIFICATION_EMAIL_ENABLED: 'true', RESEND_API_KEY: 'private-fixture', RENTRAL_EMAIL_FROM: 'local@fixture.invalid' }, mobile)
    expect(result.errors.map(item => item.key)).toEqual(expect.arrayContaining(['AUTH_EMAIL_ENCRYPTION_KEY', 'NOTIFICATION_EMAIL_SINCE']))
  })
  it('uses standard base64 for push encryption and requires matching project IDs', () => {
    const projectId = '11111111-1111-4111-8111-111111111111'
    const push = { ...backend, PUSH_NOTIFICATIONS_ENABLED: 'true', PUSH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
      EXPO_ACCESS_TOKEN: 'private-expo-fixture-access-token', PUSH_NOTIFICATIONS_SINCE: '2026-11-09T00:00:00Z', EXPO_PUBLIC_EAS_PROJECT_ID: projectId }
    expect(inspectEnvironment(push, { ...mobile, EXPO_PUBLIC_EAS_PROJECT_ID: projectId }).ok).toBe(true)
    expect(inspectEnvironment(push, mobile).errors).toContainEqual(expect.objectContaining({ key: 'EXPO_PUBLIC_EAS_PROJECT_ID' }))
  })
  it('requires exact server prices and bounded manual terms without inventing defaults', () => {
    const commerce = { ...backend, COMMERCIAL_ENABLED: 'true', PAYMENTS_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'sk_test_fixture',
      INSIGHTS_PRICE_KOBO: '10000', SPONSORSHIP_PRICE_KOBO: '20000', INSIGHTS_TERM_DAYS: '30', SPONSORSHIP_TERM_DAYS: '7' }
    expect(inspectEnvironment(commerce, mobile).ok).toBe(true)
    expect(inspectEnvironment({ ...commerce, INSIGHTS_PRICE_KOBO: '1.5', SPONSORSHIP_TERM_DAYS: '367' }, mobile).ok).toBe(false)
    expect(inspectEnvironment({ ...commerce, INSIGHTS_PRICE_KOBO: 'not-money' }, mobile).ok).toBe(false)
  })
  it('requires private Google credentials only when enabled and rejects a public HTTP callback', () => {
    const incomplete = inspectEnvironment({ ...backend, GOOGLE_AUTH_ENABLED: 'true' }, mobile)
    expect(incomplete.errors.map(item => item.key)).toEqual(expect.arrayContaining(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']))
    const configured = { ...backend, GOOGLE_AUTH_ENABLED: 'true', GOOGLE_CLIENT_ID: '12345.synthetic.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'synthetic-private-google-client-secret' }
    expect(inspectEnvironment(configured, mobile).ok).toBe(true)
    const insecure = inspectEnvironment({ ...configured, NEXT_PUBLIC_APP_URL: 'http://public.fixture.test' }, mobile)
    expect(insecure.errors).toContainEqual(expect.objectContaining({ key: 'NEXT_PUBLIC_APP_URL' }))
    expect(JSON.stringify(insecure)).not.toContain(configured.GOOGLE_CLIENT_SECRET)
    expect(JSON.stringify(insecure)).not.toContain(configured.GOOGLE_CLIENT_ID)
    expect(inspectEnvironment({ ...backend, GOOGLE_AUTH_ENABLED: 'TRUE' }, mobile).errors).toContainEqual(expect.objectContaining({ key: 'GOOGLE_AUTH_ENABLED' }))
  })
})
