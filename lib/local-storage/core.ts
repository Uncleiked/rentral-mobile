import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, readdir, unlink, link } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { StorageError, storagePath, storagePrefix, uploadPolicy, verifyUploadBytes, type StorageBucket } from './policy'

type ObjectMetadata = { contentType: string; size: number; createdAt: string; digest: string }
const NOFOLLOW = constants.O_NOFOLLOW ?? 0
const METADATA_SUFFIX = '.metadata.json'

export function createLocalStorage(rootDirectory: string) {
  const root = resolve(rootDirectory)
  function inside(path: string): void {
    const part = relative(root, path)
    if (part.startsWith(`..${sep}`) || part === '..' || isAbsolute(part)) throw new StorageError(400, 'INVALID_PATH', 'This file path is invalid.')
  }
  async function directory(parts: string[], create: boolean): Promise<string> {
    if (create) await mkdir(root, { recursive: true, mode: 0o700 })
    const rootStat = await lstat(root)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new StorageError(403, 'UNSAFE_PATH', 'This file area is unavailable.')
    const realRoot = await realpath(root)
    let current = root
    for (const part of parts) {
      current = join(current, part); inside(current)
      if (create) { try { await mkdir(current, { mode: 0o700 }) } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error } }
      const stat = await lstat(current)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new StorageError(403, 'UNSAFE_PATH', 'This file area is unavailable.')
      const canonical = await realpath(current)
      const rel = relative(realRoot, canonical)
      if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new StorageError(403, 'UNSAFE_PATH', 'This file area is unavailable.')
    }
    return current
  }
  async function objectPath(bucket: StorageBucket, path: string, create = false): Promise<string> {
    const parts = storagePath(bucket, path)
    const parent = await directory([bucket, ...parts.slice(0, -1)], create)
    return join(parent, parts[parts.length - 1])
  }
  async function regular(path: string): Promise<void> {
    inside(path)
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new StorageError(403, 'UNSAFE_PATH', 'This file is unavailable.')
  }
  async function deletedMarker(bucket: StorageBucket, path: string, create: boolean): Promise<string> {
    const folder = await directory(['.deleted'], create)
    // Case folding also covers NTFS aliases (a.MOV and a.mov name one file).
    return join(folder, createHash('sha256').update(`${bucket}\0${path.toLowerCase()}`).digest('hex'))
  }
  async function rejectDeleted(bucket: StorageBucket, path: string): Promise<void> {
    try {
      await lstat(await deletedMarker(bucket, path, false))
      throw new StorageError(409, 'FILE_NAME_USED', 'This filename was already used. Upload the new recording or photo with a new filename.')
    } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error }
  }
  async function metadata(bucket: StorageBucket, path: string): Promise<{ path: string; info: ObjectMetadata }> {
    const full = await objectPath(bucket, path)
    await regular(full); await regular(full + METADATA_SUFFIX)
    const handle = await open(full + METADATA_SUFFIX, constants.O_RDONLY | NOFOLLOW)
    let value: unknown
    try {
      if ((await handle.stat()).size > 4096) throw new StorageError(404, 'NOT_FOUND', 'This file is unavailable.')
      value = JSON.parse(await handle.readFile({ encoding: 'utf8' }))
    } finally { await handle.close() }
    if (!value || typeof value !== 'object' || !('contentType' in value) || typeof value.contentType !== 'string' || !('size' in value) || typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size <= 0 || !('createdAt' in value) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !('digest' in value) || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest)) throw new StorageError(404, 'NOT_FOUND', 'This file is unavailable.')
    const policy = uploadPolicy(bucket, path, value.contentType)
    if (value.size > policy.maximumBytes || (await lstat(full)).size !== value.size) throw new StorageError(404, 'NOT_FOUND', 'This file is unavailable.')
    const dataHandle = await open(full, constants.O_RDONLY | NOFOLLOW)
    try {
      const header = new Uint8Array(Math.min(64, value.size))
      const result = await dataHandle.read(header, 0, header.length, 0)
      verifyUploadBytes(value.contentType, header.subarray(0, result.bytesRead))
    } finally { await dataHandle.close() }
    return { path: full, info: { contentType: value.contentType, size: value.size, createdAt: value.createdAt, digest: value.digest } }
  }
  async function safeUnlink(path: string): Promise<void> {
    inside(path)
    try { await unlink(path) } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error }
  }

  return {
    async upload(bucket: StorageBucket, path: string, body: ReadableStream<Uint8Array> | null, contentType: string | null): Promise<{ path: string }> {
      const policy = uploadPolicy(bucket, path, contentType)
      if (!body) throw new StorageError(400, 'EMPTY_FILE', 'Choose a non-empty file.')
      const target = await objectPath(bucket, path, true)
      await rejectDeleted(bucket, path)
      const temporary = join(resolve(target, '..'), `.upload-${randomUUID()}`)
      inside(temporary)
      const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600)
      const reader = body.getReader()
      const digest = createHash('sha256')
      let size = 0
      let header = new Uint8Array(0)
      let verified = false
      let linked = false
      let metaLinked = false
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          size += chunk.value.byteLength
          if (size > policy.maximumBytes) throw new StorageError(413, 'FILE_TOO_LARGE', `This file exceeds the ${Math.floor(policy.maximumBytes / 1048576)}MB limit.`)
          if (header.length < 64) {
            const next = new Uint8Array(Math.min(64, header.length + chunk.value.byteLength))
            next.set(header); next.set(chunk.value.subarray(0, next.length - header.length), header.length); header = next
          }
          if (!verified && header.length >= 32) { verifyUploadBytes(policy.contentType, header); verified = true }
          digest.update(chunk.value)
          await handle.writeFile(chunk.value)
        }
        if (!size) throw new StorageError(400, 'EMPTY_FILE', 'Choose a non-empty file.')
        if (!verified) verifyUploadBytes(policy.contentType, header)
        await handle.sync(); await handle.close()
        // Link is exclusive: immutable objects cannot overwrite existing media.
        await rejectDeleted(bucket, path)
        await link(temporary, target); linked = true
        await rejectDeleted(bucket, path)
        const meta = await open(temporary + METADATA_SUFFIX, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600)
        try { await meta.writeFile(JSON.stringify({ contentType: policy.contentType, size, createdAt: new Date().toISOString(), digest: digest.digest('hex') })); await meta.sync() } finally { await meta.close() }
        await link(temporary + METADATA_SUFFIX, target + METADATA_SUFFIX); metaLinked = true
        return { path }
      } catch (error) {
        await reader.cancel().catch(() => undefined)
        if (linked && !metaLinked) await safeUnlink(target)
        throw error
      } finally {
        await handle.close().catch(() => undefined)
        reader.releaseLock()
        await Promise.allSettled([safeUnlink(temporary), safeUnlink(temporary + METADATA_SUFFIX)])
      }
    },
    async info(bucket: StorageBucket, path: string): Promise<ObjectMetadata> { return (await metadata(bucket, path)).info },
    async download(bucket: StorageBucket, path: string): Promise<Blob> {
      const object = await metadata(bucket, path)
      const handle = await open(object.path, constants.O_RDONLY | NOFOLLOW)
      try { return new Blob([new Uint8Array(await handle.readFile())], { type: object.info.contentType }) } finally { await handle.close() }
    },
    async stream(bucket: StorageBucket, path: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>> {
      const object = await metadata(bucket, path)
      const handle = await open(object.path, constants.O_RDONLY | NOFOLLOW)
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size !== object.info.size) { await handle.close(); throw new StorageError(404, 'NOT_FOUND', 'This file is unavailable.') }
      // Node's stream bridge emits the file's Uint8Array/Buffer chunks.
      return Readable.toWeb(handle.createReadStream({ start: range?.start ?? 0, ...(range ? { end: range.end } : {}), autoClose: true })) as ReadableStream<Uint8Array>
    },
    async remove(bucket: StorageBucket, path: string): Promise<void> {
      let full: string
      try { full = await objectPath(bucket, path); await regular(full) }
      catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return; throw error }
      // A private, hashed tombstone prevents delete/re-upload from replacing a
      // walkthrough while its old listing/GPS reference remains unchanged.
      try { const marker = await open(await deletedMarker(bucket, path, true), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600); await marker.close() }
      catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error }
      await safeUnlink(full); await safeUnlink(full + METADATA_SUFFIX)
    },
    async list(bucket: StorageBucket, prefix = '', limit = 100): Promise<{ name: string; id: string | null; metadata: { size: number; mimetype: string } | null; created_at?: string }[]> {
      const parts = storagePrefix(bucket, prefix)
      let folder: string
      try { folder = await directory([bucket, ...parts], false) }
      catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return []; throw error }
      const entries = await readdir(folder, { withFileTypes: true })
      const results: { name: string; id: string | null; metadata: { size: number; mimetype: string } | null; created_at?: string }[] = []
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (results.length >= Math.min(100, Math.max(1, limit))) break
        if (entry.isSymbolicLink() || entry.name.startsWith('.') || entry.name.endsWith(METADATA_SUFFIX)) continue
        if (entry.isDirectory()) { results.push({ name: entry.name, id: null, metadata: null }); continue }
        const path = [...parts, entry.name].join('/')
        const object = await metadata(bucket, path)
        results.push({ name: entry.name, id: path, metadata: { size: object.info.size, mimetype: object.info.contentType }, created_at: object.info.createdAt })
      }
      return results
    },
  }
}

export function defaultStorageDirectory(): string { return process.env.RENTRAL_STORAGE_DIR ? resolve(process.env.RENTRAL_STORAGE_DIR) : resolve(process.cwd(), 'storage') }
