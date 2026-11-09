import { createLocalStorage, defaultStorageDirectory } from './core'
import { storageBucket, storageFailure, storagePath, StorageError } from './policy'
import { signedStorageUrl, storageFileUrl } from './urls'
import { uploadStoredObject, removeStoredObjects } from '@/lib/storage-claims/service'

type UploadBody = Blob | ArrayBuffer | Uint8Array
function streamBody(body: UploadBody): ReadableStream<Uint8Array> {
  if (body instanceof Blob) return body.stream()
  const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : body
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } })
}

/** Server-only adapter. Callers must authorize the actor before requesting a signed link. */
export function createStorageAdmin() {
  const storage = createLocalStorage(defaultStorageDirectory())
  return { storage: { from(value: string) {
    const bucket = storageBucket(value)
    return {
      async upload(path: string, body: UploadBody, options?: { contentType?: string; upsert?: boolean; cacheControl?: string }) {
        try { return { data: await uploadStoredObject(storagePath(bucket, path)[0], bucket, path, streamBody(body), options?.contentType ?? (body instanceof Blob ? body.type : null)), error: null } }
        catch (error) { return { data: null, error: storageFailure(error) } }
      },
      async info(path: string) {
        try { return { data: await storage.info(bucket, path), error: null } }
        catch (error) { return { data: null, error: storageFailure(error) } }
      },
      async download(path: string) {
        try { return { data: await storage.download(bucket, path), error: null } }
        catch (error) { return { data: null, error: storageFailure(error) } }
      },
      async stream(path: string, range?: { start: number; end: number }) {
        try { return { data: await storage.stream(bucket, path, range), error: null } }
        catch (error) { return { data: null, error: storageFailure(error) } }
      },
      async remove(paths: string[]) {
        try {
          if (paths.length > 100) throw new StorageError(400, 'INVALID_REQUEST', 'Remove at most 100 files at a time.')
          for (const path of paths) storagePath(bucket, path)
          const byOwner = new Map<string, string[]>()
          for (const path of paths) { const owner = storagePath(bucket, path)[0]; byOwner.set(owner, [...(byOwner.get(owner) ?? []), path]) }
          for (const [owner, owned] of byOwner) await removeStoredObjects(owner, bucket, owned)
          return { data: paths.map(name => ({ name })), error: null }
        } catch (error) { return { data: null, error: storageFailure(error) } }
      },
      async list(prefix = '', options?: { limit?: number }) {
        try { return { data: await storage.list(bucket, prefix, options?.limit), error: null } }
        catch (error) { return { data: null, error: storageFailure(error) } }
      },
      async createSignedUrl(path: string, expiresIn = 300) {
        try { await storage.info(bucket, path); return { data: { signedUrl: await signedStorageUrl(bucket, path, expiresIn) }, error: null } }
        catch (error) { return { data: null, error: storageFailure(error) } }
      },
      getPublicUrl(path: string) {
        if (bucket !== 'profile-avatars') throw new StorageError(403, 'FORBIDDEN', 'This file area is private.')
        return { data: { publicUrl: storageFileUrl(bucket, path) } }
      },
    }
  } } }
}
