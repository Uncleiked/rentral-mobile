import { expect, it, vi } from 'vitest'
import { observeAuth } from '../apps/mobile/src/lib/auth-observer'
import type { AuthSession } from '../apps/mobile/src/lib/auth-types'

const account: AuthSession = {
  access_token: 'fixture-access', refresh_token: 'a'.repeat(43), expires_at: 9999999999, expires_in: 900, token_type: 'bearer',
  user: { id: 'fixture-user', email: 'member@example.test', app_metadata: {}, user_metadata: {}, is_anonymous: false },
}
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail })
  return { promise, resolve, reject }
}
function setup(pending: Promise<AuthSession | null>) {
  let notify!: (session: AuthSession | null) => void
  const unsubscribe = vi.fn()
  const getSession = vi.fn(() => pending)
  const onSession = vi.fn()
  const onError = vi.fn()
  const observer = observeAuth({ subscribe: listener => { notify = listener; return unsubscribe }, getSession }, onSession, onError)
  return { observer, notify, unsubscribe, getSession, onSession, onError }
}

it('applies committed notifications and never overwrites logout with an older async refresh result', async () => {
  const pending = deferred<AuthSession | null>()
  const fixture = setup(pending.promise)
  fixture.notify(account)
  const refresh = fixture.observer.refresh()
  fixture.notify(null)
  pending.resolve(account)
  await refresh
  expect(fixture.onSession.mock.calls).toEqual([[account], [null]])
  expect(fixture.onError).not.toHaveBeenCalled()
})

it('does not apply an old refresh error after a newer account notification', async () => {
  const pending = deferred<AuthSession | null>()
  const fixture = setup(pending.promise)
  const refresh = fixture.observer.refresh()
  fixture.notify(account)
  pending.reject(new Error('Old session rejected'))
  await refresh
  expect(fixture.onSession).toHaveBeenCalledExactlyOnceWith(account)
  expect(fixture.onError).not.toHaveBeenCalled()
})

it('reports a current restore failure so the initial loading screen can finish honestly', async () => {
  const failure = new Error('Secure storage unavailable')
  const fixture = setup(Promise.reject(failure))
  await fixture.observer.refresh()
  expect(fixture.onError).toHaveBeenCalledExactlyOnceWith(failure)
  expect(fixture.onSession).not.toHaveBeenCalled()
})

it('removes its subscription and ignores late results and errors after disposal', async () => {
  const pending = deferred<AuthSession | null>()
  const fixture = setup(pending.promise)
  const refresh = fixture.observer.refresh()
  fixture.observer.dispose()
  fixture.notify(account)
  pending.reject(new Error('Unmounted refresh'))
  await refresh
  await fixture.observer.refresh()
  expect(fixture.unsubscribe).toHaveBeenCalledTimes(1)
  expect(fixture.onSession).not.toHaveBeenCalled()
  expect(fixture.onError).not.toHaveBeenCalled()
  expect(fixture.getSession).toHaveBeenCalledTimes(1)
})

it('accepts an immediate committed snapshot when an existing provider remounts', () => {
  const onSession = vi.fn()
  const observer = observeAuth({ subscribe: listener => { listener(account); return () => undefined }, getSession: async () => account }, onSession, vi.fn())
  expect(onSession).toHaveBeenCalledExactlyOnceWith(account)
  observer.dispose()
})
