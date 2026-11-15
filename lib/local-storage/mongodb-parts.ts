import { createHash } from 'node:crypto'
import { Binary, ObjectId, type Db, type GridFSFile } from 'mongodb'
import { UPLOAD_PART_BYTES, type UploadPartResult } from '../contracts/upload-transport.ts'
import { StorageError, uploadPolicy, verifyUploadBytes, type StorageBucket } from './policy.ts'
const CHUNK = 261120, GRIDFS = 'rentral_media', options = { timeoutMS: 10000 }
type Head = { _id: string; bucket: StorageBucket; path: string; canonical_path: string; state: 'uploading' | 'available' | 'deleted'; file_id?: ObjectId; content_type?: string; size_bytes?: number; digest?: string; created_at: Date; updated_at: Date; protocol?: 'chunked-v1'; declared_size?: number; next_part?: number; received_bytes?: number }
type Chunk = { _id: ObjectId; files_id: ObjectId; n: number; data: Buffer | Binary }
const conflict = () => new StorageError(409, 'UPLOAD_PART_CONFLICT', 'This upload part does not match the original file. Keep the saved upload and choose the original file.')
const unavailable = () => new StorageError(409, 'FILE_NAME_USED', 'This upload path is no longer available. Check its saved state before choosing a new file path.')
const duplicate = (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000)
function bytes(value: unknown): Buffer { const data = value instanceof Binary ? value.buffer : value; if (!(data instanceof Uint8Array)) throw conflict(); return Buffer.from(data.buffer, data.byteOffset, data.byteLength) }
async function partBytes(body: ReadableStream<Uint8Array> | null, expected: number): Promise<Buffer> {
 if (!body) throw new StorageError(400, 'EMPTY_FILE', 'Supply the original file part.')
 const reader = body.getReader(), output = Buffer.allocUnsafe(expected), deadline = Date.now() + 60000; let count = 0
 try { while (true) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const remaining = deadline - Date.now(); if (remaining <= 0) throw new StorageError(408, 'UPLOAD_TIMEOUT', 'The upload part timed out. Check its saved state before retrying.')
  let value: ReadableStreamReadResult<Uint8Array>
  try { value = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StorageError(408, 'UPLOAD_TIMEOUT', 'The upload part timed out. Check its saved state before retrying.')), remaining) })]) } finally { clearTimeout(timer) }
  if (value.done) break
  if (!(value.value instanceof Uint8Array) || count + value.value.byteLength > expected) throw new StorageError(413, 'UPLOAD_PART_TOO_LARGE', 'This upload part exceeds the expected size.')
  output.set(value.value, count); count += value.value.byteLength
 } if (count !== expected) throw new StorageError(400, 'UPLOAD_PART_INCOMPLETE', 'Send the complete original file part.'); return output
 } catch (error) { await reader.cancel().catch(() => undefined); throw error } finally { reader.releaseLock() }
}
/** Explicitly retried HTTP parts are immutable and compared byte-for-byte.
 * The unique files_id/n index arbitrates concurrent acknowledgements without DDL. */
