import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile, readdir, symlink, unlink, link } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { createLocalStorage } from '@/lib/local-storage/core'
import { storageBucket, uploadPolicy, StorageError } from '@/lib/local-storage/policy'
import { signedStorageUrl, verifyStorageToken } from '@/lib/local-storage/urls'
import { accessToken } from '@/lib/auth/token'

const identity = vi.hoisted(() => vi.fn())
const avatarOwner = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ default: { user: { findFirst: avatarOwner } } }))
const claims = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: identity }))
// This suite isolates filesystem/HTTP behavior; actual Mongo claim serialization
// is exercised by the owned replica-set integration fixture.
vi.mock('@/lib/storage-claims/service', () => ({ uploadStoredObject: claims.upload, removeStoredObjects: claims.remove }))
import { POST as upload, GET as list, DELETE as remove } from '@/app/api/v1/uploads/[bucket]/route'
import { GET as file, HEAD } from '@/app/api/v1/files/[bucket]/[...path]/route'
import { ApiError } from '@/lib/api/http'
import { MONGO_READINESS_MESSAGES } from '@/lib/database/readiness-errors'

const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6XIAAAAASUVORK5CYII=', 'base64'))
const movie = new Uint8Array(64)
movie.set([0, 0, 0, 24, ...Buffer.from('ftypqt  ')])
const videoPath = 'owner/capture/123_video.mov'
let fixture: string
let root: string
let storage: ReturnType<typeof createLocalStorage>
function bytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> { return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }) }
function uploadContext(bucket = 'profile-avatars') { return { params: Promise.resolve({ bucket }) } }
function fileContext(bucket: string, path: string) { return { params: Promise.resolve({ bucket, path: path.split('/') }) } }
function uploadRequest(path: string, bytes: Uint8Array, type = 'image/png', length?: string): Request {
  return new Request('http://localhost:3000/api/v1/uploads/profile-avatars', { method: 'POST', headers: { 'content-type': type, 'x-upload-path': path, ...(length !== undefined ? { 'content-length': length } : {}) }, body: new Uint8Array(bytes).buffer })
}

beforeEach(async () => {
  const testRoot = resolve(process.cwd(), 'test-results')
  await mkdir(testRoot, { recursive: true })
  fixture = await mkdtemp(join(testRoot, 'local-storage-fixture-'))
  root = join(fixture, 'objects'); storage = createLocalStorage(root)
  vi.stubEnv('RENTRAL_STORAGE_DIR', root); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'); vi.stubEnv('JWT_SECRET', 'test-only-file-signing-secret-over-32-characters')
  identity.mockReset(); identity.mockResolvedValue({ userId: 'owner', mode: 'bearer' })
  avatarOwner.mockReset().mockResolvedValue({ id: 'owner' })
  claims.upload.mockReset().mockImplementation((_owner: string, bucket: Parameters<typeof storage.upload>[0], path: string, body: ReadableStream<Uint8Array>, type: string) => storage.upload(bucket, path, body, type))
  claims.remove.mockReset().mockImplementation(async (_owner: string, bucket: Parameters<typeof storage.remove>[0], paths: string[]) => { for (const path of paths) await storage.remove(bucket, path) })
})
afterEach(async () => {
  vi.useRealTimers(); vi.unstubAllEnvs()
  // Recursive removal is limited to this test-created absolute workspace path.
  const expected = `${resolve(process.cwd(), 'test-results')}${sep}`
  if (!resolve(fixture).startsWith(expected) || !fixture.includes('local-storage-fixture-')) throw new Error('Unsafe fixture cleanup target')
  await rm(fixture, { recursive: true, force: true })
})

