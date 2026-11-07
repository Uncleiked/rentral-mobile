import { execFileSync, spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// This harness deliberately never imports application config or reads .env files.
const container = 'rentral-platform-test'
const database = 'rentral_platform_test'
const marker = 'rentral:isolated-platform-verification'
const root = fileURLToPath(new URL('../', import.meta.url))
const environment: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_SERVICE_ROLE_KEY'].includes(key))),
  NODE_ENV: process.env.NODE_ENV ?? 'test',
}

function docker(args: string[], input?: string): string {
  return execFileSync('docker', args, { input, env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function sql(source: string, target: string = database): string {
  if (![database, 'postgres'].includes(target)) throw new Error('Unexpected database target.')
  return docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', target, '-v', 'ON_ERROR_STOP=1', '-At'], source)
}

type SqlResult = { status: number | null; output: string }
function parallelSql(source: string): Promise<SqlResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], { env: environment, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Concurrent database check timed out.')) }, 15000)
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.on('error', (error: Error) => { clearTimeout(timer); reject(error) })
    child.on('close', (status: number | null) => { clearTimeout(timer); resolve({ status, output }) })
    child.stdin.end(source)
  })
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function failureOutput(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    const stderr = error.stderr
    if (typeof stderr === 'string') return stderr
    if (Buffer.isBuffer(stderr)) return stderr.toString()
  }
  return error instanceof Error ? error.message : 'Unknown database execution error'
}

function expectFailure(source: string, expected: string): void {
  let failed = false
  try { sql(source) } catch (error) {
    failed = true
    assert(failureOutput(error).includes(expected), `Expected ${expected}; received ${failureOutput(error)}`)
  }
  assert(failed, `SQL unexpectedly succeeded; expected ${expected}.`)
}

function reservationSql(id: string, status: string, start = '2030-02-01T12:00Z', end = '2030-02-03T12:00Z', kind = 'rental'): string {
  // All values are fixed test constants, never user input or application secrets.
  return `INSERT INTO public."Booking" (id,listing_id,seeker_id,lister_id,kind,status,starts_at,ends_at,amount_kobo,"updatedAt") VALUES ('${id}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','${kind}','${status}','${start}','${end}',300000,now());`
}