export async function uploadMongoPart(database: () => Promise<Db>, bucket: StorageBucket, path: string, body: ReadableStream<Uint8Array> | null, contentType: string | null, total: number, part: number): Promise<UploadPartResult> {
 const policy = uploadPolicy(bucket, path, contentType), parts = Math.ceil(total / UPLOAD_PART_BYTES)
 if (!Number.isSafeInteger(total) || total <= 0 || total > policy.maximumBytes || !Number.isSafeInteger(part) || part < 0 || part >= parts) throw new StorageError(400, 'INVALID_UPLOAD_PART', 'Check the original upload size and part number.')
 const input = await partBytes(body, Math.min(UPLOAD_PART_BYTES, total - part * UPLOAD_PART_BYTES))
 if (part === 0) verifyUploadBytes(policy.contentType, input.subarray(0, 64))
 const db = await database(), heads = db.collection<Head>('MediaBlob'), chunks = db.collection<Chunk>(GRIDFS + '.chunks'), files = db.collection<GridFSFile>(GRIDFS + '.files')
 const id = createHash('sha256').update(bucket + '\0' + path.toLowerCase()).digest('hex')
 let head = await heads.findOne({ _id: id }, options)
 if (!head) {
  if (part !== 0) throw new StorageError(409, 'UPLOAD_PART_ORDER', 'Resume from the original first file part.')
  const now = new Date(), initial: Head = { _id: id, bucket, path, canonical_path: path.toLowerCase(), state: 'uploading', file_id: new ObjectId(), content_type: policy.contentType, protocol: 'chunked-v1', declared_size: total, next_part: 0, received_bytes: 0, created_at: now, updated_at: now }
  try { await heads.insertOne(initial, options); head = initial } catch (error) { if (!duplicate(error)) throw error; head = await heads.findOne({ _id: id }, options) }
 }
 if (!head || head.state === 'deleted') throw unavailable()
 if (head.protocol !== 'chunked-v1' || head.bucket !== bucket || head.canonical_path !== path.toLowerCase() || head.path.toLowerCase() !== path.toLowerCase() || head.content_type !== policy.contentType || head.declared_size !== total || !(head.file_id instanceof ObjectId) || !Number.isSafeInteger(head.next_part) || head.next_part! < 0 || head.next_part! > parts) throw conflict()
 if (part > head.next_part!) throw new StorageError(409, 'UPLOAD_PART_ORDER', 'Resume from the last confirmed file part.')
 const fileId = head.file_id
 for (let offset = 0, n = part * 12; offset < input.length; offset += CHUNK, n += 1) {
  const data = input.subarray(offset, Math.min(input.length, offset + CHUNK)); let existing = await chunks.findOne({ files_id: fileId, n }, options)
  if (!existing) {
   if (head.state !== 'uploading') throw conflict()
   try { await chunks.insertOne({ _id: new ObjectId(), files_id: fileId, n, data }, options) } catch (error) { if (!duplicate(error)) throw error; existing = await chunks.findOne({ files_id: fileId, n }, options); if (!existing) throw conflict() }
  }
  if (existing && !bytes(existing.data).equals(data)) throw conflict()
 }
 if (head.state === 'uploading' && head.next_part === part) await heads.updateOne({ _id: id, state: 'uploading', file_id: fileId, next_part: part }, { $set: { next_part: part + 1, received_bytes: Math.min(total, (part + 1) * UPLOAD_PART_BYTES), updated_at: new Date() } }, options)
 head = await heads.findOne({ _id: id }, options)
 if (!head || head.state === 'deleted' || !head.file_id?.equals(fileId)) { await chunks.deleteMany({ files_id: fileId }, options).catch(() => undefined); throw unavailable() }
 if (head.next_part !== parts) return { path, complete: false, nextPart: head.next_part! }
 if (head.state !== 'available') {
  const cursor = chunks.find({ files_id: fileId }, { sort: { n: 1 }, batchSize: 12, timeoutMS: 180000 }), hash = createHash('sha256'); let size = 0, n = 0
  try { while (true) {
   const chunk = await cursor.next(); if (!chunk) break
   const data = bytes(chunk.data), expected = Math.min(CHUNK, total - size)
   if (chunk.n !== n || expected <= 0 || data.length !== expected) throw conflict()
   if (n === 0) verifyUploadBytes(policy.contentType, data.subarray(0, 64))
   hash.update(data); size += data.length; n += 1
  } } finally { await cursor.close() }
  if (size !== total) throw conflict()
  const digest = hash.digest('hex'), file: GridFSFile = { _id: fileId, length: total, chunkSize: CHUNK, uploadDate: new Date(), filename: bucket + '/' + head.path, metadata: { bucket, path: head.path, digest, contentType: policy.contentType } }
  try { await files.insertOne(file, options) } catch (error) {
   if (!duplicate(error)) throw error
   const existing = await files.findOne({ _id: fileId }, options)
   if (!existing || existing.length !== total || existing.chunkSize !== CHUNK || existing.filename !== file.filename || existing.metadata?.digest !== digest || existing.metadata?.path !== head.path || existing.metadata?.contentType !== policy.contentType) throw conflict()
  }
  try { await heads.updateOne({ _id: id, state: 'uploading', file_id: fileId, next_part: parts }, { $set: { state: 'available', digest, size_bytes: total, updated_at: new Date() } }, options) } catch (error) {
   const current = await heads.findOne({ _id: id }, options).catch(() => null)
   if (current?.state !== 'available' || current.digest !== digest || current.size_bytes !== total || !current.file_id?.equals(fileId)) throw error
  }
  head = await heads.findOne({ _id: id }, options)
 }
 if (head?.state !== 'available' || !head.file_id?.equals(fileId) || head.size_bytes !== total || !head.digest) {
  if (head?.state === 'deleted') { await files.deleteOne({ _id: fileId }, options).catch(() => undefined); await chunks.deleteMany({ files_id: fileId }, options).catch(() => undefined) }
  throw unavailable()
 }
 return { path, complete: true, nextPart: parts }
}
