import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({ stored: new Map<string, string>(), fetch: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn() }))
vi.mock('../apps/mobile/src/lib/config', () => ({ config: { apiUrl: 'http://127.0.0.1:3000' }, configurationError: null }))
vi.mock('../apps/mobile/src/lib/session-storage', () => ({ sessionStorage: {
  getItem: fixtures.get,
  setItem: fixtures.set,
  removeItem: fixtures.remove,
} }))
const key = 'rentral.jwt.session'
function session(expired = false) {
  return { access_token: 'fixture-access', refresh_token: 'a'.repeat(43), token_type: 'bearer', expires_in: 900,
    expires_at: Math.floor(Date.now() / 1000) + (expired ? -1 : 900),
    user: { id: 'fixture-user', email: 'member@example.test', app_metadata: {}, user_metadata: {}, is_anonymous: false } }
}
function response(value: unknown, status = 200): Response { return Response.json({ success: status < 400, ...(status < 400 ? { data: value } : { error: value }) }, { status }) }
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetModules(); fixtures.stored.clear(); fixtures.fetch.mockReset(); vi.stubGlobal('fetch', fixtures.fetch)
  fixtures.get.mockReset().mockImplementation(async (item: string) => fixtures.stored.get(item) ?? null)
  fixtures.set.mockReset().mockImplementation(async (item: string, value: string) => { fixtures.stored.set(item, value) })
  fixtures.remove.mockReset().mockImplementation(async (item: string) => { fixtures.stored.delete(item) })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('coalesces parallel expiry refreshes and persists the rotated token once', async () => {
  fixtures.stored.set(key, JSON.stringify(session(true)))
  const updated = { ...session(), refresh_token: 'b'.repeat(43) }
  fixtures.fetch.mockResolvedValue(response(updated))
  const auth = await import('../apps/mobile/src/lib/auth')
  const values = await Promise.all(Array.from({ length: 8 }, () => auth.getSession()))
  expect(fixtures.fetch).toHaveBeenCalledTimes(1)
  expect(values.every(value => value?.refresh_token === updated.refresh_token)).toBe(true)
  expect(JSON.parse(fixtures.stored.get(key)!)).toEqual(updated)
})
it('does not restore an in-flight refresh after the user signs out', async () => {
  fixtures.stored.set(key, JSON.stringify(session(true)))
  let finish: (value: Response) => void = () => { throw new Error('Refresh not started') }
  fixtures.fetch.mockImplementation((url: string) => url.endsWith('/refresh') ? new Promise<Response>(resolve => { finish = resolve }) : Promise.resolve(response({ signedOut: true })))
  const auth = await import('../apps/mobile/src/lib/auth')
  const pending = auth.getSession()
  await vi.waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(1))
  await auth.signOut()
  finish(response({ ...session(), refresh_token: 'c'.repeat(43) }))
  expect(await pending).toBeNull()
  expect(fixtures.stored.has(key)).toBe(false)
  expect(await auth.getSession()).toBeNull()
})
it('clears a rejected session but preserves a session during a temporary network outage', async () => {
  fixtures.stored.set(key, JSON.stringify(session(true)))
  fixtures.fetch.mockResolvedValue(response('Please sign in again.', 401))
  let auth = await import('../apps/mobile/src/lib/auth')
  await expect(auth.getSession()).rejects.toThrow('sign in')
  expect(fixtures.stored.has(key)).toBe(false)
  vi.resetModules(); fixtures.stored.set(key, JSON.stringify(session(true)))
  fixtures.fetch.mockRejectedValue(new Error('Offline'))
  auth = await import('../apps/mobile/src/lib/auth')
  await expect(auth.getSession()).rejects.toThrow('Could not reach')
  expect(fixtures.stored.has(key)).toBe(true)
})
it('treats malformed persisted state as signed out without contacting a server', async () => {
  fixtures.stored.set(key, 'not-json')
  const auth = await import('../apps/mobile/src/lib/auth')
  expect(await auth.getSession()).toBeNull()
  expect(fixtures.stored.has(key)).toBe(false)
  expect(fixtures.fetch).not.toHaveBeenCalled()
})

