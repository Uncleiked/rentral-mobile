import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId, Binary, type Db } from 'mongodb'
const state = vi.hoisted(() => ({ maps: new Map<string, Map<string, Record<string, unknown>>>(), lostAck: false, chunkGate: null as null | (() => Promise<void>), streams: vi.fn(), aggregate: vi.fn() }))
function table(name: string) { let values = state.maps.get(name); if (!values) { values = new Map(); state.maps.set(name, values) } return values }
function same(left: unknown, right: unknown): boolean { return left instanceof ObjectId && right instanceof ObjectId ? left.equals(right) : left === right }
function matches(row: Record<string, unknown>, query: Record<string, unknown>): boolean { return Object.entries(query).every(([key, value]) => same(row[key], value)) }
vi.mock('mongodb', async original => {
  const actual = await original<typeof import('mongodb')>()
  return { ...actual, GridFSBucket: class {
    constructor(readonly db: unknown, readonly options: { bucketName: string }) {}
    openDownloadStream(id: ObjectId, options: { start?: number; end?: number } = {}) {
      state.streams(id, options)
      const rows = [...table(this.options.bucketName + '.chunks').values()].filter(row => same(row.files_id, id)).sort((a, b) => Number(a.n) - Number(b.n))
      const data = Buffer.concat(rows.map(row => Buffer.from(row.data instanceof actual.Binary ? row.data.buffer : row.data as Uint8Array)))
      return Readable.from([data.subarray(options.start ?? 0, options.end ?? data.length)])
    }
  } }
})
import { createMongoStorage } from '@/lib/local-storage/mongodb'
import { UPLOAD_PART_BYTES } from '@/lib/contracts/upload-transport'
function database(): Db {
  return { collection(name: string) {
    const rows = table(name)
    return {
      async findOne(query: Record<string, unknown>) { return [...rows.values()].find(row => matches(row, query)) ?? null },
      find(query: Record<string, unknown>) { const values = [...rows.values()].filter(row => matches(row, query)).sort((a, b) => Number(a.n) - Number(b.n)); return { async next() { return values.shift() ?? null }, async close() {} } },
      async insertOne(row: Record<string, unknown>) {
        if (name.endsWith('.chunks') && state.chunkGate) await state.chunkGate()
        const key = String(row._id); if (rows.has(key) || name.endsWith('.chunks') && [...rows.values()].some(value => same(value.files_id, row.files_id) && value.n === row.n)) throw Object.assign(new Error('Duplicate'), { code: 11000 }); rows.set(key, { ...row }); return { insertedId: row._id }
      },
      async updateOne(query: Record<string, unknown>, update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> }, options?: { upsert?: boolean }) {
        let row = [...rows.values()].find(row => matches(row, query))
        if (!row && options?.upsert) { row = { ...query, ...update.$setOnInsert }; rows.set(String(row._id), row) }
        if (!row) return { modifiedCount: 0 }
        Object.assign(row, update.$set)
        if (state.lostAck && update.$set?.state === 'available') { state.lostAck = false; throw new Error('Commit acknowledgement lost') }
        return { modifiedCount: 1 }
      },
      async deleteOne(query: Record<string, unknown>) { for (const [key, row] of rows) if (matches(row, query)) { rows.delete(key); break } return { deletedCount: 1 } },
      async deleteMany(query: Record<string, unknown>) { for (const [key, row] of rows) if (matches(row, query)) rows.delete(key); return { deletedCount: 1 } },
      aggregate(pipeline: Record<string, unknown>[]) {
        state.aggregate(pipeline)
        const condition = pipeline[0].$match as { bucket: string; state: string; canonical_path: { $gte: string; $lt: string } }
        const limit = Number(pipeline.find(stage => '$limit' in stage)?.$limit ?? 100), start = condition.canonical_path.$gte, groups = new Map<string, { name: string; path: string }>()
        for (const row of rows.values()) if (row.bucket === condition.bucket && row.state === condition.state && String(row.canonical_path) >= start && String(row.canonical_path) < condition.canonical_path.$lt) {
          const name = String(row.path).slice(start.length).split('/')[0]; if (!groups.has(name.toLowerCase())) groups.set(name.toLowerCase(), { name, path: String(row.path) })
        }
        return { async toArray() { return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([, row]) => row) } }
      },
    }
  } } as unknown as Db
}
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(1024)])
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function stream(data: Uint8Array) { return new Blob([new Uint8Array(data)]).stream() }
const db = vi.fn(async () => database())
let storage: ReturnType<typeof createMongoStorage>
beforeEach(() => { vi.clearAllMocks(); state.maps.clear(); state.lostAck = false; state.chunkGate = null; storage = createMongoStorage(db) })
afterEach(() => vi.useRealTimers())
describe('durable GridFS media and immutable path lifecycle', () => {
  it('streams verified chunks, publishes exact metadata and downloads original bytes', async () => {
    const input = Buffer.concat([png, Buffer.alloc(600000)])
    expect(await storage.upload('listings-media', 'owner/folder/photo.png', stream(input), 'image/png')).toEqual({ path: 'owner/folder/photo.png' })
    expect(table('rentral_media.chunks').size).toBe(3)
    expect(await storage.info('listings-media', 'owner/folder/photo.png')).toMatchObject({ size: input.length, contentType: 'image/png', digest: hash(input) })
    expect(Buffer.from(await (await storage.download('listings-media', 'owner/folder/photo.png')).arrayBuffer())).toEqual(input)
    expect([...table('rentral_media.files').values()][0]).toMatchObject({ chunkSize: 261120, length: input.length, metadata: { digest: hash(input) } })
  })
  it('never overwrites an existing object including case aliases', async () => {
    await storage.upload('listings-media', 'owner/folder/photo.png', stream(png), 'image/png')
    await expect(storage.upload('listings-media', 'owner/folder/PHOTO.PNG', stream(png), 'image/png')).rejects.toMatchObject({ code: 'FILE_EXISTS' })
    expect(table('rentral_media.files').size).toBe(1)
  })
  it('rejects unsafe paths and MIME mismatches before touching the database', async () => {
    await expect(storage.upload('listings-media', 'owner/../photo.png', stream(png), 'image/png')).rejects.toMatchObject({ code: 'INVALID_PATH' })
    await expect(storage.upload('listings-media', 'owner/folder/photo.png', stream(png), 'application/pdf')).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' })
    expect(db).not.toHaveBeenCalled()
  })
  it.each([new Uint8Array(0), new Uint8Array([1, 2, 3])])('does not expose empty or mismatched bytes', async input => {
    await expect(storage.upload('profile-avatars', 'owner/avatar.png', stream(input), 'image/png')).rejects.toMatchObject({ status: input.length ? 415 : 400 })
    expect([...table('MediaBlob').values()][0].state).toBe('deleted'); expect(table('rentral_media.files').size).toBe(0); expect(table('rentral_media.chunks').size).toBe(0)
  })
  it('enforces the avatar size bound while streaming and cleans partial chunks', async () => {
    await expect(storage.upload('profile-avatars', 'owner/avatar.png', stream(Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)])), 'image/png')).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
    expect(table('rentral_media.files').size).toBe(0); expect(table('rentral_media.chunks').size).toBe(0)
  })
  it('applies the upload deadline between database chunk writes as well as stream reads', async () => {
    vi.useFakeTimers(); const clock = Date.now(); let inserts = 0
    state.chunkGate = async () => { inserts += 1; vi.setSystemTime(clock + 180001) }
    await expect(storage.upload('listings-media', 'owner/folder/photo.png', stream(Buffer.concat([png, Buffer.alloc(600000)])), 'image/png')).rejects.toMatchObject({ code: 'UPLOAD_TIMEOUT' })
    expect(inserts).toBe(1); expect(table('rentral_media.chunks').size).toBe(0); expect(table('rentral_media.files').size).toBe(0)
    expect([...table('MediaBlob').values()][0].state).toBe('deleted')
  })
  it('retains published bytes after an acknowledgement is lost', async () => {
    state.lostAck = true
    await expect(storage.upload('profile-avatars', 'owner/avatar.png', stream(png), 'image/png')).resolves.toEqual({ path: 'owner/avatar.png' })
    expect(await storage.info('profile-avatars', 'owner/avatar.png')).toMatchObject({ digest: hash(png) })
    expect([...table('MediaBlob').values()][0].state).toBe('available')
  })
  it('makes deletion durable and denies reuse even when the file was never uploaded', async () => {
    await storage.remove('profile-avatars', 'owner/avatar.png')
    await expect(storage.upload('profile-avatars', 'owner/avatar.png', stream(png), 'image/png')).rejects.toMatchObject({ code: 'FILE_NAME_USED' })
    await expect(storage.info('profile-avatars', 'owner/avatar.png')).rejects.toMatchObject({ status: 404 })
  })
  it('cannot resurrect a file deleted while its chunks are still being written', async () => {
    let release!: () => void, entered!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve }), atChunk = new Promise<void>(resolve => { entered = resolve })
    state.chunkGate = async () => { entered(); await waiting }
    const uploading = storage.upload('listings-media', 'owner/folder/photo.png', stream(Buffer.concat([png, Buffer.alloc(300000)])), 'image/png')
    const rejected = expect(uploading).rejects.toMatchObject({ code: 'FILE_NAME_USED' })
    await atChunk; await storage.remove('listings-media', 'owner/folder/photo.png'); release(); await rejected
    expect([...table('MediaBlob').values()][0].state).toBe('deleted'); expect(table('rentral_media.files').size).toBe(0); expect(table('rentral_media.chunks').size).toBe(0)
  })
  it('maps inclusive HTTP ranges to exclusive GridFS end and rejects invalid ranges', async () => {
    await storage.upload('profile-avatars', 'owner/avatar.png', stream(png), 'image/png')
    const result = await storage.stream('profile-avatars', 'owner/avatar.png', { start: 2, end: 7 })
    expect(Buffer.from(await new Response(result).arrayBuffer())).toEqual(png.subarray(2, 8))
    expect(state.streams).toHaveBeenLastCalledWith(expect.any(ObjectId), { start: 2, end: 8 })
    await expect(storage.stream('profile-avatars', 'owner/avatar.png', { start: 0, end: png.length })).rejects.toMatchObject({ status: 416 })
  })
  it('fails closed if completed files, metadata or first-chunk magic are missing or corrupt', async () => {
    await storage.upload('profile-avatars', 'owner/avatar.png', stream(png), 'image/png')
    const file = [...table('rentral_media.files').values()][0], chunk = [...table('rentral_media.chunks').values()][0]
    file.length = png.length + 1; await expect(storage.info('profile-avatars', 'owner/avatar.png')).rejects.toMatchObject({ status: 404 }); file.length = png.length
    chunk.data = Buffer.alloc(png.length); await expect(storage.info('profile-avatars', 'owner/avatar.png')).rejects.toMatchObject({ status: 415 })
  })
  it('verifies the complete digest on bounded buffered downloads', async () => {
    await storage.upload('profile-avatars', 'owner/avatar.png', stream(png), 'image/png')
    const chunk = [...table('rentral_media.chunks').values()][0]; const changed = Buffer.from(png); changed[100] = 1; chunk.data = new Binary(changed)
    await expect(storage.download('profile-avatars', 'owner/avatar.png')).rejects.toMatchObject({ status: 404 })
  })
  it('groups folder names before the bounded result limit and lists verified leaves', async () => {
    await storage.upload('listings-media', 'owner/one/a.png', stream(png), 'image/png'); await storage.upload('listings-media', 'owner/two/b.png', stream(png), 'image/png')
    expect(await storage.list('listings-media', 'owner', 1)).toEqual([{ name: 'one', id: null, metadata: null }])
    const pipeline = state.aggregate.mock.calls[0][0]; expect(pipeline.findIndex((stage: object) => '$group' in stage)).toBeLessThan(pipeline.findIndex((stage: object) => '$limit' in stage))
    expect(await storage.list('listings-media', 'owner/two')).toEqual([expect.objectContaining({ name: 'b.png', id: 'owner/two/b.png', metadata: { size: png.length, mimetype: 'image/png' } })])
  })
  it('caps buffered video downloads while preserving streaming access', async () => {
    const input = Buffer.concat([Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0]), Buffer.alloc(300000)])
    await storage.upload('listings-media', 'owner/folder/video.mp4', stream(input), 'video/mp4')
    const head = [...table('MediaBlob').values()][0], file = [...table('rentral_media.files').values()][0]
    head.size_bytes = 17 * 1024 * 1024; file.length = head.size_bytes
    await expect(storage.download('listings-media', 'owner/folder/video.mp4')).rejects.toMatchObject({ code: 'STREAM_REQUIRED' })
    expect(state.streams).not.toHaveBeenCalled()
  })
  it('bounds a stalled input stream and leaves a tombstone instead of an available file', async () => {
    vi.useFakeTimers()
    const body = new ReadableStream<Uint8Array>({ start() {} })
    const assertion = expect(storage.upload('profile-avatars', 'owner/avatar.png', body, 'image/png')).rejects.toMatchObject({ code: 'UPLOAD_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(180001); await assertion
    expect([...table('MediaBlob').values()][0].state).toBe('deleted')
  })
})