async function main(): Promise<void> {
  const taskLabel = docker(['inspect', '--format', '{{index .Config.Labels "rentral.task"}}', container])
  assert(taskLabel === 'platform-verification', 'Refusing to use a container without the exact task ownership label.')
  assert(docker(['inspect', '--format', '{{.State.Running}}', container]) === 'true', 'The task test container must be running.')
  const portMappings: unknown = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', container]))
  assert(typeof portMappings === 'object' && portMappings !== null && Object.values(portMappings).every(value => value === null), 'Refusing a test container with published host ports.')
  assert(sql('SELECT current_database();', 'postgres') === 'postgres', 'Unexpected local administrative database.')
  const existing = sql(`SELECT datname || '|' || coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname='${database}';`, 'postgres')
  if (existing) {
    assert(existing === `${database}|${marker}`, 'Refusing to reset an unmarked database.')
    sql(`DROP DATABASE ${database} WITH (FORCE);`, 'postgres')
  }
  sql(`CREATE DATABASE ${database} TEMPLATE template0; COMMENT ON DATABASE ${database} IS '${marker}';`, 'postgres')
  assert(sql('SELECT current_database();') === database, 'Refusing to seed an unexpected database.')
  sql(readFileSync(join(root, 'tests/database/platform-fixture.sql'), 'utf8'))

  const directory = join(root, 'prisma/migrations')
  const migrations = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  for (const migration of migrations) {
    try { sql(readFileSync(join(directory, migration, 'migration.sql'), 'utf8')) }
    catch (error) { throw new Error(`Migration ${migration} failed: ${failureOutput(error)}`) }
  }
  process.stdout.write(`Replayed ${migrations.length} migrations in isolated ${database}.\n`)
  sql(readFileSync(join(root, 'tests/database/platform-seed.sql'), 'utf8'))
  sql(readFileSync(join(root, 'tests/database/platform-assertions.sql'), 'utf8'))
  sql(readFileSync(join(root, 'tests/database/safety-assertions.sql'), 'utf8'))
  sql(readFileSync(join(root, 'tests/database/hold-credit-assertions.sql'), 'utf8'))
  process.stdout.write('Safety appeal invariants and paid hold-credit allocation invariants passed.\n')
  process.stdout.write('RLS, private Realtime membership, committed uploads, receipt uniqueness and append-only balanced ledger passed.\n')

  expectFailure(`BEGIN; INSERT INTO public."LedgerTransaction" (id,payment_id,kind) VALUES ('unbalanced','ffffffff-ffff-4fff-8fff-ffffffffffff','test'); INSERT INTO public."LedgerEntry" (id,transaction_id,account_key,direction,amount_kobo) VALUES ('unbalanced-entry','unbalanced','test','debit',1); COMMIT;`, 'Ledger transaction must balance')
  assert(sql('SELECT count(*) FROM public."LedgerTransaction" WHERE id=\'unbalanced\';') === '0', 'Unbalanced ledger transaction escaped rollback.')
  expectFailure(`BEGIN; INSERT INTO public."LedgerTransaction" (id,payment_id,kind) VALUES ('empty-ledger','ffffffff-ffff-4fff-8fff-ffffffffffff','test'); COMMIT;`, 'Ledger transaction must balance')

  const races = await Promise.all([
    parallelSql(`BEGIN; ${reservationSql('race-a', 'confirmed')} SELECT pg_sleep(0.4); COMMIT;`),
    parallelSql(`BEGIN; ${reservationSql('race-b', 'confirmed')} SELECT pg_sleep(0.4); COMMIT;`),
  ])
  assert(races.filter(result => result.status === 0).length === 1, `Concurrent reservations should have exactly one winner: ${JSON.stringify(races)}`)
  assert(races.some(result => result.output.includes('Booking_no_overlapping_rentals')), 'The losing reservation must fail the availability constraint.')
  assert(sql('SELECT count(*) FROM public."Booking" WHERE id IN (\'race-a\',\'race-b\');') === '1', 'Double booking persisted.')
  sql(reservationSql('adjacent-rental', 'confirmed', '2030-02-03T12:00Z', '2030-02-04T12:00Z'))
  sql(reservationSql('overlapping-inspection', 'confirmed', '2030-02-01T12:00Z', '2030-02-03T12:00Z', 'inspection'))
  expectFailure(reservationSql('blocked-hold', 'awaiting_payment', '2030-02-01T12:00Z', '2030-02-03T12:00Z', 'hold'), 'Booking_no_overlapping_rentals')
  sql(reservationSql('expired-request', 'expired'))
  sql(`UPDATE public."Booking" SET status='disputed' WHERE id IN ('race-a','race-b');`)
  expectFailure(reservationSql('blocked-during-dispute', 'confirmed'), 'Booking_no_overlapping_rentals')
  process.stdout.write('Concurrent rental exclusion, adjacent rentals, inspection exemption and active hold exclusion passed.\n')

  const settle = (suffix: string): string => `BEGIN;
    SELECT id FROM public."Listing" WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' FOR UPDATE;
    SELECT id FROM public."Booking" WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' FOR UPDATE;
    SELECT id FROM public."PaymentIntent" WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff' FOR UPDATE;
    DO $$ BEGIN
      IF (SELECT status FROM public."PaymentIntent" WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff') <> 'succeeded' THEN
        INSERT INTO public."PaymentEvent" (id,payment_id,event_key,event_type,payload_hash) VALUES ('race-event-${suffix}','ffffffff-ffff-4fff-8fff-ffffffffffff','charge.success:race','charge.success','test-hash');
        UPDATE public."PaymentIntent" SET status='succeeded' WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff';
        INSERT INTO public."LedgerTransaction" (id,payment_id,kind) VALUES ('race-ledger-${suffix}','ffffffff-ffff-4fff-8fff-ffffffffffff','provider_collection');
        INSERT INTO public."LedgerEntry" (id,transaction_id,account_key,direction,amount_kobo) VALUES
          ('race-debit-${suffix}','race-ledger-${suffix}','provider:collections','debit',300000),
          ('race-credit-${suffix}','race-ledger-${suffix}','customer:unsettled','credit',300000);
      END IF;
    END $$; SELECT pg_sleep(0.2); COMMIT;`
  const settlements = await Promise.all([parallelSql(settle('a')), parallelSql(settle('b'))])
  assert(settlements.every(result => result.status === 0), `Concurrent receipt settlement failed: ${JSON.stringify(settlements)}`)
  assert(sql('SELECT count(*) FROM public."PaymentEvent" WHERE event_key=\'charge.success:race\';') === '1', 'Duplicate receipt persisted during concurrent settlement.')
  assert(sql('SELECT count(*) FROM public."LedgerTransaction" WHERE payment_id=\'ffffffff-ffff-4fff-8fff-ffffffffffff\';') === '1', 'Duplicate ledger persisted during concurrent settlement.')
  process.stdout.write('Concurrent duplicate settlements produced exactly one receipt and one balanced ledger transaction.\n')
  sql(`BEGIN;
    INSERT INTO public."Booking" (id,listing_id,seeker_id,lister_id,kind,status,starts_at,ends_at,expires_at,amount_kobo,"updatedAt") VALUES
      ('a727d7b3-2148-43e4-86df-a0717569fd01','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','hold','confirmed','2041-02-01T12:00Z','2041-02-03T12:00Z',now()+interval '1 day',2000000,now()),
      ('a727d7b3-2148-43e4-86df-a0717569fd02','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','rental','requested','2041-02-01T12:00Z','2041-02-03T12:00Z',null,10000000,now()),
      ('a727d7b3-2148-43e4-86df-a0717569fd03','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','rental','requested','2041-02-01T12:00Z','2041-02-03T12:00Z',null,10000000,now());
    INSERT INTO public."PaymentIntent" (id,booking_id,user_id,kind,reference,idempotency_key,amount_kobo,customer_email,status,paid_at,"updatedAt") VALUES
      ('credit-race-payment','a727d7b3-2148-43e4-86df-a0717569fd01','22222222-2222-4222-8222-222222222222','booking','synthetic-credit-race-reference','synthetic-credit-race-key',2000000,'seeker@rentral.example.test','succeeded',now(),now());
    INSERT INTO public."LedgerTransaction" (id,payment_id,kind) VALUES ('credit-race-ledger','credit-race-payment','provider_collection');
    INSERT INTO public."LedgerEntry" (id,transaction_id,account_key,direction,amount_kobo) VALUES
      ('credit-race-debit','credit-race-ledger','provider:collections','debit',2000000),('credit-race-credit','credit-race-ledger','customer:unsettled','credit',2000000);
    COMMIT;`)
  const creditRace = (suffix: string, target: string): string => `BEGIN;
    SELECT id FROM public."Listing" WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' FOR UPDATE;
    DO $$ BEGIN
      IF (SELECT status FROM public."Booking" WHERE id='a727d7b3-2148-43e4-86df-a0717569fd01') <> 'confirmed' THEN
        RAISE EXCEPTION 'Hold already allocated' USING ERRCODE='23514';
      END IF;
      UPDATE public."Booking" SET status='converted' WHERE id='a727d7b3-2148-43e4-86df-a0717569fd01';
      INSERT INTO public."HoldCreditAllocation" (id,hold_booking_id,rental_booking_id,amount_kobo) VALUES ('credit-race-${suffix}','a727d7b3-2148-43e4-86df-a0717569fd01','${target}',2000000);
      UPDATE public."Booking" SET status='awaiting_payment',hold_credit_kobo=2000000,expires_at=now()+interval '30 minutes',pricing_snapshot='{"period":"day","days":2,"baseKobo":"10000000","fees":[],"totalKobo":"10000000","holdBookingId":"a727d7b3-2148-43e4-86df-a0717569fd01","holdCreditKobo":"2000000","payableKobo":"8000000"}' WHERE id='${target}';
    END $$; SELECT pg_sleep(0.2); COMMIT;`
  const creditRaces = await Promise.all([
    parallelSql(creditRace('a', 'a727d7b3-2148-43e4-86df-a0717569fd02')),
    parallelSql(creditRace('b', 'a727d7b3-2148-43e4-86df-a0717569fd03')),
  ])
  assert(creditRaces.filter(result => result.status === 0).length === 1, `Holding credit should have exactly one concurrent winner: ${JSON.stringify(creditRaces)}`)
  assert(creditRaces.some(result => result.output.includes('Hold already allocated')), 'The losing conversion must observe the consumed hold.')
  assert(sql(`SELECT count(*) FROM public."HoldCreditAllocation" WHERE hold_booking_id='a727d7b3-2148-43e4-86df-a0717569fd01';`) === '1', 'Concurrent hold credit was allocated twice.')
  assert(sql(`SELECT amount_kobo-hold_credit_kobo FROM public."Booking" WHERE id IN ('a727d7b3-2148-43e4-86df-a0717569fd02','a727d7b3-2148-43e4-86df-a0717569fd03') AND status='awaiting_payment';`) === '8000000', 'The rental balance must equal gross minus the one holding credit.')
  process.stdout.write('Concurrent hold conversions produced exactly one immutable allocation and the exact remaining rental balance.\n')
  process.stdout.write('All isolated database checks passed. This does not prove hosted Supabase/provider acceptance.\n')
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Database verification failed.'}\n`)
  process.exitCode = 1
})
