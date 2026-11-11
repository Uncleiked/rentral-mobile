import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/accounts/availability', async original => ({ ...await original<typeof import('@/lib/accounts/availability')>(), assertActiveAccounts: vi.fn(async () => undefined) }))
import { assertActiveAccounts } from '@/lib/accounts/availability'

const mocks = vi.hoisted(() => ({ identity: vi.fn(), account: vi.fn(), update: vi.fn(), saved: vi.fn(), updateSaved: vi.fn(), media: vi.fn(), revalidate: vi.fn(), lock: vi.fn(), prepare: vi.fn(), claim: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: mocks.identity }))
vi.mock('@/lib/accounts/bootstrap', () => ({
  ensureAccount: mocks.account, accountSelect: { id: true },
  isUniqueConstraintError: (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
}))
vi.mock('@/lib/db', () => ({ default: { user: { update: mocks.update } } }))
vi.mock('@/lib/discovery', () => ({ getSavedListings: mocks.saved }))
vi.mock('@/lib/api/saved', () => ({ updateSavedListing: mocks.updateSaved }))
vi.mock('@/lib/api/media', () => ({ listingMediaForApi: mocks.media }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/database/transactions', () => ({ lockRecord: mocks.lock, withTransaction: async (work: (tx: unknown) => Promise<unknown>) => work({ user: { update: mocks.update } }) }))
vi.mock('@/lib/storage-claims/service', () => ({ prepareAvatarStorage: mocks.prepare, claimStorageObjects: mocks.claim }))
import { ApiError } from '@/lib/api/http'
import { GET as getMe, PATCH as patchMe } from '@/app/api/v1/me/route'
import { GET as getSaved } from '@/app/api/v1/saved/route'
import { PUT as putSaved, DELETE as deleteSaved } from '@/app/api/v1/saved/[id]/route'
import { GET as getMedia } from '@/app/api/v1/listings/[id]/media/route'

const id = '55bfc098-ff33-4fdd-b7ae-68d810a74050'
const listingId = '52db23e2-fb48-4cf7-9dfc-06e3c96c301f'
const context = { params: Promise.resolve({ id: listingId }) }
const account = { id, email: 'authenticated@example.com', username: 'member', account_type: 'individual', bio: null, avatar_url: null, createdAt: new Date('2026-01-01T00:00:00Z') }
const request = (path: string, method = 'GET', body?: unknown): Request => new Request(`https://rentral.example/api/v1${path}`, {
  method, headers: { authorization: 'Bearer opaque-session', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.identity.mockResolvedValue({ userId: id, email: account.email, mode: 'bearer' })
  mocks.account.mockResolvedValue(account)
  mocks.lock.mockResolvedValue(true)
})

it('rejects unauthenticated requests before account, saved or privileged media services run', async () => {
  mocks.identity.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'A valid sign-in is required.'))
  const responses = await Promise.all([
    getMe(request('/me')), patchMe(request('/me', 'PATCH', { bio: 'Hi' })),
    getSaved(request('/saved')), putSaved(request(`/saved/${listingId}`, 'PUT'), context),
    deleteSaved(request(`/saved/${listingId}`, 'DELETE'), context), getMedia(request(`/listings/${listingId}/media`), context),
  ])
  for (const response of responses) {
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('location')).toBeNull()
  }
  expect(mocks.account).not.toHaveBeenCalled()
  expect(mocks.saved).not.toHaveBeenCalled()
  expect(mocks.updateSaved).not.toHaveBeenCalled()
  expect(mocks.media).not.toHaveBeenCalled()
})

it('bootstraps the authenticated identity and supports incomplete accounts without KYC', async () => {
  const response = await getMe(request('/me'))
  expect(response.status).toBe(200)
  expect(mocks.account).toHaveBeenCalledWith({ id, email: account.email })
  expect(await response.json()).toMatchObject({ success: true, data: { id, email: account.email, username: 'member' } })
  expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { admission: false })
})

it('rejects client identity or privilege fields before any profile update', async () => {
  for (const body of [{ id: listingId, bio: 'hi' }, { email: 'other@example.com' }, { kyc_verified: true }]) {
    expect((await patchMe(request('/me', 'PATCH', body))).status).toBe(400)
  }
  expect(mocks.account).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
})

