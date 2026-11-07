import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import { Client } from 'pg'
import { resolve4, resolve6 } from 'node:dns/promises'
import { stagingChecks } from '../lib/environment/staging-policy.ts'
import { postgresConfig } from '../lib/environment/postgres-config.ts'

type Check = { name: string; ok: boolean; detail: string }

function safeDatabaseFailure(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : ''
  if (code === '28P01') return 'Database authentication failed. Check the selected database password.'
  if (code === 'ENOTFOUND') return 'Database hostname could not be resolved.'
  if (['ENETUNREACH', 'EHOSTUNREACH'].includes(code)) return 'Database network is unreachable; try the Session pooler for IPv4.'
  if (['CERT_HAS_EXPIRED', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)) return 'The database certificate could not be verified. Configure the project CA certificate; do not disable verification.'
  if (code === 'ECONNREFUSED') return 'The database connection was refused.'
  return 'Database connection failed or timed out. No credential values are shown.'
}

async function databaseCheck(name: string, connection: string, caPath?: string): Promise<Check> {
  const target = new URL(connection)
  const dns = await Promise.allSettled([resolve4(target.hostname), resolve6(target.hostname)])
  const ipv4 = dns[0].status === 'fulfilled' && dns[0].value.length > 0
  const ipv6 = dns[1].status === 'fulfilled' && dns[1].value.length > 0
  const dnsDetail = !ipv4 && ipv6 ? ' This endpoint has only IPv6 records; use the project Session pooler on an IPv4-only machine.'
    : !ipv4 && !ipv6 ? ' Neither IPv4 nor IPv6 records were found; copy the hostname from the project Connect panel again.' : ''
  target.searchParams.delete('sslmode')
  const client = new Client({ ...postgresConfig(target.href, caPath), connectionTimeoutMillis: 12000, query_timeout: 12000,
    application_name: 'rentral-environment-preflight', ...(!caPath ? { ssl: { rejectUnauthorized: true } } : {}),
  })
  try {
    await client.connect()
    await client.query('BEGIN READ ONLY')
    const result = await client.query<{ database: string; app_tables: string | null; migration_table: string | null }>(
      `SELECT current_database() AS database,
        to_regclass('public."User"')::text AS app_tables, to_regclass('public._prisma_migrations')::text AS migration_table`)
    await client.query('ROLLBACK')
    const row = result.rows[0]
    // pg rejects a non-TLS server when ssl is explicitly configured. pg_stat_ssl
    // describes the pooler's upstream connection, not this verified TLS socket.
    return { name, ok: row?.database === 'postgres',
      detail: `TLS database connection accepted. Application schema ${row?.app_tables ? 'exists' : 'not yet installed'}; migration history ${row?.migration_table ? 'exists' : 'not yet installed'}.` }
  } catch (error) { return { name, ok: false, detail: safeDatabaseFailure(error) + dnsDetail } }
  finally { await client.end().catch(() => undefined) }
}

async function apiCheck(name: string, url: string, key: string): Promise<Check> {
  try {
    const response = await fetch(url, { headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(12000), redirect: 'error' })
    // Never display response bodies: even an error could include operational details.
    await response.body?.cancel()
    return { name, ok: response.ok, detail: response.ok ? 'Supabase API accepted the credential.' : `Supabase API returned HTTP ${response.status}; check that this key belongs to the configured project.` }
  } catch { return { name, ok: false, detail: 'Supabase API could not be reached within the timeout.' } }
}

async function main(): Promise<void> {
  const localMode = process.argv.includes('--local')
  const file = resolve(localMode ? '.env.local' : '.env.staging')
  if (!existsSync(file)) throw new Error('The selected ignored environment file is missing.')
  const staging = parse(readFileSync(file))
  const local = !localMode && existsSync('.env.local') ? parse(readFileSync('.env.local')) : {}
  console.log(`Checking ${localMode ? '.env.local' : '.env.staging'}; values remain hidden.`)
  const checks = stagingChecks(staging, local, !localMode)
  for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.ok ? '' : `: ${check.detail}`}`)
  if (checks.some(check => !check.ok)) { process.exitCode = 1; return }
  if (process.argv.includes('--remote')) {
    const origin = staging.NEXT_PUBLIC_SUPABASE_URL
    const remote = await Promise.all([
      apiCheck('Publishable Auth API', `${origin}/auth/v1/settings`, staging.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      apiCheck('Server Storage API', `${origin}/storage/v1/bucket`, staging.SUPABASE_SERVICE_ROLE_KEY),
      databaseCheck('DIRECT_URL connectivity', staging.DIRECT_URL, staging.SUPABASE_DB_CA_CERT_PATH),
      databaseCheck('DATABASE_URL connectivity', staging.DATABASE_URL, staging.SUPABASE_DB_CA_CERT_PATH),
    ])
    for (const check of remote) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`)
    if (remote.some(check => !check.ok)) process.exitCode = 1
  } else console.log('Static checks passed. Run with --remote to verify credentials/connectivity read-only.')
}

main().catch(() => { console.error('Environment preflight could not run. Check the local file syntax; credentials are never printed.'); process.exitCode = 1 })
