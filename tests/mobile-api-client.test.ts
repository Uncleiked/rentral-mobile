import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({ fetch: vi.fn(), getSession: vi.fn(), invalidate: vi.fn() }))
vi.mock('../apps/mobile/src/lib/config', () => ({ config: { apiUrl: 'http://127.0.0.1:3000' }, configurationError: null }))
vi.mock('../apps/mobile/src/lib/auth', () => ({ getSession: fixtures.getSession, invalidateSession: fixtures.invalidate }))
import { api } from '../apps/mobile/src/lib/api'

beforeEach(() => {
  fixtures.fetch.mockReset()
  fixtures.getSession.mockReset().mockResolvedValue({ access_token: 'fixture-access' })
  fixtures.invalidate.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal('fetch', fixtures.fetch)
})
afterEach(() => vi.unstubAllGlobals())

it('clears a definite rejected session without replaying a mutation', async () => {
  fixtures.fetch.mockResolvedValue(Response.json({ success: false, error: 'Please sign in again.', code: 'UNAUTHORIZED' }, { status: 401 }))
  await expect(api('/bookings', { method: 'POST', body: { listingId: 'fixture-listing' } })).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  expect(fixtures.invalidate).toHaveBeenCalledExactlyOnceWith('fixture-access')
  expect(fixtures.fetch).toHaveBeenCalledTimes(1)
  expect(fixtures.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ credentials: 'omit' }))
})

it('invalidates a definite401 even when a proxy returns non-JSON', async () => {
  fixtures.fetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }))
  await expect(api('/me')).rejects.toMatchObject({ status: 401, code: 'INVALID_RESPONSE' })
  expect(fixtures.invalidate).toHaveBeenCalledExactlyOnceWith('fixture-access')
})

it('reports a failed secure-session clear instead of pretending the invalid session was removed', async () => {
  fixtures.fetch.mockResolvedValue(Response.json({ success: false, error: 'Unauthorized' }, { status: 401 }))
  fixtures.invalidate.mockRejectedValue(new Error('SecureStore unavailable'))
  await expect(api('/me')).rejects.toMatchObject({ status: 401, code: 'SESSION_CLEAR_FAILED', message: expect.stringContaining('secure storage') })
})

it.each([403, 409, 422, 429, 503])('preserves the sign-in after a confirmed%s rejection', async status => {
  fixtures.fetch.mockResolvedValue(Response.json({ success: false, error: 'Please retry later.', code: 'REQUEST_FAILED' }, { status }))
  await expect(api('/me')).rejects.toMatchObject({ status })
  expect(fixtures.invalidate).not.toHaveBeenCalled()
})

it('preserves the sign-in and never replays a mutation after an ambiguous connection failure', async () => {
  fixtures.fetch.mockRejectedValue(new TypeError('Connection reset'))
  await expect(api('/bookings', { method: 'POST', body: { listingId: 'fixture-listing' } })).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  expect(fixtures.invalidate).not.toHaveBeenCalled()
  expect(fixtures.fetch).toHaveBeenCalledTimes(1)
})

it('identifies an invalid success body as ambiguous rather than a confirmed rejection', async () => {
  fixtures.fetch.mockResolvedValue(new Response('Invalid proxy body', { status: 200 }))
  await expect(api('/my-listings', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 200, code: 'INVALID_RESPONSE' })
  expect(fixtures.invalidate).not.toHaveBeenCalled()
  expect(fixtures.fetch).toHaveBeenCalledTimes(1)
})

it('returns the versioned successful data without exposing tokens in a URL', async () => {
  fixtures.fetch.mockResolvedValue(Response.json({ success: true, data: { items: [] } }))
  expect(await api('/messages')).toEqual({ items: [] })
  expect(fixtures.fetch).toHaveBeenCalledWith('http://127.0.0.1:3000/api/v1/messages', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer fixture-access' }) }))
})

it('rejects a saved mutation when the awaited session belongs to another account', async () => {
  let restore: (value: unknown) => void = () => undefined
  fixtures.getSession.mockReturnValue(new Promise(resolve => { restore = resolve }))
  const pending = api('/financial/operations', { method: 'POST', body: { clientId: 'saved-command' }, expectedUserId: 'original-member' })
  restore({ access_token: 'different-account-access', user: { id: 'new-member' } })
  await expect(pending).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED', status: 409 })
  expect(fixtures.fetch).not.toHaveBeenCalled()
  expect(fixtures.invalidate).not.toHaveBeenCalled()
})

it('sends a matching actor-scoped command once without refreshing or replaying it', async () => {
  fixtures.getSession.mockResolvedValue({ access_token: 'fixture-access', user: { id: 'original-member' } })
  fixtures.fetch.mockResolvedValue(Response.json({ success: true, data: { recorded: true } }))
  expect(await api('/financial/operations', { method: 'POST', body: { clientId: 'saved-command' }, expectedUserId: 'original-member' })).toEqual({ recorded: true })
  expect(fixtures.getSession).toHaveBeenCalledTimes(1)
  expect(fixtures.fetch).toHaveBeenCalledTimes(1)
  expect(fixtures.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ 'X-Rentral-Account': 'original-member' }) }))
})
