import { Platform } from 'react-native'
import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as Crypto from 'expo-crypto'
import { getSession, invalidateSession } from './auth'
import { config, configurationError } from './config'
import { ApiError } from './api'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export type PreparedAvatar = { uri: string; bytes: ArrayBuffer }

/** Decode a selected photo and encode an actual bounded JPEG for public use. */
export async function prepareAvatar(uri: string): Promise<PreparedAvatar> {
  const context = ImageManipulator.manipulate(uri, { maxWidth: 1024, maxHeight: 1024 })
  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined
  try {
    context.resize({ width: 512 })
    image = await context.renderAsync()
    const rendered = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })
    let bytes: ArrayBuffer
    if (Platform.OS === 'web') {
      if (!/^(?:data:image\/jpeg;|blob:)/i.test(rendered.uri)) throw new Error('This photo could not be prepared. Choose another image.')
      const result = await fetch(rendered.uri)
      bytes = await result.arrayBuffer()
    } else {
      const file = new File(rendered.uri)
      if (!file.exists || file.size <= 0 || file.size > MAX_AVATAR_BYTES) throw new Error('Choose a photo that can be saved under 2MB.')
      bytes = await file.arrayBuffer()
    }
    const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 3))
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_AVATAR_BYTES || header[0] !== 255 || header[1] !== 216 || header[2] !== 255) throw new Error('This photo could not be prepared as a JPEG under 2MB.')
    return { uri: rendered.uri, bytes }
  } finally { image?.release(); context.release() }
}

export async function uploadPreparedAvatar(avatar: PreparedAvatar): Promise<string> {
  if (configurationError) throw new ApiError(configurationError, 'CONFIGURATION_REQUIRED', 503)
  const session = await getSession()
  if (!session) throw new ApiError('Sign in before changing your photo.', 'UNAUTHORIZED', 401)
  if (avatar.bytes.byteLength <= 0 || avatar.bytes.byteLength > MAX_AVATAR_BYTES) throw new Error('Choose a photo under 2MB.')
  const path = `${session.user.id}/${Crypto.randomUUID()}.jpg`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${config.apiUrl}/api/v1/uploads/profile-avatars`, { method: 'POST', credentials: 'omit', signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'image/jpeg', 'X-Upload-Path': path }, body: avatar.bytes })
    if (response.status === 401) await invalidateSession(session.access_token)
    let payload: unknown
    try { payload = await response.json() }
    catch { throw new ApiError('The photo upload could not be confirmed. Your selected photo is kept for retry.', 'INVALID_RESPONSE', response.status) }
    if (!response.ok) throw new ApiError(payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'Your photo could not be uploaded. Please retry.', 'UPLOAD_FAILED', response.status)
    if (!payload || typeof payload !== 'object' || !('success' in payload) || payload.success !== true || !('data' in payload) || !payload.data || typeof payload.data !== 'object'
      || !('path' in payload.data) || payload.data.path !== path) throw new ApiError('The photo upload could not be confirmed. Your selected photo is kept for retry.', 'INVALID_RESPONSE', response.status)
    return `/api/v1/files/profile-avatars/${path}`
  } catch (reason) {
    if (reason instanceof ApiError) throw reason
    throw new ApiError(controller.signal.aborted ? 'The photo upload timed out. Your selected photo is kept; check your connection and retry.' : 'Your photo could not be uploaded. Your selection is kept; check your connection and retry.', 'NETWORK_ERROR', 0)
  } finally { clearTimeout(timer) }
}
