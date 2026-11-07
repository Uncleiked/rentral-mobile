import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, sep, basename } from 'node:path'
import { spawnSync } from 'node:child_process'

const directories: string[] = []
const script = resolve('scripts/with-staging.ts')
function workspace(): string { const dir = mkdtempSync(join(tmpdir(), 'rentral-staging-test-')); directories.push(dir); return dir }
function run(cwd: string) { return spawnSync(process.execPath, ['--experimental-strip-types', script, 'prisma', 'migrate', 'status'], { cwd, encoding: 'utf8', env: { ...process.env, RENTRAL_PLATFORM_ENABLED: 'false' } }) }
const staging = `NEXT_PUBLIC_SUPABASE_URL=https://stagingref.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-publishable\nSUPABASE_SERVICE_ROLE_KEY=synthetic-private\nDATABASE_URL=postgresql://postgres.stagingref:synthetic-password@pooler.supabase.com:6543/postgres\nDIRECT_URL=postgresql://postgres.stagingref:synthetic-password@pooler.supabase.com:5432/postgres\nNEXT_PUBLIC_APP_URL=https://staging.rentral.test\n`

describe('staging launcher target protection', () => {
  afterEach(() => { for (const dir of directories.splice(0)) {
    if (!resolve(dir).startsWith(`${resolve(tmpdir())}${sep}`) || !basename(dir).startsWith('rentral-staging-test-')) throw new Error('Unsafe temporary cleanup target.')
    rmSync(dir, { recursive: true, force: true })
  } })
  it('refuses to start without a dedicated staging file', () => {
    const result = run(workspace()); expect(result.status).toBe(1); expect(result.stderr).toContain('Create .env.staging')
  })
  it('rejects a staging URL pointing at the local project', () => {
    const dir = workspace(); writeFileSync(join(dir, '.env.staging'), staging); writeFileSync(join(dir, '.env.local'), 'NEXT_PUBLIC_SUPABASE_URL=https://stagingref.supabase.co')
    const result = run(dir); expect(result.status).toBe(1); expect(result.stderr).toContain('different Supabase project'); expect(result.stderr).not.toContain('synthetic-password')
  })
  it('rejects a database connection pointing to a different project', () => {
    const dir = workspace(); writeFileSync(join(dir, '.env.staging'), staging.replace('postgres.stagingref:synthetic-password@pooler.supabase.com:5432', 'postgres.productionref:synthetic-password@pooler.supabase.com:5432'))
    const result = run(dir); expect(result.status).toBe(1); expect(result.stderr).toContain('does not match'); expect(result.stderr).not.toContain('synthetic-password')
  })
})