describe('scoped local storage and verified binary uploads', () => {
  it.each(['DATABASE_UNAVAILABLE', 'DATABASE_SETUP_REQUIRED'] as const)('reports the actual database prerequisite during avatar upload: %s', async code => {
    // Next module reloads can give custom errors a different class identity.
    const failure = Object.assign(new Error('PRIVATE provider text must not be returned'), { name: 'MongoReadinessError', status: 503, code })
    claims.upload.mockRejectedValueOnce(failure)
    const response = await upload(uploadRequest('owner/avatar.png', png), uploadContext())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ success: false, error: MONGO_READINESS_MESSAGES[code], code })
    await expect(storage.info('profile-avatars', 'owner/avatar.png')).rejects.toBeDefined()
  })
  it('denies a closed owner’s avatar while keeping active owners’ upload previews available', async () => {
    await storage.upload('profile-avatars', 'owner/avatar.png', bytesStream(png), 'image/png')
    avatarOwner.mockResolvedValueOnce(null)
    expect((await file(new Request('http://localhost:3000/api/v1/files/profile-avatars/owner/avatar.png'), fileContext('profile-avatars', 'owner/avatar.png'))).status).toBe(404)
    const visible = await file(new Request('http://localhost:3000/api/v1/files/profile-avatars/owner/avatar.png'), fileContext('profile-avatars', 'owner/avatar.png'))
    expect(visible.status).toBe(200); await visible.arrayBuffer()
    expect(avatarOwner).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'owner', AND: [
      { OR: [{ closed_at: null }, { closed_at: { isSet: false } }] },
      { OR: [{ suspended_at: null }, { suspended_at: { isSet: false } }] },
    ] }) }))
  })
  it('preserves bytes when the shared deletion boundary reports a committed reference', async () => {
    await storage.upload('profile-avatars', 'owner/avatar.png', bytesStream(png), 'image/png')
    claims.remove.mockRejectedValueOnce(new StorageError(409, 'FILE_IN_USE', 'This file is attached and cannot be removed.'))
    const response = await remove(new Request('http://localhost:3000/api/v1/uploads/profile-avatars', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paths: ['owner/avatar.png'] }),
    }), uploadContext())
    expect(response.status).toBe(409)
    expect(claims.remove).toHaveBeenCalledWith('owner', 'profile-avatars', ['owner/avatar.png'])
    expect((await storage.info('profile-avatars', 'owner/avatar.png')).size).toBe(png.length)
  })
  it('stores genuine raster bytes and metadata without an external storage service', async () => {
    expect((await upload(uploadRequest('owner/avatar.png', png), uploadContext())).status).toBe(201)
    expect(await storage.info('profile-avatars', 'owner/avatar.png')).toMatchObject({ contentType: 'image/png', size: png.length })
    expect(new Uint8Array(await (await storage.download('profile-avatars', 'owner/avatar.png')).arrayBuffer())).toEqual(png)
    const response = await file(new Request('http://localhost:3000/api/v1/files/profile-avatars/owner/avatar.png'), fileContext('profile-avatars', 'owner/avatar.png'))
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('image/png'); expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toContain('no-store')
    await response.arrayBuffer()
  })
  it('keeps real MOV container metadata and never relabels it as MP4', async () => {
    await storage.upload('listings-media', videoPath, bytesStream(movie), 'video/quicktime')
    expect(await storage.info('listings-media', videoPath)).toMatchObject({ contentType: 'video/quicktime' })
    await expect(storage.upload('listings-media', 'owner/capture/video.mp4', bytesStream(movie), 'video/mp4')).rejects.toMatchObject({ status: 415 })
  })
  it('rejects active-content, type/extension mismatch and spoofed image headers', async () => {
    expect((await upload(uploadRequest('owner/active.svg', new TextEncoder().encode('<svg onload="alert(1)"/>'), 'image/svg+xml'), uploadContext())).status).toBe(415)
    expect((await upload(uploadRequest('owner/photo.jpg', png), uploadContext())).status).toBe(415)
    expect((await upload(uploadRequest('owner/photo.png', new TextEncoder().encode('<html>not an image</html>')), uploadContext())).status).toBe(415)
  })
  it('bounds actual streamed bytes even when the supplied Content-Length is smaller', async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 1); bytes.set(png.subarray(0, 64))
    expect((await upload(uploadRequest('owner/oversized.png', bytes, 'image/png', '1'), uploadContext())).status).toBe(413)
    const folder = join(root, 'profile-avatars', 'owner')
    expect(await readdir(folder)).toEqual([])
    expect(uploadPolicy('listings-media', 'owner/capture/video.mov', 'video/quicktime').maximumBytes).toBe(200 * 1024 * 1024)
    expect(uploadPolicy('compliance-docs', 'owner/capture/deed.pdf', 'application/pdf').maximumBytes).toBe(10 * 1024 * 1024)
  })
  it('preserves an immutable existing object on duplicate upload', async () => {
    await storage.upload('profile-avatars', 'owner/avatar.png', bytesStream(png), 'image/png')
    await expect(storage.upload('profile-avatars', 'owner/avatar.png', bytesStream(png), 'image/png')).rejects.toMatchObject({ code: 'EEXIST' })
    expect((await storage.info('profile-avatars', 'owner/avatar.png')).size).toBe(png.length)
  })
  it('cannot replace a deleted recording under an old listing/GPS path', async () => {
    await storage.upload('listings-media', videoPath, bytesStream(movie), 'video/quicktime')
    await storage.remove('listings-media', videoPath)
    await expect(storage.info('listings-media', videoPath)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    await expect(storage.upload('listings-media', videoPath, bytesStream(movie), 'video/quicktime')).rejects.toMatchObject({ status: 409, code: 'FILE_NAME_USED' })
    await expect(storage.upload('listings-media', videoPath.replace('video.mov', 'VIDEO.MOV'), bytesStream(movie), 'video/quicktime')).rejects.toMatchObject({ status: 409, code: 'FILE_NAME_USED' })
    const markers = await readdir(join(root, '.deleted'))
    expect(markers).toHaveLength(1); expect(markers[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(markers[0]).not.toContain('owner')
  })
  it.each(['../outside/avatar.png', 'owner/../avatar.png', 'owner\\avatar.png', 'owner/%2e%2e.png', 'owner/CON.png', 'owner/avatar.png.', '/owner/avatar.png', 'owner/evil:stream.png'])('rejects noncanonical or unsafe filesystem path %s', async path => {
    const response = await upload(uploadRequest(path, png), uploadContext())
    expect(response.status).toBe(400)
  })
  it('requires the verified actor and checks every removal path before deleting anything', async () => {
    expect((await upload(uploadRequest('victim/avatar.png', png), uploadContext())).status).toBe(403)
    await storage.upload('profile-avatars', 'owner/avatar.png', bytesStream(png), 'image/png')
    const response = await remove(new Request('http://localhost:3000/api/v1/uploads/profile-avatars', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paths: ['owner/avatar.png', 'victim/avatar.png'] }) }), uploadContext())
    expect(response.status).toBe(403)
    expect((await storage.info('profile-avatars', 'owner/avatar.png')).size).toBe(png.length)
  })
  it('cannot bypass upload authentication or list another account', async () => {
    identity.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'Sign in.'))
    expect((await upload(uploadRequest('owner/avatar.png', png), uploadContext())).status).toBe(401)
    expect((await list(new Request('http://localhost:3000/api/v1/uploads/profile-avatars?prefix=victim'), uploadContext())).status).toBe(403)
    expect(identity).toHaveBeenCalledWith(expect.any(Request), { mutation: true })
  })
  it('never exposes the private mail outbox as a storage bucket', async () => {
    await mkdir(join(root, 'mail-outbox'), { recursive: true }); await writeFile(join(root, 'mail-outbox', 'reset.json'), '{"resetToken":"private"}')
    expect(() => storageBucket('mail-outbox')).toThrow(StorageError)
    const response = await file(new Request('http://localhost:3000/api/v1/files/mail-outbox/reset.json'), fileContext('mail-outbox', 'reset.json'))
    expect(response.status).toBe(404); expect(await response.text()).not.toContain('resetToken')
  })
  it('rejects directory symlinks/junctions before reading or writing a file', async () => {
    await storage.upload('listings-media', videoPath, bytesStream(movie), 'video/quicktime')
    const outside = join(fixture, 'outside'); await mkdir(outside)
    await symlink(outside, join(root, 'listings-media', 'owner', 'blocked'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(storage.upload('listings-media', 'owner/blocked/video.mov', bytesStream(movie), 'video/quicktime')).rejects.toMatchObject({ status: 403 })
    await expect(storage.info('listings-media', 'owner/blocked/video.mov')).rejects.toMatchObject({ status: 403 })
    expect(await readdir(outside)).toEqual([])
  })
  it('rejects an externally hard-linked object as well as symlink traversal', async () => {
    await storage.upload('profile-avatars', 'owner/avatar.png', bytesStream(png), 'image/png')
    const outside = join(fixture, 'private.png'); await writeFile(outside, png)
    const target = join(root, 'profile-avatars', 'owner', 'avatar.png'); await unlink(target); await link(outside, target)
    await expect(storage.info('profile-avatars', 'owner/avatar.png')).rejects.toMatchObject({ status: 403 })
  })
})

