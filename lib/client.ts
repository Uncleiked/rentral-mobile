import type { AuthUser } from '@/lib/auth/types'
import { storageBucket, storagePath } from '@/lib/local-storage/policy'

type UploadBody = Blob | ArrayBuffer
type UploadOptions = { contentType?: string; upsert?: boolean; cacheControl?: string }

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<{ data: T | null; error: Error | null }> {
  try {
    const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store' })
    const envelope: unknown = await response.json()
    if (!response.ok || !envelope || typeof envelope !== 'object' || !('success' in envelope) || envelope.success !== true || !('data' in envelope)) {
      const message = envelope && typeof envelope === 'object' && 'error' in envelope && typeof envelope.error === 'string' ? envelope.error : 'This request could not be completed.'
      return { data: null, error: new Error(message) }
    }
    // The same-origin server owns the versioned JSON response contract.
    return { data: envelope.data as T, error: null }
  } catch { return { data: null, error: new Error('Could not reach Rentral. Please check your connection and try again.') } }
}

export function createClient() {
  async function getUser() {
    const result = await jsonRequest<{ user: AuthUser | null }>('/api/v1/auth/web-session')
    return { data: { user: result.data?.user ?? null }, error: result.error }
  }
  return {
    auth: {
      getUser,
      async getSession() { const result = await getUser(); return { data: { session: result.data.user ? { user: result.data.user } : null }, error: result.error } },
      async signOut() { const result = await jsonRequest<{ signedOut: boolean }>('/api/v1/auth/web-session', { method: 'DELETE' }); return { error: result.error } },
      async signInWithOAuth(input: unknown) { void input; return { error: new Error('Use your email and password to sign in.') } },
    },
    storage: { from(value: string) {
      const bucket = storageBucket(value)
      const endpoint = `/api/v1/uploads/${bucket}`
      return {
        async upload(path: string, body: UploadBody, options?: UploadOptions) {
          try {
            storagePath(bucket, path)
            return await jsonRequest<{ path: string }>(endpoint, { method: 'POST', headers: { 'X-Upload-Path': path, 'Content-Type': options?.contentType ?? (body instanceof Blob ? body.type : 'application/octet-stream') }, body })
          } catch { return { data: null, error: new Error('The upload path is invalid. Please choose the file again.') } }
        },
        async remove(paths: string[]) { return jsonRequest<{ name: string }[]>(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }) }) },
        async list(prefix = '', options?: { limit?: number }) { return jsonRequest<{ name: string; id: string | null; metadata: { size: number; mimetype: string } | null }[]>(`${endpoint}?${new URLSearchParams({ prefix, limit: String(options?.limit ?? 100) })}`) },
        getPublicUrl(path: string) {
          if (bucket !== 'profile-avatars') throw new Error('This file area is private.')
          storagePath(bucket, path)
          const relative = `/api/v1/files/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
          return { data: { publicUrl: relative } }
        },
      }
    } },
  }
}