it('times out registration once and identifies the validated backend origin without replaying it', async () => {
  const auth = await import('../apps/mobile/src/lib/auth')
  vi.useFakeTimers()
  fixtures.fetch.mockImplementation((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  const request = auth.authRequest('/register', { email: 'member@example.test', password: 'fixture-password' })
  const failed = expect(request).rejects.toThrow('Rentral took too long to respond at http://127.0.0.1:3000.')
  await vi.advanceTimersByTimeAsync(19999)
  expect(fixtures.fetch).toHaveBeenCalledTimes(1)
  expect((fixtures.fetch.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await failed
  expect(fixtures.fetch).toHaveBeenCalledTimes(1)
  expect(fixtures.stored.has(key)).toBe(false)
})

it('identifies the backend on network failure without exposing credentials or queries', async () => {
  const auth = await import('../apps/mobile/src/lib/auth')
  const { config } = await import('../apps/mobile/src/lib/config')
  fixtures.fetch.mockRejectedValue(new TypeError('Connection refused'))
  await expect(auth.authRequest('/register', {})).rejects.toThrow('Could not reach Rentral at http://127.0.0.1:3000.')
  config.apiUrl = 'https://user:secret@example.test?token=private'
  try {
    await expect(auth.authRequest('/register', {})).rejects.toThrow('Could not reach Rentral. Check the backend address and your connection.')
  } finally { config.apiUrl = 'http://127.0.0.1:3000' }
  expect(fixtures.fetch).toHaveBeenCalledTimes(2)
})

it('serializes an in-flight refresh keychain write before logout and never publishes its late result', async () => {
  const original = session(true)
  fixtures.stored.set(key, JSON.stringify(original))
  const updated = { ...session(), access_token: 'rotated-access', refresh_token: 'b'.repeat(43) }
  fixtures.fetch.mockImplementation((url: string) => Promise.resolve(response(url.endsWith('/refresh') ? updated : { signedOut: true })))
  const writing = deferred<void>()
  fixtures.set.mockImplementationOnce(async (item: string, value: string) => { await writing.promise; fixtures.stored.set(item, value) })
  const auth = await import('../apps/mobile/src/lib/auth')
  const listener = vi.fn()
  auth.subscribeAuth(listener)
  const pending = auth.getSession()
  await vi.waitFor(() => expect(fixtures.set).toHaveBeenCalledTimes(1))
  const logout = auth.signOut()
  expect(fixtures.remove).not.toHaveBeenCalled()
  writing.resolve()
  await logout
  expect(await pending).toBeNull()
  expect(fixtures.stored.has(key)).toBe(false)
  expect(listener.mock.calls.some(([value]) => value?.access_token === updated.access_token)).toBe(false)
})

it('does not persist or publish a sign-in that was superseded while SecureStore was writing', async () => {
  fixtures.fetch.mockResolvedValue(response(session()))
  const writing = deferred<void>()
  fixtures.set.mockImplementationOnce(async (item: string, value: string) => { await writing.promise; fixtures.stored.set(item, value) })
  const auth = await import('../apps/mobile/src/lib/auth')
  const listener = vi.fn()
  auth.subscribeAuth(listener)
  const login = auth.signIn('member@example.test', 'password')
  await vi.waitFor(() => expect(fixtures.set).toHaveBeenCalledTimes(1))
  const logout = auth.signOut()
  writing.resolve()
  await Promise.all([login, logout])
  expect(await auth.getSession()).toBeNull()
  expect(fixtures.stored.has(key)).toBe(false)
  expect(listener.mock.calls.every(([value]) => value === null)).toBe(true)
})

it('does not allow a delayed restore to replace a newly signed-in account', async () => {
  const oldSession = JSON.stringify(session())
  fixtures.stored.set(key, oldSession)
  const reading = deferred<string | null>()
  fixtures.get.mockImplementationOnce(() => reading.promise)
  const newest = { ...session(), access_token: 'new-account-access', user: { ...session().user, id: 'new-account' } }
  fixtures.fetch.mockResolvedValue(response(newest))
  const auth = await import('../apps/mobile/src/lib/auth')
  const pending = auth.getSession()
  await vi.waitFor(() => expect(fixtures.get).toHaveBeenCalledTimes(1))
  const login = auth.signIn('new@example.test', 'password')
  await vi.waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(1))
  await Promise.resolve()
  reading.resolve(oldSession)
  await login
  expect(await pending).toEqual(newest)
  expect(JSON.parse(fixtures.stored.get(key)!)).toEqual(newest)
})

it('does not allow a delayed restore to resurrect a signed-out account', async () => {
  const oldSession = JSON.stringify(session())
  fixtures.stored.set(key, oldSession)
  const reading = deferred<string | null>()
  fixtures.get.mockImplementationOnce(() => reading.promise)
  const auth = await import('../apps/mobile/src/lib/auth')
  const pending = auth.getSession()
  await vi.waitFor(() => expect(fixtures.get).toHaveBeenCalledTimes(1))
  const logout = auth.signOut()
  reading.resolve(oldSession)
  await logout
  expect(await pending).toBeNull()
  expect(fixtures.stored.has(key)).toBe(false)
})

it('waits for a newer account commit before returning a superseded refresh', async () => {
  fixtures.stored.set(key, JSON.stringify(session(true)))
  const newest = { ...session(), access_token: 'new-account-access', user: { ...session().user, id: 'new-account' } }
  const refreshed = { ...session(), access_token: 'old-account-rotated', refresh_token: 'c'.repeat(43) }
  fixtures.fetch.mockImplementation((url: string) => Promise.resolve(response(url.endsWith('/refresh') ? refreshed : newest)))
  const writing = deferred<void>()
  fixtures.set.mockImplementationOnce(async (item: string, value: string) => { await writing.promise; fixtures.stored.set(item, value) })
  const auth = await import('../apps/mobile/src/lib/auth')
  const pending = auth.getSession()
  await vi.waitFor(() => expect(fixtures.set).toHaveBeenCalledTimes(1))
  const login = auth.signIn('new@example.test', 'password')
  await vi.waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(2))
  await Promise.resolve()
  writing.resolve()
  await login
  expect(await pending).toEqual(newest)
  expect(await auth.getSession()).toEqual(newest)
  expect(JSON.parse(fixtures.stored.get(key)!)).toEqual(newest)
})

it('does not clear a newer account when an old refresh is rejected', async () => {
  fixtures.stored.set(key, JSON.stringify(session(true)))
  const refresh = deferred<Response>()
  const newest = { ...session(), access_token: 'new-account-access', user: { ...session().user, id: 'new-account' } }
  fixtures.fetch.mockImplementation((url: string) => url.endsWith('/refresh') ? refresh.promise : Promise.resolve(response(newest)))
  const auth = await import('../apps/mobile/src/lib/auth')
  const pending = auth.getSession()
  await vi.waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(1))
  await auth.signIn('new@example.test', 'password')
  refresh.resolve(response('Please sign in again.', 401))
  expect(await pending).toEqual(newest)
  expect(await auth.getSession()).toEqual(newest)
})

it('keeps the newest sign-in intent when login responses arrive out of order', async () => {
  const first = deferred<Response>()
  const newest = { ...session(), access_token: 'newest-account-access', user: { ...session().user, id: 'newest-account' } }
  fixtures.fetch.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(newest))
  const auth = await import('../apps/mobile/src/lib/auth')
  const oldLogin = auth.signIn('old@example.test', 'password')
  await auth.signIn('new@example.test', 'password')
  first.resolve(response(session()))
  await oldLogin
  expect(await auth.getSession()).toEqual(newest)
})

