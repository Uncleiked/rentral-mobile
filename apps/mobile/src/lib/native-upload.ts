import { File, FileMode } from 'expo-file-system'
import { fetch } from 'expo/fetch'
import * as Crypto from 'expo-crypto'
import { z } from 'zod'
import { getSession, invalidateSession } from './auth'
import { config, configurationError } from './config'
import { ApiError } from './api'
import { MAX_NATIVE_DOCUMENT_BYTES, MAX_NATIVE_VIDEO_BYTES } from './native-listing'
import { UPLOAD_PART_BYTES, uploadCapabilitiesSchema, uploadPartResultSchema } from '../../../../lib/contracts/upload-transport'

export const nativeUploadSchema = z.object({ uri: z.string().min(1).max(3000), kind: z.enum(['video', 'document', 'photo']), bucket: z.enum(['listings-media', 'compliance-docs']),
  path: z.string().min(1).max(500), contentType: z.enum(['video/mp4', 'video/quicktime', 'video/webm', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp']), size: z.number().int().positive().max(MAX_NATIVE_VIDEO_BYTES), galleryPermissionRevision: z.number().int().nonnegative().optional() }).strict()
export type NativeListingUpload = z.infer<typeof nativeUploadSchema>
const extensions: Record<NativeListingUpload['contentType'], string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function prepareNativeListingUpload(uri: string, kind: 'video' | 'document' | 'photo', actorId: string, mimeType?: string, existingPath?: string, galleryPermissionRevision?: number): NativeListingUpload {
  z.string().uuid().parse(actorId)
  const file = new File(uri)
  const maximum = kind === 'video' ? MAX_NATIVE_VIDEO_BYTES : MAX_NATIVE_DOCUMENT_BYTES
  if (!file.exists || file.size <= 0 || file.size > maximum) throw new Error(kind === 'video' ? 'Choose a non-empty video no larger than 200MB.' : kind === 'photo' ? 'Choose a non-empty photo no larger than 10MB.' : 'Choose a non-empty document no larger than 10MB.')
  const type = kind === 'video' ? /\.mov(?:$|\?)/i.test(uri) ? 'video/quicktime' : /\.mp4(?:$|\?)/i.test(uri) ? 'video/mp4' : /\.webm(?:$|\?)/i.test(uri) ? 'video/webm' : null : mimeType
  if (!type || !(type in extensions) || (kind === 'video' ? !type.startsWith('video/') : kind === 'photo' ? !['image/jpeg', 'image/png'].includes(type) : type.startsWith('video/'))) throw new Error('Keep the actual recorded video format, choose JPEG/PNG gallery photos, or a supported authority document.')
  const contentType = type as NativeListingUpload['contentType']
  const path = existingPath ?? `${actorId}/${Crypto.randomUUID()}/${Crypto.randomUUID()}_${kind}.${extensions[contentType]}`
  const parts = path.split('/')
  if (parts.length !== 3 || parts[0] !== actorId || !z.string().uuid().safeParse(parts[1]).success || !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(parts[2]) || !parts[2].endsWith(`.${extensions[contentType]}`)) throw new Error('This saved upload path is invalid. Recover the original listing before continuing.')
  return nativeUploadSchema.parse({ uri, kind, bucket: kind === 'document' ? 'compliance-docs' : 'listings-media', path, contentType, size: file.size, ...(galleryPermissionRevision === undefined ? {} : { galleryPermissionRevision }) })
}

/** SDK58 File.slice reads the whole file; bounded FileHandle reads keep large videos out of JS memory. */
export async function uploadPreparedNativeListingFile(input: NativeListingUpload, actorId: string, signal?: AbortSignal): Promise<string> {
  if (configurationError) throw new ApiError(configurationError, 'CONFIGURATION_REQUIRED', 503)
  const saved = nativeUploadSchema.parse(input)
  const verified = prepareNativeListingUpload(saved.uri, saved.kind, actorId, saved.contentType, saved.path, saved.galleryPermissionRevision)
  if (verified.bucket !== saved.bucket || verified.size !== saved.size || verified.contentType !== saved.contentType) throw new Error('The original file changed after upload preparation. Keep the saved listing and select or record it again.')
  const session = await getSession()
  if (!session) throw new ApiError('Sign in again before uploading your listing.', 'UNAUTHORIZED', 401)
  if (session.user.id !== actorId) throw new ApiError('Your signed-in account changed. Reopen the listing before uploading.', 'ACCOUNT_CHANGED', 409)
  const accessToken = session.access_token
  const controller = new AbortController(), abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 180000)
  const endpoint = config.apiUrl + '/api/v1/uploads/' + saved.bucket
  const galleryQuery = saved.galleryPermissionRevision === undefined ? '' : '?mediaSource=approved_gallery&permissionRevision=' + saved.galleryPermissionRevision
  const headers = { Authorization: 'Bearer ' + accessToken, 'Content-Type': saved.contentType, 'X-Upload-Path': saved.path }
  async function result<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    if (response.status === 401) {
      try { await invalidateSession(accessToken) }
      catch { throw new ApiError('Your sign-in expired, but secure storage could not be cleared. Try signing out again before uploading.', 'SESSION_CLEAR_FAILED', 401) }
    }
    let payload: unknown
    try { payload = await response.json() }
    catch { throw new ApiError('This upload response could not be confirmed. Check the saved upload before sending another file.', 'INVALID_RESPONSE', response.status) }
    if (!response.ok) {
      const failure = z.object({ error: z.string().max(1000), code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional() }).safeParse(payload)
      throw new ApiError(failure.success ? failure.data.error : 'Your upload could not be completed. Keep the original file for retry.', failure.success ? failure.data.code ?? 'UPLOAD_FAILED' : 'UPLOAD_FAILED', response.status)
    }
    const parsed = z.object({ success: z.literal(true), data: schema }).strict().safeParse(payload)
    if (!parsed.success) throw new ApiError('This upload response could not be confirmed. Check the saved upload before sending another file.', 'INVALID_RESPONSE', response.status)
    return parsed.data.data
  }
  try {
    if (controller.signal.aborted) throw new ApiError('The upload was interrupted. Your original file and upload path are kept; check its status before retrying.', 'UPLOAD_UNCERTAIN', 0)
    if (saved.size > UPLOAD_PART_BYTES) {
      const capabilities = await result(await fetch(endpoint + '?capabilities=1', { method: 'GET', credentials: 'omit', signal: controller.signal, headers: { Authorization: headers.Authorization } }), uploadCapabilitiesSchema)
      if (capabilities.chunked) {
        const file = new File(saved.uri), handle = file.open(FileMode.ReadOnly)
        const totalParts = Math.ceil(saved.size / UPLOAD_PART_BYTES)
        let part = 0
        try {
          while (part < totalParts) {
            if (controller.signal.aborted) throw new ApiError('The upload was interrupted. Keep your original file and check its saved status before retrying.', 'UPLOAD_UNCERTAIN', 0)
            const offset = part * UPLOAD_PART_BYTES, length = Math.min(UPLOAD_PART_BYTES, saved.size - offset)
            handle.offset = offset
            const bytes = await handle.readBytes(length)
            if (bytes.byteLength !== length) throw new ApiError('The original file changed while uploading. Keep this upload recovery and check its status before selecting another file.', 'FILE_CHANGED', 409)
            const receipt = await result(await fetch(endpoint + galleryQuery, { method: 'POST', credentials: 'omit', signal: controller.signal,
              headers: { ...headers, 'X-Upload-Total-Size': String(saved.size), 'X-Upload-Part': String(part) }, body: bytes }), uploadPartResultSchema)
            if (receipt.path !== saved.path || receipt.nextPart <= part || receipt.nextPart > totalParts || receipt.complete !== (receipt.nextPart === totalParts)) throw new ApiError('The upload progress could not be confirmed. Keep your original file and check its saved status before retrying.', 'INVALID_RESPONSE', 200)
            if (receipt.complete) return saved.path
            // An explicit retry always sends part0. The server verifies those same bytes before allowing a prefix skip.
            part = receipt.nextPart
          }
        } finally { handle.close() }
        throw new ApiError('The complete upload could not be confirmed. Check its saved status before retrying.', 'INVALID_RESPONSE', 200)
      }
    }
    const receipt = await result(await fetch(endpoint + galleryQuery, { method: 'POST', credentials: 'omit', signal: controller.signal, headers, body: new File(saved.uri) }), z.object({ path: z.string() }).strict())
    if (receipt.path !== saved.path) throw new ApiError('This upload response could not be confirmed. Check the saved upload before sending another file.', 'INVALID_RESPONSE', 200)
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
