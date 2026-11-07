import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { migrationConnection, postgresConfig } from '../lib/environment/postgres-config'

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }))
const connection = 'postgresql://fixture:fixture@localhost:5432/postgres?schema=public&sslmode=no-verify&sslrootcert=old.crt'

beforeEach(() => vi.mocked(readFileSync).mockReturnValue('fixture-ca'))

describe('database CA configuration', () => {
  it('keeps unconfigured local database options intact', () => {
    expect(postgresConfig(connection)).toEqual({ connectionString: connection })
    expect(migrationConnection(connection)).toBe(connection)
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it('requires a trusted certificate and prevents URL SSL overrides in pg', () => {
    const config = postgresConfig(connection, 'certificates/supabase-ca.crt')
    const target = new URL(config.connectionString!)
    expect(target.searchParams.has('sslmode')).toBe(false)
    expect(target.searchParams.has('sslrootcert')).toBe(false)
    expect(target.searchParams.get('schema')).toBe('public')
    expect(config.ssl).toEqual({ ca: 'fixture-ca', rejectUnauthorized: true })
  })

  it('requires strict certificate verification in Prisma migrations', () => {
    const target = new URL(migrationConnection(connection, 'certificates/supabase-ca.crt'))
    expect(target.searchParams.get('sslmode')).toBe('require')
    expect(target.searchParams.get('sslaccept')).toBe('strict')
    expect(target.searchParams.get('sslcert')?.endsWith('/certificates/supabase-ca.crt')).toBe(true)
  })
})
