import { config } from 'dotenv'
import pg from 'pg'

config({ path: ['.env.local', '.env'], quiet: true })
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  statement_timeout: 10000,
})

async function audit(): Promise<void> {
  await client.connect()
  await client.query('BEGIN READ ONLY')
  const tables = await client.query<{ table_name: string; rls_enabled: boolean; anon_select: boolean; authenticated_select: boolean }>(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
      has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname IN ('User', 'IndividualProfile', 'OrganizationProfile', 'Listing', 'WebhookLog')
    ORDER BY c.relname
  `)
  const constraints = await client.query<{ table_name: string; constraint_name: string; validated: boolean }>(`
    SELECT c.conrelid::regclass::text AS table_name, c.conname AS constraint_name, c.convalidated AS validated
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.conrelid::regclass::text IN ('"Listing"', '"User"')
    ORDER BY c.conname
  `)
  await client.query('ROLLBACK')
  console.log(JSON.stringify({ tables: tables.rows, constraints: constraints.rows }, null, 2))
  if (tables.rows.length !== 5 || tables.rows.some(row => !row.rls_enabled || row.anon_select || row.authenticated_select)) {
    process.exitCode = 1
  }
}

audit().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown'
  const message = error instanceof Error ? error.message : ''
  const reason = ['Tenant or user not found', 'password authentication failed', 'Circuit breaker open', 'Connection terminated', 'self-signed certificate']
    .find(known => message.toLowerCase().includes(known.toLowerCase())) ?? 'Database connection or schema query rejected'
  console.error(`Database audit failed (${code}): ${reason}. No row data was queried.`)
  process.exitCode = 1
}).finally(() => client.end())
