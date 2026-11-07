import { describe, expect, it } from 'vitest'
import { stagingChecks, type EnvironmentValues } from '@/lib/environment/staging-policy'

function configuration(): EnvironmentValues {
  return { NEXT_PUBLIC_SUPABASE_URL: 'https://stagingref.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic-staging-key',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_synthetic-staging-key',
    DATABASE_URL: 'postgresql://postgres.stagingref:synthetic-password@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
    DIRECT_URL: 'postgresql://postgres.stagingref:synthetic-password@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3101',
  }
}
const local = { NEXT_PUBLIC_SUPABASE_URL: 'https://productionref.supabase.co' }
function failed(values: EnvironmentValues): string[] { return stagingChecks(values, local).filter(check => !check.ok).map(check => check.name) }

describe('credential-safe staging policy', () => {
  it('checks the current local configuration without requiring a separate project', () => {
    const values = configuration()
    expect(stagingChecks(values, values, false).every(check => check.ok)).toBe(true)
    expect(stagingChecks(values, values, false).some(check => check.name === 'Separate staging project')).toBe(false)
  })
  it('accepts a separate hosted target with proper pooler modes', () => { expect(failed(configuration())).toEqual([]) })
  it('rejects reuse of the local project', () => {
    const values = configuration()
    expect(stagingChecks(values, values).find(check => check.name === 'Separate staging project')?.ok).toBe(false)
  })
  it('rejects cross-project and unrelated database destinations', () => {
    expect(failed({ ...configuration(), DIRECT_URL: 'postgresql://postgres.otherref:synthetic-password@aws-1-eu-west-1.pooler.supabase.com:5432/postgres' })).toContain('DIRECT_URL target')
    expect(failed({ ...configuration(), DIRECT_URL: 'postgresql://postgres.stagingref:synthetic-password@attacker.example:5432/postgres' })).toContain('DIRECT_URL target')
  })
  it('rejects application URLs in database fields and transaction pooling for migrations', () => {
    expect(failed({ ...configuration(), DIRECT_URL: 'http://localhost:3001' })).toContain('DIRECT_URL target')
    expect(failed({ ...configuration(), DIRECT_URL: configuration().DATABASE_URL })).toContain('Migration connection mode')
  })
  it('rejects placeholders and disabled certificate verification', () => {
    expect(failed({ ...configuration(), DIRECT_URL: configuration().DIRECT_URL?.replace('synthetic-password', '%5BYOUR-PASSWORD%5D') })).toContain('DIRECT_URL password')
    expect(failed({ ...configuration(), DIRECT_URL: `${configuration().DIRECT_URL}?sslmode=no-verify` })).toContain('DIRECT_URL TLS setting')
    expect(failed({ ...configuration(), NEXT_PUBLIC_APP_URL: 'https://YOUR-STAGING-HOST.example' })).toContain('App URL')
  })
  it('does not accept server credentials in the public key slot', () => {
    expect(failed({ ...configuration(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_synthetic-staging-key' })).toContain('Publishable key format')
  })
  it('checks old JWT project, role and expiry without treating claims as authentication', () => {
    const token = (role: string, ref: string, exp: number): string => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref, exp })).toString('base64url')}.synthetic-signature`
    const nextYear = Math.floor(Date.now() / 1000) + 31536000
    const values = { ...configuration(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: token('anon', 'stagingref', nextYear), SUPABASE_SERVICE_ROLE_KEY: token('service_role', 'stagingref', nextYear) }
    expect(failed(values)).toEqual([])
    expect(failed({ ...values, SUPABASE_SERVICE_ROLE_KEY: token('service_role', 'otherref', nextYear) })).toContain('Server key format')
    expect(failed({ ...values, SUPABASE_SERVICE_ROLE_KEY: token('service_role', 'stagingref', 1) })).toContain('Server key format')
  })
  it('requires initial provider/worker gates to stay disabled and never echoes credentials', () => {
    const values = { ...configuration(), PAYMENTS_ENABLED: 'true' }
    const result = stagingChecks(values, local)
    expect(result.find(check => check.name === 'PAYMENTS_ENABLED rollout')?.ok).toBe(false)
    expect(JSON.stringify(result).includes('synthetic-password')).toBe(false)
    expect(JSON.stringify(result).includes('sb_secret_')).toBe(false)
  })
})
