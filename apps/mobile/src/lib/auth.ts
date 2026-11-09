import { config, configurationError } from './config'
import { sessionStorage } from './session-storage'
import type { AuthSession } from './auth-types'
import { validatedApiOrigin } from './api-config'
import { runBeforeSignOut } from './sign-out-effects'

const SESSION_KEY = 'rentral.jwt.session'
const listeners = new Set<(session: AuthSession | null) => void>()
let current: AuthSession | null = null
let restored = false
let restoring: Promise<AuthSession | null> | null = null
let refreshing: { generation: number; token: string; promise: Promise<AuthSession | null> } | null = null
let generation = 0
let publishedGeneration = 0
let signInAttempt = 0
let persistence: Promise<void> = Promise.resolve()
let durableSession: AuthSession | null = null
let durableKnown = false

class AuthRequestError extends Error { constructor(message: string, public readonly status: number) { super(message) } }
export async function authRequest<T>(path: string, body: unknown): Promise<T> {
  if (configurationError) throw new Error(configurationError)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(`${config.apiUrl}/api/v1/auth${path}`, { method: 'POST', credentials: 'omit', signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || !('success' in payload)) throw new Error('Rentral returned an unexpected response.')
    if (!response.ok || payload.success !== true || !('data' in payload)) throw new AuthRequestError('error' in payload && typeof payload.error === 'string' ? payload.error : 'This request could not be completed.', response.status)
    // This is the boundary to the server's versioned auth response contract.
    return payload.data as T
  } catch (error) {
    if (error instanceof AuthRequestError) throw error
    const origin = validatedApiOrigin(config.apiUrl, true)
    const target = origin ? ` at ${origin}` : ''
    throw new Error(controller.signal.aborted
      ? `Rentral took too long to respond${target}. Keep the backend running and check that this device can reach it.`
      : `Could not reach Rentral${target}. Check the backend address and your connection.`)
  } finally { clearTimeout(timeout) }
}
function isSession(value: unknown): value is AuthSession {
  const record = (input: unknown): input is Record<string, unknown> => !!input && typeof input === 'object' && !Array.isArray(input)
  return record(value) && typeof value.access_token === 'string' && value.access_token.length > 0 && value.access_token.length <= 8192
    && typeof value.refresh_token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.refresh_token)
    && typeof value.expires_at === 'number' && Number.isSafeInteger(value.expires_at) && value.expires_at > 0
    && typeof value.expires_in === 'number' && Number.isSafeInteger(value.expires_in) && value.expires_in > 0 && value.token_type === 'bearer'
    && record(value.user) && typeof value.user.id === 'string' && value.user.id.length > 0 && value.user.id.length <= 256
    && typeof value.user.email === 'string' && value.user.email.length > 0 && value.user.email.length <= 254
    && record(value.user.app_metadata) && record(value.user.user_metadata) && value.user.is_anonymous === false
}
function publish(session: AuthSession | null): void {
  current = session
  restored = true
  publishedGeneration = generation
  for (const listener of listeners) listener(session)
}
function serialize(operation: () => Promise<void>): Promise<void> {
  const result = persistence.then(operation)
  // A failed keychain operation must reach its caller without poisoning later
  // attempts to sign out or save a new session.
  persistence = result.catch(() => undefined)
  return result
}
async function settledSession(): Promise<AuthSession | null> {
  let pending: Promise<void>
  do { pending = persistence; await pending } while (pending !== persistence)
  return current
}
async function save(session: AuthSession | null, started: number): Promise<AuthSession | null> {
  await serialize(async () => {
    if (started !== generation) return
    try {
      if (session) await sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      else await sessionStorage.removeItem(SESSION_KEY)
    } catch (error) {
      // An earlier, superseded write may have finished before this write failed.
      // Keep the visible state aligned with the last successful keychain commit.
      if (started === generation && durableKnown && current !== durableSession) publish(durableSession)
      throw error
    }
    durableSession = session
    durableKnown = true
    // Sign-out/new sign-in can begin while SecureStore is awaiting its native
    // write. Its queued commit owns the next state; this completion cannot emit.
    if (started === generation) publish(session)
  })
  return settledSession()
}
async function restore(): Promise<AuthSession | null> {
  if (restored) return current
  const started = generation
  await serialize(async () => {
    if (restored || started !== generation) return
    const stored = await sessionStorage.getItem(SESSION_KEY)
    if (started !== generation) return
    let value: unknown = null
    try { value = stored ? JSON.parse(stored) : null } catch { value = null }
    const session = isSession(value) ? value : null
    if (stored && !session) await sessionStorage.removeItem(SESSION_KEY)
    if (started === generation) { durableSession = session; durableKnown = true; publish(session) }
  })
  return settledSession()
}
export async function getSession(): Promise<AuthSession | null> {
  if (!restoring) restoring = restore().finally(() => { restoring = null })
  await restoring
  const session = await settledSession()
  if (!session || session.expires_at > Math.floor(Date.now() / 1000) + 60) return session
  if (!refreshing || refreshing.generation !== generation || refreshing.token !== session.refresh_token) {
    const started = generation
    const flight = { generation: started, token: session.refresh_token, promise: Promise.resolve<AuthSession | null>(null) }
    flight.promise = (async () => {
      try {
        const updated = await authRequest<unknown>('/refresh', { refreshToken: session.refresh_token })
        if (!isSession(updated)) throw new Error('Your sign-in could not be refreshed.')
        if (started !== generation) return settledSession()
        return await save(updated, started)
      } catch (error) {
        if (started !== generation) return settledSession()
        if (error instanceof AuthRequestError && error.status === 401) await invalidateSession(session.access_token)
        throw error
      }
    })().finally(() => { if (refreshing === flight) refreshing = null })
    refreshing = flight
  }
  return refreshing.promise
}
export async function signIn(email: string, password: string, register = false): Promise<void> {
  const attempt = ++signInAttempt
  const result = await authRequest<unknown>(register ? '/register' : '/login', { email, password })
  if (!isSession(result)) throw new Error('Your sign-in could not be completed.')
  if (attempt !== signInAttempt) return
  // A failed login leaves an existing session usable. Only an accepted login
  // supersedes pending restores/refreshes and commits a new generation.
  await save(result, ++generation)
}
export async function invalidateSession(accessToken: string): Promise<void> {
  // A delayed 401 for an old request must never clear a newer account/rotation.
  if (current?.access_token !== accessToken || publishedGeneration !== generation) return
  await save(null, ++generation)
}
export async function signOut(): Promise<void> {
  signInAttempt++
  const started = ++generation
  const session = current
  try { if (session) await runBeforeSignOut(session); await save(null, started) }
  finally {
    // Revoke remotely even if keychain deletion fails; that failure still
    // rejects signOut and never reports that the local session was cleared.
    if (session) {
      try {
        const response = await fetch(`${config.apiUrl}/api/v1/auth/logout`, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refresh_token }), signal: AbortSignal.timeout(10000) })
        if (!response.ok) throw new Error('Revocation rejected')
      } catch { console.warn('[auth] The backend could not confirm session revocation.') }
    }
  }
}
export function subscribeAuth(listener: (session: AuthSession | null) => void): () => void {
  listeners.add(listener)
  if (restored) listener(current)
  return () => { listeners.delete(listener) }
}