it('preserves a successful refresh when a separate sign-in attempt fails', async () => {
  fixtures.stored.set(key, JSON.stringify(session(true)))
  const refresh = deferred<Response>()
  const updated = { ...session(), access_token: 'rotated-access', refresh_token: 'b'.repeat(43) }
  fixtures.fetch.mockImplementation((url: string) => url.endsWith('/refresh') ? refresh.promise : Promise.resolve(response('Incorrect password.', 401)))
  const auth = await import('../apps/mobile/src/lib/auth')
  const pending = auth.getSession()
  await vi.waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(1))
  await expect(auth.signIn('other@example.test', 'wrong')).rejects.toThrow('Incorrect password')
  refresh.resolve(response(updated))
  expect(await pending).toEqual(updated)
  expect(JSON.parse(fixtures.stored.get(key)!)).toEqual(updated)
})

it('does not report logout success when keychain deletion fails and still attempts backend revocation', async () => {
  const original = session()
  fixtures.stored.set(key, JSON.stringify(original))
  fixtures.fetch.mockResolvedValue(response({ signedOut: true }))
  const auth = await import('../apps/mobile/src/lib/auth')
  await auth.getSession()
  fixtures.remove.mockRejectedValueOnce(new Error('Secure storage unavailable'))
  await expect(auth.signOut()).rejects.toThrow('Secure storage unavailable')
  expect(fixtures.stored.has(key)).toBe(true)
  expect(await auth.getSession()).toEqual(original)
  expect(fixtures.fetch).toHaveBeenCalledWith(expect.stringContaining('/logout'), expect.objectContaining({ method: 'POST' }))
})
it('does not erase a newer account while the captured-account pre-logout cleanup is awaiting', async () => {
  fixtures.stored.set(key, JSON.stringify(session()))
  const auth = await import('../apps/mobile/src/lib/auth'), effects = await import('../apps/mobile/src/lib/sign-out-effects')
  await auth.getSession()
  const cleanup = deferred<void>(), started = vi.fn()
  const remove = effects.beforeSignOut(async captured => { started(captured.user.id); await cleanup.promise })
  const logout = auth.signOut()
  await vi.waitFor(() => expect(started).toHaveBeenCalledWith('fixture-user'))
  const newer = { ...session(), access_token: 'new-account-access', user: { ...session().user, id: 'new-account', email: 'new@example.test' } }
  fixtures.fetch.mockImplementation(async (url: string) => response(url.endsWith('/login') ? newer : { signedOut: true }))
  await auth.signIn('new@example.test', 'fixture-password')
  cleanup.resolve(); await logout; remove()
  expect(await auth.getSession()).toEqual(newer)
  expect(JSON.parse(fixtures.stored.get(key)!)).toEqual(newer)
  expect(fixtures.fetch).toHaveBeenCalledWith(expect.stringContaining('/logout'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fixture-access' }) }))
})
it('clears local credentials even if optional pre-logout device cleanup rejects', async () => {
  fixtures.stored.set(key, JSON.stringify(session())); fixtures.fetch.mockResolvedValue(response({ signedOut: true }))
  const auth = await import('../apps/mobile/src/lib/auth'), effects = await import('../apps/mobile/src/lib/sign-out-effects')
  await auth.getSession(); const remove = effects.beforeSignOut(async () => { throw new Error('Push revocation could not be confirmed') })
  await auth.signOut(); remove()
  expect(await auth.getSession()).toBeNull(); expect(fixtures.stored.has(key)).toBe(false)
})
it('bounds a stalled optional device cleanup before clearing local JWT credentials', async () => {
  vi.useFakeTimers(); fixtures.stored.set(key, JSON.stringify(session())); fixtures.fetch.mockResolvedValue(response({ signedOut: true }))
  const auth = await import('../apps/mobile/src/lib/auth'), effects = await import('../apps/mobile/src/lib/sign-out-effects')
  await auth.getSession(); const remove = effects.beforeSignOut(() => new Promise(() => undefined))
  const logout = auth.signOut()
  await vi.advanceTimersByTimeAsync(5000); await logout; remove()
  expect(fixtures.stored.has(key)).toBe(false); expect(await auth.getSession()).toBeNull()
})

it('invalidates only the matching access-token session and not a newer sign-in', async () => {
  fixtures.stored.set(key, JSON.stringify(session()))
  const auth = await import('../apps/mobile/src/lib/auth')
  await auth.getSession()
  const newest = { ...session(), access_token: 'newest-access' }
  fixtures.fetch.mockResolvedValue(response(newest))
  await auth.signIn('member@example.test', 'password')
  await auth.invalidateSession('fixture-access')
  expect(await auth.getSession()).toEqual(newest)
  await auth.invalidateSession(newest.access_token)
  expect(await auth.getSession()).toBeNull()
  expect(fixtures.stored.has(key)).toBe(false)
})

it('ignores an old request401 while a new account is still committing to SecureStore', async () => {
  fixtures.stored.set(key, JSON.stringify(session()))
  const auth = await import('../apps/mobile/src/lib/auth')
  await auth.getSession()
  const newest = { ...session(), access_token: 'newest-access' }
  fixtures.fetch.mockResolvedValue(response(newest))
  const writing = deferred<void>()
  fixtures.set.mockImplementationOnce(async (item: string, value: string) => { await writing.promise; fixtures.stored.set(item, value) })
  const login = auth.signIn('member@example.test', 'password')
  await vi.waitFor(() => expect(fixtures.set).toHaveBeenCalledTimes(1))
  await auth.invalidateSession('fixture-access')
  writing.resolve()
  await login
  expect(await auth.getSession()).toEqual(newest)
  expect(JSON.parse(fixtures.stored.get(key)!)).toEqual(newest)
})

it('reflects the last durable session if a newer commit fails after superseding an in-flight write', async () => {
  const first = { ...session(), access_token: 'first-access' }
  const second = { ...session(), access_token: 'second-access' }
  fixtures.fetch.mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second))
  const writing = deferred<void>()
  fixtures.set.mockImplementationOnce(async (item: string, value: string) => { await writing.promise; fixtures.stored.set(item, value) })
    .mockRejectedValueOnce(new Error('SecureStore unavailable'))
  const auth = await import('../apps/mobile/src/lib/auth')
  const firstLogin = auth.signIn('first@example.test', 'password')
  await vi.waitFor(() => expect(fixtures.set).toHaveBeenCalledTimes(1))
  const secondLogin = auth.signIn('second@example.test', 'password')
  const failed = expect(secondLogin).rejects.toThrow('SecureStore unavailable')
  await vi.waitFor(() => expect(fixtures.fetch).toHaveBeenCalledTimes(2))
  await Promise.resolve()
  writing.resolve()
  await Promise.all([firstLogin, failed])
  expect(await auth.getSession()).toEqual(first)
  expect(JSON.parse(fixtures.stored.get(key)!)).toEqual(first)
})

