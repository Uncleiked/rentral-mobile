import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { setTimeout as nodeSetTimeout, clearTimeout as nodeClearTimeout } from 'node:timers'
import { Binary, GridFSBucket, ObjectId, type Db, type GridFSFile } from 'mongodb'
import type { ObjectMetadata } from './core.ts'
import { uploadMongoPart } from './mongodb-parts.ts'
import { StorageError, storagePath, storagePrefix, uploadPolicy, verifyUploadBytes, type StorageBucket } from './policy.ts'

const CHUNK_BYTES = 255 * 1024, BUFFERED_LIMIT = 16 * 1024 * 1024, OPERATION_MS = 10000, UPLOAD_MS = 180000
const GRIDFS = 'rentral_media'
type Head = { _id: string; bucket: StorageBucket; path: string; canonical_path: string; state: 'uploading' | 'available' | 'deleted'; file_id?: ObjectId; content_type?: string; size_bytes?: number; digest?: string; created_at: Date; updated_at: Date }
type Chunk = { _id: ObjectId; files_id: ObjectId; n: number; data: Buffer | Binary }
const options = { timeoutMS: OPERATION_MS }
const identity = (bucket: StorageBucket, path: string) => createHash('sha256').update(bucket + '\0' + path.toLowerCase()).digest('hex')
const missing = () => new StorageError(404, 'NOT_FOUND', 'This file is unavailable.')
const used = () => new StorageError(409, 'FILE_NAME_USED', 'This filename was already used. Choose a new filename for another file.')
function duplicate(error: unknown): boolean { return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000) }
function bytes(value: unknown): Uint8Array { const data = value instanceof Binary ? value.buffer : value; if (!(data instanceof Uint8Array)) throw missing(); return data }
function uploadOptions(deadline: number) {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new StorageError(408, 'UPLOAD_TIMEOUT', 'The upload timed out. Check its saved state before trying again.')
  return { timeoutMS: Math.min(OPERATION_MS, remaining) }
}
function downloadStream(db: Db, fileId: ObjectId, range?: { start: number; end: number }) {
  // GridFS end is exclusive; the shared HTTP contract uses an inclusive end.
  const stream = new GridFSBucket(db, { bucketName: GRIDFS }).openDownloadStream(fileId, { start: range?.start ?? 0, ...(range ? { end: range.end + 1 } : {}) })
  // The installed driver's read-stream timeoutMS is deprecated and ignored.
  const timer = nodeSetTimeout(() => stream.destroy(new StorageError(408, 'DOWNLOAD_TIMEOUT', 'The file transfer timed out. Please try again.')), UPLOAD_MS)
  stream.once('end', () => nodeClearTimeout(timer)); stream.once('close', () => nodeClearTimeout(timer))
  return stream
}
async function readWithin(reader: ReadableStreamDefaultReader<Uint8Array>, deadline: number): Promise<ReadableStreamReadResult<Uint8Array>> {
  const remaining = uploadOptions(deadline).timeoutMS
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StorageError(408, 'UPLOAD_TIMEOUT', 'The upload timed out. Check its saved state before trying again.')), remaining) })]) }
  finally { clearTimeout(timer) }
}

/** GridFS-spec writes avoid the driver's automatic index-creation path.
 * Runtime only uses already-prepared collections; setup/readiness is owned elsewhere. */