it('normalizes edits and scopes the write to the authenticated identity', async () => {
  mocks.update.mockResolvedValue({ ...account, username: 'new_member', bio: 'Hello Lagos' })
  const response = await patchMe(request('/me', 'PATCH', { username: ' NEW_MEMBER ', bio: ' Hello Lagos ' }))
  expect(response.status).toBe(200)
  expect(mocks.identity).toHaveBeenCalledWith(expect.any(Request), { admission: false, mutation: true })
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id }, data: { username: 'new_member', bio: 'Hello Lagos' } }))
})

it('maps duplicate handles to a readable private conflict without leaking database details', async () => {
  mocks.update.mockRejectedValue({ code: 'P2002', meta: { internal: 'private diagnostics' } })
  const response = await patchMe(request('/me', 'PATCH', { username: 'taken_handle' }))
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ success: false, code: 'USERNAME_TAKEN', error: 'That username is already taken.' })
})

it('verifies and claims an uploaded avatar in the same actor-locked profile transaction', async () => {
  const avatarUrl = `/api/v1/files/profile-avatars/${id}/avatar.png`
  const objects = [{ id: 'prepared-storage-object' }]
  mocks.prepare.mockResolvedValue({ reference: avatarUrl, objects })
  mocks.update.mockResolvedValue({ ...account, avatar_url: avatarUrl })
  const response = await patchMe(request('/me', 'PATCH', { avatarUrl }))
  expect(response.status).toBe(200)
  expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(id, avatarUrl)
  expect(assertActiveAccounts).toHaveBeenCalledWith(expect.any(Object), [id])
  expect(mocks.claim).toHaveBeenCalledWith(expect.any(Object), id, objects)
  expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(assertActiveAccounts).mock.invocationCallOrder[0])
  expect(mocks.claim.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0])
  expect((await response.json()).data.avatarUrl).toBe(avatarUrl)
})

it('allows avatar removal without claiming an object and rejects noncanonical avatar sources', async () => {
  mocks.update.mockResolvedValue(account)
  expect((await patchMe(request('/me', 'PATCH', { avatarUrl: null }))).status).toBe(200)
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { avatar_url: null } }))
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled()
  for (const avatarUrl of ['https://external.example/avatar.png', `/api/v1/files/compliance-docs/${id}/deed.pdf`, `/api/v1/files/profile-avatars/${id}/avatar.png?token=private`]) {
    expect((await patchMe(request('/me', 'PATCH', { avatarUrl }))).status).toBe(400)
  }
  expect(mocks.update).toHaveBeenCalledTimes(1)
})

it('requires account/platform guards for idempotent saves and returns bounded saved results', async () => {
  mocks.saved.mockResolvedValue([])
  expect(await (await getSaved(request('/saved'))).json()).toEqual({ success: true, data: { items: [], limit: 100 } })
  mocks.updateSaved.mockResolvedValueOnce({ saved: true }).mockResolvedValueOnce({ saved: false })
  expect((await putSaved(request(`/saved/${listingId}`, 'PUT'), context)).status).toBe(200)
  expect(mocks.identity).toHaveBeenLastCalledWith(expect.any(Request), { platform: true, mutation: true, verified: true })
  await deleteSaved(request(`/saved/${listingId}`, 'DELETE'), context)
  expect(mocks.updateSaved.mock.calls).toEqual([[id, listingId, true], [id, listingId, false]])
})

it('passes only the authenticated id and validated listing id to media signing', async () => {
  mocks.media.mockResolvedValue({ posterUrl: null, videoUrl: null, expiresAt: '2026-11-09T15:00:00Z' })
  expect((await getMedia(request(`/listings/${listingId}/media`), context)).status).toBe(200)
  expect(mocks.media).toHaveBeenCalledWith(id, listingId)
  const malformed = await getMedia(request('/listings/invalid/media'), { params: Promise.resolve({ id: 'invalid' }) })
  expect(malformed.status).toBe(400)
  expect(mocks.media).toHaveBeenCalledTimes(1)
})