describe('bounded resumable HTTP parts', () => {
 const path = 'owner/folder/parts.png'
 function input() { return Buffer.concat([png, Buffer.alloc(UPLOAD_PART_BYTES + 53 - png.length, 7)]) }
 it('publishes only after all bounded parts and computes the full original digest', async () => {
  const data = input()
  expect(await storage.uploadPart('listings-media', path, stream(data.subarray(0, UPLOAD_PART_BYTES)), 'image/png', data.length, 0)).toEqual({ path, complete: false, nextPart: 1 })
  await expect(storage.info('listings-media', path)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect(await storage.uploadPart('listings-media', path, stream(data.subarray(UPLOAD_PART_BYTES)), 'image/png', data.length, 1)).toEqual({ path, complete: true, nextPart: 2 })
  expect(await storage.info('listings-media', path)).toMatchObject({ size: data.length, digest: hash(data) })
  expect(Buffer.from(await (await storage.download('listings-media', path)).arrayBuffer()).equals(data)).toBe(true)
 })
 it('recovers an acknowledged prefix and accepts exact repeated final parts without rewriting bytes', async () => {
  const data = input(), first = data.subarray(0, UPLOAD_PART_BYTES), last = data.subarray(UPLOAD_PART_BYTES)
  await storage.uploadPart('listings-media', path, stream(first), 'image/png', data.length, 0)
  expect(await storage.uploadPart('listings-media', path, stream(first), 'image/png', data.length, 0)).toMatchObject({ complete: false, nextPart: 1 })
  await storage.uploadPart('listings-media', path, stream(last), 'image/png', data.length, 1)
  expect(await storage.uploadPart('listings-media', path, stream(first), 'image/png', data.length, 0)).toMatchObject({ complete: true, nextPart: 2 })
  expect(table('rentral_media.chunks').size).toBe(13); expect(table('rentral_media.files').size).toBe(1)
 })
 it('rejects changed retried bytes and later parts before the first part', async () => {
  const data = input()
  await expect(storage.uploadPart('listings-media', path, stream(data.subarray(UPLOAD_PART_BYTES)), 'image/png', data.length, 1)).rejects.toMatchObject({ code: 'UPLOAD_PART_ORDER' })
  await storage.uploadPart('listings-media', path, stream(data.subarray(0, UPLOAD_PART_BYTES)), 'image/png', data.length, 0)
  data[100] = 9
  await expect(storage.uploadPart('listings-media', path, stream(data.subarray(0, UPLOAD_PART_BYTES)), 'image/png', data.length, 0)).rejects.toMatchObject({ code: 'UPLOAD_PART_CONFLICT' })
  expect([...table('MediaBlob').values()][0].next_part).toBe(1)
 })
 it('bounds actual bytes and rejects short or excessive declared sizes before any publication', async () => {
  await expect(storage.uploadPart('listings-media', path, stream(png), 'image/png', png.length + 1, 0)).rejects.toMatchObject({ code: 'UPLOAD_PART_INCOMPLETE' })
  await expect(storage.uploadPart('listings-media', path, stream(png), 'image/png', png.length - 1, 0)).rejects.toMatchObject({ code: 'UPLOAD_PART_TOO_LARGE' })
  await expect(storage.uploadPart('listings-media', path, stream(png), 'image/png', 11 * 1024 * 1024, 0)).rejects.toMatchObject({ code: 'INVALID_UPLOAD_PART' })
  expect(table('rentral_media.files').size).toBe(0)
 })
 it('retains finalized bytes after a lost head acknowledgement and permanently rejects deleted paths', async () => {
  state.lostAck = true
  expect(await storage.uploadPart('listings-media', path, stream(png), 'image/png', png.length, 0)).toMatchObject({ complete: true })
  await storage.remove('listings-media', path)
  await expect(storage.uploadPart('listings-media', path, stream(png), 'image/png', png.length, 0)).rejects.toMatchObject({ code: 'FILE_NAME_USED' })
 })
})

