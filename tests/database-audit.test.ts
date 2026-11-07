import { describe, expect, it } from 'vitest'
import { localMigration, migrationChecks, type AppliedMigration, type LocalMigration } from '../scripts/audit-local-database'

const first: LocalMigration = { name: '20260101000000_initial', checksum: 'first-checksum' }
const second: LocalMigration = { name: '20260102000000_additive', checksum: 'second-checksum' }
const applied = (migration: LocalMigration): AppliedMigration => ({ ...migration, completed: true, rolled_back: false })

describe('read-only migration audit gates', () => {
  it('accepts a matching history and lists later additive migrations as pending', () => {
    const checks = migrationChecks([first, second], [applied(first)], 1)
    expect(checks.some(check => check.status === 'FAIL')).toBe(false)
    expect(checks.find(check => check.name === 'Pending source migrations')).toEqual({
      name: 'Pending source migrations', status: 'PENDING', detail: second.name,
    })
  })
  it('distinguishes a fresh database from an application schema without migration history', () => {
    expect(migrationChecks([first], [], 0).find(check => check.name === 'Migration history')?.status).toBe('PASS')
    expect(migrationChecks([first], [], 1).find(check => check.name === 'Migration history')?.status).toBe('FAIL')
  })
  it('blocks changed applied SQL without printing the checksum', () => {
    const checks = migrationChecks([first], [{ ...applied(first), checksum: 'unexpected-sensitive-value' }], 1)
    expect(checks.find(check => check.name === 'Modified applied migrations')?.status).toBe('FAIL')
    expect(JSON.stringify(checks)).not.toContain('unexpected-sensitive-value')
  })
  it('accepts Prisma-compatible LF/CRLF checkout conversions while detecting SQL changes', () => {
    const unix = localMigration(first.name, 'SELECT 1;\nSELECT 2;\n')
    const windows = localMigration(first.name, 'SELECT 1;\r\nSELECT 2;\r\n')
    expect(migrationChecks([windows], [applied(unix)], 1).some(check => check.status === 'FAIL')).toBe(false)
    expect(migrationChecks([unix], [applied(windows)], 1).some(check => check.status === 'FAIL')).toBe(false)
    expect(migrationChecks([localMigration(first.name, 'SELECT 2;\n')], [applied(unix)], 1)
      .find(check => check.name === 'Modified applied migrations')?.status).toBe('FAIL')
  })
  it('blocks unfinished migrations instead of proposing a repair or reset', () => {
    const checks = migrationChecks([first], [{ ...applied(first), completed: false }], 1)
    expect(checks.find(check => check.name === 'Unfinished migrations')?.status).toBe('FAIL')
  })
  it('does not confuse an explicitly rolled-back attempt with an unresolved failure', () => {
    const checks = migrationChecks([first], [{ ...applied(first), completed: false, rolled_back: true }, applied(first)], 1)
    expect(checks.some(check => check.status === 'FAIL')).toBe(false)
  })
  it('blocks database migrations absent from the checked-in source', () => {
    const checks = migrationChecks([first], [applied(first), applied(second)], 1)
    expect(checks.find(check => check.name === 'Unknown completed migrations')?.status).toBe('FAIL')
  })
  it('blocks missing earlier migrations even when a later migration is recorded', () => {
    const checks = migrationChecks([first, second], [applied(second)], 1)
    expect(checks.find(check => check.name === 'Migration history gaps')).toEqual({
      name: 'Migration history gaps', status: 'FAIL', detail: first.name,
    })
  })
  it('blocks duplicate completed history rows', () => {
    expect(migrationChecks([first], [applied(first), applied(first)], 1)
      .find(check => check.name === 'Duplicate completed migrations')?.status).toBe('FAIL')
  })
  it('never prints untrusted control characters from migration metadata', () => {
    const checks = migrationChecks([], [{ name: 'unsafe\nmetadata', checksum: 'hidden', completed: true, rolled_back: false }], 0)
    expect(checks.find(check => check.name === 'Unknown completed migrations')?.detail).toBe('[unrecognized metadata name]')
    expect(JSON.stringify(checks)).not.toContain('unsafe')
  })
})
