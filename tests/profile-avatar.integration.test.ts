import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { MongoClient } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import prisma from '@/lib/db'
import { localMongoDatabaseName, localMongoUrl } from '@/lib/database/config'
import { ensureMongoIndexes } from '@/lib/database/indexes'
import { closeMongoReadiness } from '@/lib/database/readiness'
import { registerAccount } from '@/lib/auth/service'
import { createLocalStorage } from '@/lib/local-storage/core'
import { removeStoredObjects } from '@/lib/storage-claims/service'
import { POST as upload } from '@/app/api/v1/uploads/[bucket]/route'
import { GET as getMe, PATCH as patchMe } from '@/app/api/v1/me/route'

// Only Next's request-context adapters are replaced; JWT verification, upload
// bytes, claims, account transaction and Mongo validators execute unchanged.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn() }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const uri = process.env.RENTRAL_TEST_MONGO_URI, owner = process.env.RENTRAL_TEST_MONGO_OWNER
const fixture = describe.skipIf(!uri)
fixture('owned avatar upload and profile save', () => {
  let native: MongoClient, storageRoot: string
  let member: Awaited<ReturnType<typeof registerAccount>>, other: Awaited<ReturnType<typeof registerAccount>>
  const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6XIAAAAASUVORK5CYII=', 'base64'))
  const jpeg = new Uint8Array([255, 216, 255, 224, ...Buffer.from('owned-avatar-fixture-jpeg')])
  let firstPath: string, replacementPath: string

  beforeAll(async () => {
    if (!uri || !owner || !/^[a-f0-9]{32}$/.test(owner) || localMongoDatabaseName(uri) !== `rentral_test_${owner}` || process.env.MONGODB_URL !== uri || process.env.DATABASE_URL !== uri) throw new Error('Use the owned Mongo fixture runner; never the selected application database.')
    native = new MongoClient(localMongoUrl(uri), { serverSelectionTimeoutMS: 3000 }); await native.connect()
    const db = native.db(localMongoDatabaseName(uri))
    if ((await db.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error('Avatar fixture database must be new and empty.')
    await db.collection<{ _id: string }>('_FixtureOwnership').insertOne({ _id: owner })
    await ensureMongoIndexes(db)
    const artifacts = resolve('test-results'); await mkdir(artifacts, { recursive: true })
    storageRoot = await mkdtemp(join(artifacts, 'owned-avatar-storage-'))
    vi.stubEnv('RENTRAL_STORAGE_DIR', storageRoot)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:30999')
    vi.stubEnv('JWT_SECRET', 'owned-avatar-fixture-only-signing-secret-over-32-bytes')
    vi.stubEnv('RENTRAL_PLATFORM_ENABLED', 'true')
    member = await registerAccount({ email: `${randomUUID()}@fixture.invalid`, password: 'owned-avatar-password-123' })
    other = await registerAccount({ email: `${randomUUID()}@fixture.invalid`, password: 'owned-avatar-password-123' })
    firstPath = `${member.user.id}/${randomUUID()}.jpg`
    replacementPath = `${member.user.id}/${randomUUID()}.png`
  }, 20000)

  afterAll(async () => {
    await prisma.$disconnect(); await closeMongoReadiness(); await native?.close(); vi.unstubAllEnvs()
    if (storageRoot) {
      if (!resolve(storageRoot).startsWith(`${resolve('test-results')}${sep}`) || !storageRoot.includes('owned-avatar-storage-')) throw new Error('Unsafe avatar fixture cleanup.')
      await rm(storageRoot, { recursive: true, force: true })
    }
  })

  function profileRequest(session: typeof member, body?: unknown) {
    return new Request('http://127.0.0.1:30999/api/v1/me', { method: body === undefined ? 'GET' : 'PATCH', headers: { authorization: `Bearer ${session.access_token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  async function uploadPhoto(path: string, bytes: Uint8Array, contentType: string) {
    return upload(new Request('http://127.0.0.1:30999/api/v1/uploads/profile-avatars', { method: 'POST', headers: { authorization: `Bearer ${member.access_token}`, 'content-type': contentType, 'x-upload-path': path }, body: new Uint8Array(bytes).buffer }), { params: Promise.resolve({ bucket: 'profile-avatars' }) })
  }

  it('persists a native JPEG upload and confirms the same profile reference on refresh', async () => {
    const uploaded = await uploadPhoto(firstPath, jpeg, 'image/jpeg')
    expect(uploaded.status).toBe(201)
    expect(await uploaded.json()).toMatchObject({ success: true, data: { path: firstPath } })
    const avatarUrl = `/api/v1/files/profile-avatars/${firstPath}`
    const saved = await patchMe(profileRequest(member, { avatarUrl }))
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ success: true, data: { id: member.user.id, avatarUrl } })
    expect(await (await getMe(profileRequest(member))).json()).toMatchObject({ data: { avatarUrl } })
    await expect(removeStoredObjects(member.user.id, 'profile-avatars', [firstPath])).rejects.toMatchObject({ code: 'FILE_IN_USE' })
  }, 15000)

  it('replaces an existing photo only after a confirmed upload and retains both immutable files', async () => {
    expect((await uploadPhoto(replacementPath, png, 'image/png')).status).toBe(201)
    const avatarUrl = `/api/v1/files/profile-avatars/${replacementPath}`
    const saved = await patchMe(profileRequest(member, { avatarUrl }))
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ data: { avatarUrl } })
    expect((await createLocalStorage(storageRoot).info('profile-avatars', firstPath)).size).toBe(jpeg.length)
    expect((await createLocalStorage(storageRoot).info('profile-avatars', replacementPath)).size).toBe(png.length)
    const rejected = await patchMe(profileRequest(other, { avatarUrl }))
    expect(rejected.status).toBe(403)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.user.id }, select: { avatar_url: true } })).avatar_url).toBeNull()
  }, 15000)
})