it('gives a remounted auth subscription the current committed snapshot immediately', async () => {
  fixtures.stored.set(key, JSON.stringify(session()))
  const auth = await import('../apps/mobile/src/lib/auth')
  await auth.getSession()
  const first = vi.fn()
  const unsubscribe = auth.subscribeAuth(first)
  expect(first).toHaveBeenCalledExactlyOnceWith(session())
  unsubscribe()
  fixtures.fetch.mockResolvedValue(response({ signedOut: true }))
  await auth.signOut()
  expect(first).toHaveBeenCalledTimes(1)
  const remounted = vi.fn()
  auth.subscribeAuth(remounted)
  expect(remounted).toHaveBeenCalledExactlyOnceWith(null)
})

it.each([
  { access_token: '' }, { refresh_token: 'invalid' }, { token_type: 'invalid' }, { expires_at: Number.NaN }, { user: { id: 'x', email: 'member@example.test' } },
])('rejects malformed persisted session fields %#', async fields => {
  fixtures.stored.set(key, JSON.stringify({ ...session(), ...fields }))
  const auth = await import('../apps/mobile/src/lib/auth')
  expect(await auth.getSession()).toBeNull()
  expect(fixtures.stored.has(key)).toBe(false)
  expect(fixtures.fetch).not.toHaveBeenCalled()
})
