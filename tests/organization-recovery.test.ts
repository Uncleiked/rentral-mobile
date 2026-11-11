import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearOrganizationPending, readOrganizationPending, saveOrganizationPending } from '@/lib/organizations/recovery'
const actorId = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', clientId = '33333333-3333-4333-8333-333333333333'
const command = { clientId, targetId: other, expectedRevision: 0, decision: 'request_changes' as const, reason: 'Please provide the current official registration certificate.',
  checklist: { registrationMatches: false, registerChecked: false, authorityConfirmed: false } }
const storage = new Map<string, string>()
beforeEach(() => { storage.clear(); vi.stubGlobal('window', { sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } }) })
afterEach(() => vi.unstubAllGlobals())
it('retains the exact actor, original identifier and review instruction across browser recovery', () => {
  const input = { actorId, scope: 'review' as const, command }
  expect(saveOrganizationPending(input)).toEqual(input)
  expect(readOrganizationPending(actorId, 'review')).toEqual(input)
  expect(readOrganizationPending(other, 'review')).toBeNull()
})
it('does not overwrite an uncertain original instruction with a new or changed decision', () => {
  saveOrganizationPending({ actorId, scope: 'review', command })
  expect(() => saveOrganizationPending({ actorId, scope: 'review', command: { ...command, decision: 'reject' } })).toThrow('original organization instruction')
  expect(readOrganizationPending(actorId, 'review')?.command).toEqual(command)
})
it('clears only a matching original receipt identifier', () => {
  saveOrganizationPending({ actorId, scope: 'review', command })
  expect(() => clearOrganizationPending(actorId, 'review', other)).toThrow('original organization instruction changed')
  expect(storage.size).toBe(1)
  clearOrganizationPending(actorId, 'review', clientId)
  expect(storage.size).toBe(0)
})
it('fails closed on corrupted or cross-account recovery instead of silently dropping it', () => {
  saveOrganizationPending({ actorId, scope: 'review', command })
  const key = [...storage.keys()][0]
  storage.set(key, '{invalid')
  expect(() => readOrganizationPending(actorId, 'review')).toThrow()
  storage.set(key, JSON.stringify({ actorId: other, scope: 'review', command }))
  expect(() => readOrganizationPending(actorId, 'review')).toThrow('another account')
})
