import { File } from 'expo-file-system'
import { fetch } from 'expo/fetch'
import * as Crypto from 'expo-crypto'
import { z } from 'zod'
import { getSession, invalidateSession } from './auth'
import { config, configurationError } from './config'
import { ApiError } from './api'
import { MAX_NATIVE_DOCUMENT_BYTES, MAX_NATIVE_VIDEO_BYTES } from './native-listing'

export const nativeUploadSchema = z.object({ uri: z.string().min(1).max(3000), kind: z.enum(['video', 'document']), bucket: z.enum(['listings-media', 'compliance-docs']),
  path: z.string().min(1).max(500), contentType: z.enum(['video/mp4', 'video/quicktime', 'video/webm', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp']), size: z.number().int().positive().max(MAX_NATIVE_VIDEO_BYTES) }).strict()
export type NativeListingUpload = z.infer<typeof nativeUploadSchema>
const extensions: Record<NativeListingUpload['contentType'], string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function prepareNativeListingUpload(uri: string, kind: 'video' | 'document', actorId: string, mimeType?: string, existingPath?: string): NativeListingUpload {
  z.string().uuid().parse(actorId)
  const file = new File(uri)
  const maximum = kind === 'video' ? MAX_NATIVE_VIDEO_BYTES : MAX_NATIVE_DOCUMENT_BYTES
  if (!file.exists || file.size <= 0 || file.size > maximum) throw new Error(kind === 'video' ? 'Record a non-empty walkthrough no larger than 200MB.' : 'Choose a non-empty document no larger than 10MB.')
  const type = kind === 'video' ? /\.mov(?:$|\?)/i.test(uri) ? 'video/quicktime' : /\.mp4(?:$|\?)/i.test(uri) ? 'video/mp4' : /\.webm(?:$|\?)/i.test(uri) ? 'video/webm' : null : mimeType
  if (!type || !(type in extensions) || (kind === 'video' ? !type.startsWith('video/') : type.startsWith('video/'))) throw new Error('Keep the actual recorded video format, or choose a PDF, JPG, PNG or WebP authority document.')
  const contentType = type as NativeListingUpload['contentType']
  const path = existingPath ?? `${actorId}/${Crypto.randomUUID()}/${Crypto.randomUUID()}_${kind}.${extensions[contentType]}`
  const parts = path.split('/')
  if (parts.length !== 3 || parts[0] !== actorId || !z.string().uuid().safeParse(parts[1]).success || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(parts[2]) || !parts[2].endsWith(`.${extensions[contentType]}`)) throw new Error('This saved upload path is invalid. Recover the original listing before continuing.')
  return nativeUploadSchema.parse({ uri, kind, bucket: kind === 'video' ? 'listings-media' : 'compliance-docs', path, contentType, size: file.size })
}

/** SDK58 sends the native File body directly; no whole-video ArrayBuffer enters JS. */
export async function uploadPreparedNativeListingFile(input: NativeListingUpload, actorId: string, signal?: AbortSignal): Promise<string> {
  if (configurationError) throw new ApiError(configurationError, 'CONFIGURATION_REQUIRED', 503)
  const saved = nativeUploadSchema.parse(input)
  const verified = prepareNativeListingUpload(saved.uri, saved.kind, actorId, saved.contentType, saved.path)
  if (verified.bucket !== saved.bucket || verified.size !== saved.size || verified.contentType !== saved.contentType) throw new Error('The original file changed after upload preparation. Keep the saved listing and select or record it again.')
  const session = await getSession()
  if (!session) throw new ApiError('Sign in again before uploading your listing.', 'UNAUTHORIZED', 401)
  if (session.user.id !== actorId) throw new ApiError('Your signed-in account changed. Reopen the listing before uploading.', 'ACCOUNT_CHANGED', 409)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 180000)
  try {
    const response = await fetch(`${config.apiUrl}/api/v1/uploads/${saved.bucket}`, { method: 'POST', credentials: 'omit', signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': saved.contentType, 'X-Upload-Path': saved.path }, body: new File(saved.uri) })
    if (response.status === 401) {
      try { await invalidateSession(session.access_token) }
      catch { throw new ApiError('Your sign-in expired, but secure storage could not be cleared. Try signing out again before uploading.', 'SESSION_CLEAR_FAILED', 401) }
    }
    let payload: unknown
    try { payload = await response.json() } catch { throw new ApiError('This upload response could not be confirmed. Check the saved upload before sending another file.', 'INVALID_RESPONSE', response.status) }
    if (!response.ok) throw new ApiError(payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'Your upload could not be completed. Keep the original file for retry.', 'UPLOAD_FAILED', response.status)
    if (!payload || typeof payload !== 'object' || !('success' in payload) || payload.success !== true || !('data' in payload) || !payload.data || typeof payload.data !== 'object'
      || !('path' in payload.data) || payload.data.path !== saved.path) throw new ApiError('This upload response could not be confirmed. Check the saved upload before sending another file.', 'INVALID_RESPONSE', 200)
    return saved.path
  } catch (failure) {
    if (failure instanceof ApiError) throw failure
    throw new ApiError(controller.signal.aborted ? 'The upload was interrupted. Your original file and upload path are kept; check its status before retrying.' : 'The upload result is unknown. Your original file and upload path are kept; check its status before retrying.', 'UPLOAD_UNCERTAIN', 0)
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort) }
}

export async function uploadNativeListingFile(uri: string, kind: 'video' | 'document', mimeType?: string): Promise<string> {
  const session = await getSession()
  if (!session) throw new ApiError('Sign in again before uploading your listing.', 'UNAUTHORIZED', 401)
  return uploadPreparedNativeListingFile(prepareNativeListingUpload(uri, kind, session.user.id, mimeType), session.user.id)
}
