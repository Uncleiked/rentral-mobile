import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// An isolated local Postgres cluster, never the application's DATABASE_URL.
// This tests SQL/RLS semantics, not the hosted Supabase Storage API or CDN.
const root = fileURLToPath(new URL('../', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'rentral-storage-test-'))
const database = join(directory, 'data')
let started = false
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.startsWith('PG') && !['DATABASE_URL', 'DIRECT_URL'].includes(key)))
function run(command, args, input) {
  const result = spawnSync(command, args, { input, env: environment, encoding: 'utf8', timeout: 60000 })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`)
  }
  return result.stdout
}
try {
  run('initdb', ['-D', database, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'])
  // Unix socket only; an empty listen_addresses never opens a TCP port.
  run('pg_ctl', ['-D', database, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
  started = true
  const sql = (source) => run('psql', ['-X', '-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], source)
  sql(readFileSync(join(root, 'tests/database/storage-fixture.sql'), 'utf8'))
  sql(readFileSync(join(root, 'prisma/migrations/20260724100500_add_listing_storage_buckets/migration.sql'), 'utf8'))
  sql(readFileSync(join(root, 'prisma/migrations/20260924170000_private_listing_media/migration.sql'), 'utf8'))
  process.stdout.write(sql(readFileSync(join(root, 'tests/database/storage-assertions.sql'), 'utf8')))
  process.stdout.write('Local Storage RLS checks passed. Hosted Storage acceptance is still required.\n')
} finally {
  if (started) run('pg_ctl', ['-D', database, '-m', 'fast', '-w', 'stop'])
  rmSync(directory, { recursive: true, force: true })
}
