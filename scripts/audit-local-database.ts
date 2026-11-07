import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'dotenv'
import { Client } from 'pg'
import { postgresConfig } from '../lib/environment/postgres-config.ts'

export type AuditCheck = { name: string; status: 'PASS' | 'PENDING' | 'FAIL'; detail: string }
export type LocalMigration = { name: string; checksum: string }
export type AppliedMigration = { name: string; checksum: string; completed: boolean; rolled_back: boolean }

const privateTables = [
  'User', 'WebhookLog', 'IndividualProfile', 'OrganizationProfile', 'Listing',
  'MediaAsset', 'MediaWebhookReceipt', 'SavedListing', 'Booking', 'PaymentIntent',
  'PaymentEvent', 'LedgerTransaction', 'LedgerEntry', 'Review', 'Dispute',
  'Notification', 'AdminAudit', 'DocumentReview', 'Renewal', 'MarketEvent',
  'ListingVerification', 'SafetyNotice', 'SafetyAppeal', 'HoldCreditAllocation',
]
const browserTables = ['Conversation', 'Message']
const appTables = [...privateTables, ...browserTables]

function safeName(value: string): string {
  return /^[A-Za-z0-9_ .:-]{1,160}$/.test(value) ? value : '[unrecognized metadata name]'
}

export function migrationChecks(local: LocalMigration[], applied: AppliedMigration[], existingAppTables: number): AuditCheck[] {
  const checks: AuditCheck[] = []
  const localByName = new Map(local.map(migration => [migration.name, migration]))
  const completed = applied.filter(migration => migration.completed && !migration.rolled_back)
  const completedNames = new Set(completed.map(migration => migration.name))
  const failed = applied.filter(migration => !migration.completed && !migration.rolled_back)
  const unknown = completed.filter(migration => !localByName.has(migration.name))
  const changed = completed.filter(migration => localByName.has(migration.name) && localByName.get(migration.name)?.checksum !== migration.checksum)
  const duplicates = completed.length - completedNames.size
  const lastAppliedIndex = Math.max(-1, ...local.map((migration, index) => completedNames.has(migration.name) ? index : -1))
  const gaps = local.filter((migration, index) => index < lastAppliedIndex && !completedNames.has(migration.name))
  const pending = local.filter(migration => !completedNames.has(migration.name))
  checks.push({ name: 'Migration history', status: applied.length === 0 && existingAppTables > 0 ? 'FAIL' : 'PASS',
    detail: `${completed.length} completed; ${failed.length} unfinished; ${pending.length} pending; ${existingAppTables} application tables present.` })
  for (const [label, migrations] of [['Unfinished migrations', failed], ['Unknown completed migrations', unknown], ['Modified applied migrations', changed], ['Migration history gaps', gaps]] as const) {
    checks.push({ name: label, status: migrations.length ? 'FAIL' : 'PASS',
      detail: migrations.length ? migrations.map(migration => safeName(migration.name)).join(', ') : 'None.' })
  }
  checks.push({ name: 'Duplicate completed migrations', status: duplicates ? 'FAIL' : 'PASS', detail: `${duplicates}.` })
  if (pending.length) checks.push({ name: 'Pending source migrations', status: 'PENDING', detail: pending.map(migration => safeName(migration.name)).join(', ') })
  return checks
}

function sourceMigrations(): LocalMigration[] {
  const directory = resolve('prisma/migrations')
  return readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
    if (!/^\d{14}_[a-zA-Z0-9_]+$/.test(entry.name)) throw new Error('Invalid source migration name.')
    return { name: entry.name, checksum: createHash('sha256').update(readFileSync(resolve(directory, entry.name, 'migration.sql'))).digest('hex') }
  }).sort((first, second) => first.name.localeCompare(second.name))
}