export function createMongoStorage(database: () => Promise<Db>) {
  async function collections() { const db = await database(); return { db, heads: db.collection<Head>('MediaBlob'), files: db.collection<GridFSFile>(GRIDFS + '.files'), chunks: db.collection<Chunk>(GRIDFS + '.chunks') } }
  async function object(bucket: StorageBucket, path: string) {
    storagePath(bucket, path)
    const c = await collections(), head = await c.heads.findOne({ _id: identity(bucket, path) }, options)
    if (!head || head.state !== 'available' || head.bucket !== bucket || head.canonical_path !== path.toLowerCase() || head.path.toLowerCase() !== path.toLowerCase()
      || !(head.file_id instanceof ObjectId) || !head.content_type || !head.digest || !/^[a-f0-9]{64}$/.test(head.digest) || !Number.isSafeInteger(head.size_bytes) || !head.size_bytes || head.size_bytes <= 0
      || !(head.created_at instanceof Date) || !Number.isFinite(head.created_at.getTime())) throw missing()
    const policy = uploadPolicy(bucket, head.path, head.content_type)
    if (head.size_bytes > policy.maximumBytes) throw missing()
    const file = await c.files.findOne({ _id: head.file_id }, options)
    if (!file || file.length !== head.size_bytes || file.chunkSize !== CHUNK_BYTES || file.filename !== bucket + '/' + head.path || file.metadata?.bucket !== bucket
      || file.metadata.path !== head.path || file.metadata.digest !== head.digest || file.metadata.contentType !== head.content_type) throw missing()
    const first = await c.chunks.findOne({ files_id: head.file_id, n: 0 }, options)
    if (!first) throw missing()
    const data = bytes(first.data)
    if (data.byteLength !== Math.min(CHUNK_BYTES, head.size_bytes)) throw missing()
    verifyUploadBytes(head.content_type, data.subarray(0, 64))
    const info: ObjectMetadata = { contentType: head.content_type, size: head.size_bytes, digest: head.digest, createdAt: head.created_at.toISOString() }
    return { ...c, head, info }
  }
  async function clean(c: Awaited<ReturnType<typeof collections>>, fileId: ObjectId): Promise<void> {
    await c.files.deleteOne({ _id: fileId }, options)
    await c.chunks.deleteMany({ files_id: fileId }, options)
  }
  return {
    uploadPart: (bucket: StorageBucket, path: string, body: ReadableStream<Uint8Array> | null, contentType: string | null, total: number, part: number) => uploadMongoPart(database, bucket, path, body, contentType, total, part),
    async upload(bucket: StorageBucket, path: string, body: ReadableStream<Uint8Array> | null, suppliedType: string | null): Promise<{ path: string }> {
      const policy = uploadPolicy(bucket, path, suppliedType)
      if (!body) throw new StorageError(400, 'EMPTY_FILE', 'Choose a non-empty file.')
      const c = await collections(), id = identity(bucket, path), fileId = new ObjectId(), now = new Date()
      const head: Head = { _id: id, bucket, path, canonical_path: path.toLowerCase(), state: 'uploading', file_id: fileId, content_type: policy.contentType, created_at: now, updated_at: now }
      try { await c.heads.insertOne(head, options) }
      catch (error) { if (duplicate(error)) { const existing = await c.heads.findOne({ _id: id }, options); if (existing?.state === 'deleted') throw used(); throw new StorageError(409, 'FILE_EXISTS', 'This filename is already used or uploading. Check the original file before retrying.') } throw error }
      const reader = body.getReader(), hash = createHash('sha256'), deadline = Date.now() + UPLOAD_MS
      let size = 0, index = 0, buffer = Buffer.allocUnsafe(CHUNK_BYTES), filled = 0, header = Buffer.alloc(0), digest: string | null = null
      try {
        while (true) {
          const chunk = await readWithin(reader, deadline)
          if (chunk.done) break
          if (!(chunk.value instanceof Uint8Array)) throw new StorageError(400, 'INVALID_FILE', 'The upload stream is invalid.')
          size += chunk.value.byteLength
          if (size > policy.maximumBytes) throw new StorageError(413, 'FILE_TOO_LARGE', 'This file exceeds its upload limit.')
          if (header.length < 64) header = Buffer.concat([header, Buffer.from(chunk.value.subarray(0, 64 - header.length))])
          if (header.length >= 32) verifyUploadBytes(policy.contentType, header)
          hash.update(chunk.value)
          let offset = 0
          while (offset < chunk.value.byteLength) {
            const length = Math.min(CHUNK_BYTES - filled, chunk.value.byteLength - offset)
            buffer.set(chunk.value.subarray(offset, offset + length), filled); filled += length; offset += length
            if (filled === CHUNK_BYTES) { await c.chunks.insertOne({ _id: new ObjectId(), files_id: fileId, n: index++, data: buffer }, uploadOptions(deadline)); buffer = Buffer.allocUnsafe(CHUNK_BYTES); filled = 0 }
          }
        }
        if (!size) throw new StorageError(400, 'EMPTY_FILE', 'Choose a non-empty file.')
        verifyUploadBytes(policy.contentType, header)
        if (filled) await c.chunks.insertOne({ _id: new ObjectId(), files_id: fileId, n: index, data: buffer.subarray(0, filled) }, uploadOptions(deadline))
        digest = hash.digest('hex')
        await c.files.insertOne({ _id: fileId, length: size, chunkSize: CHUNK_BYTES, uploadDate: new Date(), filename: bucket + '/' + path,
          metadata: { bucket, path, digest, contentType: policy.contentType } }, uploadOptions(deadline))
        const published = await c.heads.updateOne({ _id: id, state: 'uploading', file_id: fileId }, { $set: { state: 'available', digest, size_bytes: size, updated_at: new Date() } }, uploadOptions(deadline))
        if (published.modifiedCount !== 1) throw used()
        return { path }
      } catch (error) {
        await reader.cancel().catch(() => undefined)
        // Never delete a successfully published object after a lost acknowledgement.
        let current: Head | null
        try { current = await c.heads.findOne({ _id: id }, options) } catch { throw error }
        if (current?.state === 'available') {
          if (current.file_id?.equals(fileId) && digest && current.digest === digest && current.size_bytes === size) return { path }
          throw error
        }
        const stopped = await c.heads.updateOne({ _id: id, file_id: fileId, state: 'uploading' }, { $set: { state: 'deleted', updated_at: new Date() } }, options).catch(() => null)
        if (stopped?.modifiedCount === 1 || current?.state === 'deleted') await clean(c, fileId).catch(() => undefined)
        throw error
      } finally { reader.releaseLock() }
    },
    async info(bucket: StorageBucket, path: string): Promise<ObjectMetadata> { return (await object(bucket, path)).info },
    async stream(bucket: StorageBucket, path: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>> {
      const source = await object(bucket, path)
      if (range && (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start || range.end >= source.info.size)) throw new StorageError(416, 'INVALID_RANGE', 'This byte range is unavailable.')
      return Readable.toWeb(downloadStream(source.db, source.head.file_id!, range)) as ReadableStream<Uint8Array>
    },
    async download(bucket: StorageBucket, path: string): Promise<Blob> {
      const source = await object(bucket, path)
      if (source.info.size > BUFFERED_LIMIT) throw new StorageError(413, 'STREAM_REQUIRED', 'Use streaming playback for this large file.')
      const stream = downloadStream(source.db, source.head.file_id!)
      const parts: Buffer[] = []; let size = 0; const hash = createHash('sha256')
      try {
        for await (const value of stream) { const part = Buffer.from(bytes(value)); size += part.length; if (size > source.info.size || size > BUFFERED_LIMIT) throw missing(); hash.update(part); parts.push(part) }
        if (size !== source.info.size || hash.digest('hex') !== source.info.digest) throw missing()
        return new Blob([new Uint8Array(Buffer.concat(parts, size))], { type: source.info.contentType })
      } catch (error) { stream.destroy(); throw error }
    },
    async remove(bucket: StorageBucket, path: string): Promise<void> {
      storagePath(bucket, path)
      const c = await collections(), id = identity(bucket, path), now = new Date()
      await c.heads.updateOne({ _id: id, bucket, canonical_path: path.toLowerCase() }, { $set: { state: 'deleted', updated_at: now }, $setOnInsert: { bucket, path, canonical_path: path.toLowerCase(), created_at: now } }, { ...options, upsert: true })
      const head = await c.heads.findOne({ _id: id }, options)
      if (head?.state !== 'deleted' || head.bucket !== bucket || head.canonical_path !== path.toLowerCase()) throw missing()
      if (head.file_id) await clean(c, head.file_id)
    },
    async list(bucket: StorageBucket, prefix = '', limit = 100): Promise<{ name: string; id: string | null; metadata: { size: number; mimetype: string } | null; created_at?: string }[]> {
      const parts = storagePrefix(bucket, prefix), start = parts.length ? parts.join('/').toLowerCase() + '/' : '', count = Math.min(100, Math.max(1, Math.trunc(limit)))
      if (!Number.isFinite(count)) throw new StorageError(400, 'INVALID_REQUEST', 'Choose a valid file limit.')
      const c = await collections(), offset = start.length
      const result = await c.heads.aggregate<{ name: string; path: string }>([
        { $match: { bucket, state: 'available', canonical_path: { $gte: start, $lt: start + '\uffff' } } },
        { $project: { path: 1, part: { $arrayElemAt: [{ $split: [{ $substrCP: ['$path', offset, { $subtract: [{ $strLenCP: '$path' }, offset] }] }, '/'] }, 0] } } },
        { $group: { _id: { $toLower: '$part' }, name: { $first: '$part' }, path: { $first: '$path' } } }, { $sort: { _id: 1 } }, { $limit: count }, { $project: { _id: 0, name: 1, path: 1 } },
      ], { maxTimeMS: OPERATION_MS }).toArray()
      const leaf = parts.length === (bucket === 'profile-avatars' ? 1 : 2)
      const output: { name: string; id: string | null; metadata: { size: number; mimetype: string } | null; created_at?: string }[] = []
      for (const row of result) {
        if (!leaf) { output.push({ name: row.name, id: null, metadata: null }); continue }
        const info = await this.info(bucket, row.path)
        output.push({ name: row.name, id: row.path, metadata: { size: info.size, mimetype: info.contentType }, created_at: info.createdAt })
      }
      return output
    },
  }
}

