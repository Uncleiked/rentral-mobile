import { expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../apps/mobile/src/lib/api', () => ({ api: fixture.request, ApiError: class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) { super(message) }
} }))
import { z } from 'zod'
import { createMemberResourceScope, currentMemberResult, type ScopedMemberResult } from '../apps/mobile/src/lib/member-resource-scope'
import { memberGet } from '../apps/mobile/src/lib/member-api'

it('suppresses the old account cached data immediately, before the next-account effect or request completes', () => {
  const snapshot = { actorId: 'account-a', path: '/dashboard', data: { privateCount: 9 }, error: null }
  expect(currentMemberResult(snapshot, 'account-a', '/dashboard')?.data).toEqual({ privateCount: 9 })
  expect(currentMemberResult(snapshot, 'account-b', '/dashboard')).toBeNull()
  expect(currentMemberResult(snapshot, 'account-a', '/financial')).toBeNull()
})
it('does not publish a delayed account-A response after account B activates the same path', async () => {
  const scope = createMemberResourceScope(), first = scope.activate('account-a', '/me')
  let complete: (value: { privateValue: string }) => void = () => undefined
  const request = new Promise<{ privateValue: string }>(resolve => { complete = resolve })
  let result: ScopedMemberResult<{ privateValue: string }> | null = null
  const pending = request.then(data => { if (scope.accepts(first)) result = { actorId: 'account-a', path: '/me', data, error: null } })
  const second = scope.activate('account-b', '/me')
  complete({ privateValue: 'account-a-private' }); await pending
  expect(result).toBeNull()
  expect(scope.accepts(second)).toBe(true)
  expect(scope.capture('account-a', '/me')).toBeNull()
})
it('rejects a stale account callback without releasing or changing the new-account focus lease', () => {
  const scope = createMemberResourceScope(), first = scope.activate('account-a', '/me'), second = scope.activate('account-b', '/me')
  scope.release(first)
  expect(scope.capture('account-a', '/me')).toBeNull()
  expect(scope.capture('account-b', '/me')).toBe(second)
  expect(scope.accepts(first)).toBe(false)
  scope.release(second)
  expect(scope.capture('account-b', '/me')).toBeNull()
})
it('rejects stale responses even when the same account and path are reopened after blur', () => {
  const scope = createMemberResourceScope(), first = scope.activate('account-a', '/me')
  scope.release(first); const reopened = scope.activate('account-a', '/me')
  expect(scope.accepts(first)).toBe(false)
  expect(scope.accepts(reopened)).toBe(true)
})
it('binds shared member reads to the captured account all the way through the API boundary', async () => {
  fixture.request.mockResolvedValue({ privateValue: 'account-a-private' })
  const controller = new AbortController()
  expect(await memberGet('/me', z.object({ privateValue: z.string() }), controller.signal, 'account-a')).toEqual({ privateValue: 'account-a-private' })
  expect(fixture.request).toHaveBeenCalledExactlyOnceWith('/me', { signal: controller.signal, expectedUserId: 'account-a' })
})