describe('private signed delivery and bounded video ranges', () => {
  beforeEach(async () => { await storage.upload('listings-media', videoPath, bytesStream(movie), 'video/quicktime') })
  it('requires a file-specific token and refuses ordinary app bearer tokens', async () => {
    const url = 'http://localhost:3000/api/v1/files/listings-media/' + videoPath
    expect((await file(new Request(url, { headers: { authorization: `Bearer ${await accessToken('owner', 'session')}` } }), fileContext('listings-media', videoPath))).status).toBe(403)
    const signed = await signedStorageUrl('listings-media', videoPath)
    expect((await file(new Request(signed.replace('123_video.mov', 'other.mov')), fileContext('listings-media', 'owner/capture/other.mov'))).status).toBe(403)
  })
  it('enforces purpose, bucket, path, signature and five-minute expiration', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const signed = new URL(await signedStorageUrl('listings-media', videoPath, 3600))
    const token = signed.searchParams.get('token')!
    await expect(verifyStorageToken(token, 'listings-media', videoPath)).resolves.toBeUndefined()
    await expect(verifyStorageToken(token, 'compliance-docs', videoPath)).rejects.toMatchObject({ status: 403 })
    const pieces = token.split('.'); pieces[2] = `${pieces[2][0] === 'a' ? 'b' : 'a'}${pieces[2].slice(1)}`
    await expect(verifyStorageToken(pieces.join('.'), 'listings-media', videoPath)).rejects.toMatchObject({ status: 403 })
    vi.setSystemTime(Date.now() + 301000)
    await expect(verifyStorageToken(token, 'listings-media', videoPath)).rejects.toMatchObject({ status: 403 })
  })
  it('streams exact byte ranges with private cache headers and valid content lengths', async () => {
    const signed = await signedStorageUrl('listings-media', videoPath)
    const response = await file(new Request(signed, { headers: { range: 'bytes=2-5' } }), fileContext('listings-media', videoPath))
    expect(response.status).toBe(206); expect(response.headers.get('content-range')).toBe('bytes 2-5/64'); expect(response.headers.get('content-length')).toBe('4')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(movie.slice(2, 6))
    const suffix = await file(new Request(signed, { headers: { range: 'bytes=-4' } }), fileContext('listings-media', videoPath))
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(movie.slice(-4))
    const head = await HEAD(new Request(signed, { method: 'HEAD' }), fileContext('listings-media', videoPath))
    expect(head.status).toBe(200); expect(head.headers.get('content-length')).toBe('64'); expect((await head.arrayBuffer()).byteLength).toBe(0)
  })
  it.each(['bytes=100-200', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-6', 'not-a-range'])('rejects invalid/multipart range %s without streaming data', async range => {
    const response = await file(new Request(await signedStorageUrl('listings-media', videoPath), { headers: { range } }), fileContext('listings-media', videoPath))
    expect(response.status).toBe(416); expect(response.headers.get('content-range')).toBe('bytes */64'); expect((await response.arrayBuffer()).byteLength).toBe(0)
  })
})