function databaseFailure(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : ''
  if (code === '28P01') return 'Database authentication failed.'
  if (code === '42501') return 'The selected database role cannot inspect required metadata.'
  if (code === '57014') return 'The read-only audit exceeded its query timeout.'
  if (['CERT_HAS_EXPIRED', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)) return 'Database TLS verification failed; check the trusted project CA.'
  if (['ENOTFOUND', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(code)) return 'The database endpoint is unavailable.'
  return 'The read-only metadata audit could not finish. No connection values or database errors are displayed.'
}

type TableMetadata = {
  name: string; rls: boolean; anon_table: boolean; anon_columns: boolean;
  authenticated_select: boolean; authenticated_table_mutation: boolean;
  authenticated_columns: boolean; authenticated_column_mutation: boolean;
}

export async function auditDatabase(client: Client, local: LocalMigration[]): Promise<AuditCheck[]> {
  const checks: AuditCheck[] = []
  const surface = await client.query<{ auth: boolean; storage: boolean; history: boolean; webhook: boolean }>(`
    SELECT to_regclass('auth.users') IS NOT NULL AS auth,
      to_regclass('storage.objects') IS NOT NULL AND to_regclass('storage.buckets') IS NOT NULL AS storage,
      to_regclass('public._prisma_migrations') IS NOT NULL AS history,
      to_regclass('public."WebhookLog"') IS NOT NULL AS webhook`)
  const availability = surface.rows[0]
  if (!availability?.auth || !availability.storage) {
    return [{ name: 'Supabase database surface', status: 'FAIL', detail: 'Required managed Auth/Storage tables are missing.' }]
  }
  checks.push({ name: 'Supabase database surface', status: 'PASS', detail: 'Managed Auth/Storage tables exist.' })

  const tables = await client.query<TableMetadata>(`
    SELECT c.relname AS name, c.relrowsecurity AS rls,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_table,
      has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS anon_columns,
      has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
      has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_table_mutation,
      has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS authenticated_columns,
      has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE,REFERENCES') AS authenticated_column_mutation
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY($1::text[])
    ORDER BY c.relname`, [appTables])
  const history = availability.history ? await client.query<AppliedMigration>(`
    SELECT migration_name AS name, checksum, finished_at IS NOT NULL AS completed,
      rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations ORDER BY started_at, migration_name`) : { rows: [] }
  checks.push(...migrationChecks(local, history.rows, tables.rows.length))
  checks.push({ name: 'Prisma migration table', status: availability.history ? 'PASS' : tables.rows.length ? 'FAIL' : 'PENDING',
    detail: availability.history ? 'Present.' : tables.rows.length ? 'Missing with an existing application schema; do not fabricate a baseline.' : 'Absent on an empty application schema.' })

  for (const row of tables.rows) {
    const browserReadable = browserTables.includes(row.name)
    const safeGrants = !row.anon_table && !row.anon_columns && !row.authenticated_table_mutation && !row.authenticated_column_mutation &&
      (browserReadable ? row.authenticated_select : !row.authenticated_columns)
    checks.push({ name: `Table ${safeName(row.name)}`, status: row.rls && safeGrants ? 'PASS' : 'FAIL',
      detail: `RLS ${row.rls ? 'enabled' : 'missing'}; effective browser grants ${safeGrants ? 'match' : 'do not match'} the server-owned access contract.` })
  }
  const missingTables = appTables.filter(name => !tables.rows.some(table => table.name === name))
  if (missingTables.length) checks.push({ name: 'Missing application tables', status: 'PENDING', detail: missingTables.join(', ') })

  const extensions = await client.query<{ name: string; schema: string }>(`
    SELECT e.extname AS name,n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname IN ('postgis','btree_gist')`)
  for (const name of ['postgis', 'btree_gist']) {
    const extension = extensions.rows.find(row => row.name === name)
    checks.push({ name: `Extension ${name}`, status: !extension ? 'PENDING' : extension.schema === 'extensions' ? 'PASS' : 'FAIL',
      detail: !extension ? 'Not installed yet.' : extension.schema === 'extensions' ? 'Installed in the required extensions schema.' : 'Installed outside extensions; CREATE EXTENSION IF NOT EXISTS will not relocate it.' })
  }

  const buckets = await client.query<{ id: string; public: boolean }>(`
    SELECT id,public FROM storage.buckets WHERE id=ANY($1::text[]) ORDER BY id`, [['profile-avatars', 'listings-media', 'compliance-docs']])
  for (const name of ['profile-avatars', 'listings-media', 'compliance-docs']) {
    const bucket = buckets.rows.find(row => row.id === name)
    checks.push({ name: `Bucket ${name}`, status: !bucket ? 'PENDING' : bucket.public === (name === 'profile-avatars') ? 'PASS' : 'FAIL',
      detail: !bucket ? 'Missing.' : `Public delivery ${bucket.public ? 'enabled' : 'disabled'}.` })
  }

  const policies = await client.query<{ table_name: string; name: string; permissive: string; command: string; roles: string[] }>(`
    SELECT tablename AS table_name,policyname AS name,permissive,cmd AS command,roles::text[]
    FROM pg_policies WHERE (schemaname='storage' AND tablename='objects') OR
      (schemaname='realtime' AND tablename='messages') OR
      (schemaname='public' AND tablename IN ('Conversation','Message'))`)
  for (const [name, table, restrictive] of [
    ['Listing originals require ownership', 'objects', true],
    ['Compliance documents require ownership', 'objects', true],
    ['rentral_conversation_members', 'Conversation', false],
    ['rentral_message_members', 'Message', false],
    ['rentral_private_conversation_read_boundary', 'messages', true],
    ['rentral_private_conversation_write_boundary', 'messages', true],
  ] as const) {
    const policy = policies.rows.find(row => row.name === name && row.table_name === table)
    const valid = !!policy && policy.roles.includes('authenticated') && (!restrictive || policy.permissive === 'RESTRICTIVE')
    checks.push({ name: `Policy ${name}`, status: valid ? 'PASS' : 'PENDING', detail: valid ? 'Expected policy metadata exists; hosted API tests still establish behavior.' : 'Expected policy metadata is missing or differs.' })
  }

  const signup = await client.query<{ definer: boolean; settings: string[] | null; anon_execute: boolean; authenticated_execute: boolean; trigger: boolean }>(`
    SELECT p.prosecdef AS definer,p.proconfig AS settings,
      has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
      EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='auth.users'::regclass AND t.tgname='on_auth_user_created'
        AND t.tgfoid=p.oid AND t.tgtype=5 AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal) AS trigger
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='handle_new_user' AND p.pronargs=0`)
  const signupFunction = signup.rows[0]
  const signupSafe = !!signupFunction && signupFunction.definer && signupFunction.trigger &&
    !signupFunction.anon_execute && !signupFunction.authenticated_execute &&
    signupFunction.settings?.some(setting => /^search_path=(?:""|)$/.test(setting)) === true
  checks.push({ name: 'Signup trigger/function', status: signupSafe ? 'PASS' : signupFunction ? 'FAIL' : 'PENDING',
    detail: signupSafe ? 'Enabled AFTER INSERT row trigger; restricted definer function with pinned empty search path.' : 'Required trigger/function security metadata is missing or differs.' })

  const referencedTriggers = await client.query<{ name: string; enabled: boolean }>(`
    SELECT tgname AS name,tgenabled IN ('O','A') AS enabled FROM pg_trigger
    WHERE tgrelid='storage.objects'::regclass AND tgname IN ('rentral_protect_upload_delete','rentral_protect_upload_move') AND NOT tgisinternal`)
  checks.push({ name: 'Referenced upload triggers', status: referencedTriggers.rows.length === 2 && referencedTriggers.rows.every(row => row.enabled) ? 'PASS' : 'PENDING',
    detail: `${referencedTriggers.rows.filter(row => row.enabled).length} of 2 enabled guards present.` })
  const publication = await client.query<{ published: boolean }>(`
    SELECT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='Message') AS published`)
  checks.push({ name: 'Message Realtime publication', status: publication.rows[0]?.published ? 'PASS' : 'PENDING', detail: publication.rows[0]?.published ? 'Present.' : 'Missing; private live messaging is not accepted.' })

  if (availability.webhook) {
    const columns = await client.query<{ name: string }>(`
      SELECT attname AS name FROM pg_attribute WHERE attrelid='public."WebhookLog"'::regclass
        AND attnum>0 AND NOT attisdropped AND attname IN ('raw_body','event_created_at','metadata_synced_at')`)
    checks.push({ name: 'Didit ordering columns', status: columns.rows.filter(row => row.name !== 'raw_body').length === 2 ? 'PASS' : 'PENDING',
      detail: `${columns.rows.filter(row => row.name !== 'raw_body').length} of 2 ordering columns present.` })
    if (columns.rows.some(row => row.name === 'raw_body')) {
      // Only the aggregate count leaves Postgres. No historical payload enters
      // application memory/output; this works on versions without pg_input_is_valid.
      await client.query(`DO $$ DECLARE payload record; invalid_count bigint := 0;
        BEGIN
          FOR payload IN SELECT raw_body FROM public."WebhookLog" LOOP
            BEGIN PERFORM payload.raw_body::jsonb;
            EXCEPTION WHEN invalid_text_representation THEN invalid_count := invalid_count + 1;
            END;
          END LOOP;
          PERFORM set_config('rentral.audit_invalid_webhook_json', invalid_count::text, true);
        END $$`)
      const invalid = await client.query<{ count: string }>(`SELECT current_setting('rentral.audit_invalid_webhook_json') AS count`)
      const count = invalid.rows[0]?.count
      checks.push({ name: 'Historical Didit JSON', status: count === '0' ? 'PASS' : 'FAIL', detail: `${count ?? 'Unknown'} malformed payloads; payload contents remain hidden.` })
    }
  }
  return checks
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log('Read-only .env.local DIRECT_URL metadata audit. Prints only check results and schema/migration names; never applies migrations.')
    return
  }
  const file = resolve('.env.local')
  if (!existsSync(file)) throw new Error('Required environment file is missing.')
  const environment = parse(readFileSync(file))
  const connection = environment.DIRECT_URL?.trim()
  if (!connection) throw new Error('DIRECT_URL is missing.')
  const target = new URL(connection)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('DIRECT_URL is not PostgreSQL.')
  const client = new Client({ ...postgresConfig(connection, environment.SUPABASE_DB_CA_CERT_PATH),
    connectionTimeoutMillis: 12000, query_timeout: 20000, application_name: 'rentral-readonly-local-audit' })
  let connected = false
  try {
    await client.connect()
    connected = true
    await client.query('BEGIN READ ONLY')
    await client.query("SET LOCAL statement_timeout = '15000ms'")
    await client.query("SET LOCAL lock_timeout = '2000ms'")
    const result = await auditDatabase(client, sourceMigrations())
    await client.query('ROLLBACK')
    for (const check of result) console.log(`${check.status} ${check.name}: ${check.detail}`)
    console.log(`Audit complete: ${result.filter(check => check.status === 'PASS').length} passed, ${result.filter(check => check.status === 'PENDING').length} pending, ${result.filter(check => check.status === 'FAIL').length} failed. No database changes were made.`)
    if (result.some(check => check.status === 'FAIL')) process.exitCode = 1
  } catch (error) {
    if (connected) await client.query('ROLLBACK').catch(() => undefined)
    console.error(`FAIL Database audit: ${databaseFailure(error)}`)
    process.exitCode = 1
  } finally {
    await client.end().catch(() => undefined)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('FAIL Database audit: configuration or source files could not be read; values remain hidden.'); process.exitCode = 1 })
}
