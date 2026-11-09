import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => ({ bytes: new Uint8Array([255, 216, 255, 224]).buffer, fetch: vi.fn(), invalidate: vi.fn(), session: vi.fn(), resize: vi.fn(), releaseContext: vi.fn(), releaseImage: vi.fn(), save: vi.fn(), render: vi.fn(), manipulate: vi.fn() }))
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-file-system', () => ({ File: class { exists = true; get size() { return fixtures.bytes.byteLength } async arrayBuffer() { return fixtures.bytes } } }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '22222222-2222-4222-8222-222222222222' }))
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: fixtures.manipulate }, SaveFormat: { JPEG: 'jpeg' } }))
vi.mock('../apps/mobile/src/lib/auth', () => ({ getSession: fixtures.session, invalidateSession: fixtures.invalidate }))
vi.mock('../apps/mobile/src/lib/config', () => ({ config: { apiUrl: 'http://127.0.0.1:3000' }, configurationError: null }))
vi.mock('../apps/mobile/src/lib/api', () => ({ ApiError: class ApiError extends Error { constructor(message: string, public readonly code: string, public readonly status: number) { super(message) } } }))
import { prepareAvatar, uploadPreparedAvatar } from '../apps/mobile/src/lib/avatar-upload'

const userId = '11111111-1111-4111-8111-111111111111'
const path = `${userId}/22222222-2222-4222-8222-222222222222.jpg`
beforeEach(() => {
  vi.clearAllMocks(); fixtures.bytes = new Uint8Array([255, 216, 255, 224]).buffer
  fixtures.session.mockResolvedValue({ user: { id: userId }, access_token: 'fixture-access' })
  fixtures.invalidate.mockResolvedValue(undefined)
  fixtures.save.mockResolvedValue({ uri: 'file:///fixture/avatar.jpg' })
  fixtures.render.mockResolvedValue({ saveAsync: fixtures.save, release: fixtures.releaseImage })
  fixtures.manipulate.mockReturnValue({ resize: fixtures.resize, renderAsync: fixtures.render, release: fixtures.releaseContext })
  vi.stubGlobal('fetch', fixtures.fetch)
})
afterEach(() => { vi.unstubAllGlobals() })

it('encodes an actual JPEG and releases native image resources after preparation', async () => {
  expect(await prepareAvatar('file:///fixture/selected.heic')).toEqual({ uri: 'file:///fixture/avatar.jpg', bytes: fixtures.bytes })
  expect(fixtures.manipulate).toHaveBeenCalledWith('file:///fixture/selected.heic', { maxWidth: 1024, maxHeight: 1024 })
  expect(fixtures.save).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8 })
  expect(fixtures.releaseImage).toHaveBeenCalledTimes(1)
  expect(fixtures.releaseContext).toHaveBeenCalledTimes(1)
})
it('does not pretend mislabeled image bytes are a JPEG', async () => {
  fixtures.bytes = new Uint8Array([60, 115, 118, 103, 62]).buffer
  await expect(prepareAvatar('file:///fixture/selected.jpg')).rejects.toThrow('prepared as a JPEG')
  expect(fixtures.fetch).not.toHaveBeenCalled()
  expect(fixtures.releaseContext).toHaveBeenCalledTimes(1)
})
it('rejects oversized prepared avatars before any upload', async () => {
  fixtures.bytes = new ArrayBuffer(2 * 1024 * 1024 + 1)
  await expect(prepareAvatar('file:///fixture/selected.jpg')).rejects.toThrow('under 2MB')
  expect(fixtures.fetch).not.toHaveBeenCalled()
})
it('uploads actual bytes under the authenticated owner and returns only the confirmed local public reference', async () => {
  fixtures.fetch.mockResolvedValue(Response.json({ success: true, data: { path } }, { status: 201 }))
  expect(await uploadPreparedAvatar({ uri: 'file:///fixture/avatar.jpg', bytes: fixtures.bytes })).toBe(`/api/v1/files/profile-avatars/${path}`)
  expect(fixtures.fetch).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:3000/api/v1/uploads/profile-avatars', expect.objectContaining({
    method: 'POST', credentials: 'omit', body: fixtures.bytes, headers: { Authorization: 'Bearer fixture-access', 'Content-Type': 'image/jpeg', 'X-Upload-Path': path },
  }))
})
it('does not accept an upload acknowledgment for another file', async () => {
  fixtures.fetch.mockResolvedValue(Response.json({ success: true, data: { path: 'other-user/photo.jpg' } }))
  await expect(uploadPreparedAvatar({ uri: 'file:///fixture/avatar.jpg', bytes: fixtures.bytes })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
it('invalidates only a definite401 and keeps selection available on ordinary upload failure', async () => {
  fixtures.fetch.mockResolvedValueOnce(Response.json({ success: false, error: 'Please sign in again.' }, { status: 401 }))
  await expect(uploadPreparedAvatar({ uri: 'file:///fixture/avatar.jpg', bytes: fixtures.bytes })).rejects.toMatchObject({ status: 401 })
  expect(fixtures.invalidate).toHaveBeenCalledExactlyOnceWith('fixture-access')
  fixtures.invalidate.mockClear()
  fixtures.fetch.mockResolvedValueOnce(Response.json({ success: false, error: 'Temporarily unavailable.' }, { status: 503 }))
  await expect(uploadPreparedAvatar({ uri: 'file:///fixture/avatar.jpg', bytes: fixtures.bytes })).rejects.toMatchObject({ status: 503 })
  expect(fixtures.invalidate).not.toHaveBeenCalled()
})
it('never retries an uncertain upload or fabricates a public URL', async () => {
  fixtures.fetch.mockRejectedValue(new TypeError('Disconnected'))
  await expect(uploadPreparedAvatar({ uri: 'file:///fixture/avatar.jpg', bytes: fixtures.bytes })).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 })
  expect(fixtures.fetch).toHaveBeenCalledTimes(1)
})
