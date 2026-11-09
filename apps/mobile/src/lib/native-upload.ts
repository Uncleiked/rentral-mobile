import { File } from 'expo-file-system'
import * as Crypto from 'expo-crypto'
import { getSession } from './auth'
import { config } from './config'
import { MAX_NATIVE_DOCUMENT_BYTES, MAX_NATIVE_VIDEO_BYTES } from './native-listing'

export async function uploadNativeListingFile(uri: string, kind: 'video' | 'document', mimeType?: string): Promise<string> {
  const session = await getSession()
  if (!session) throw new Error('Your sign-in has expired. Sign in and try again.')
  const file = new File(uri)
  const maximum = kind === 'video' ? MAX_NATIVE_VIDEO_BYTES : MAX_NATIVE_DOCUMENT_BYTES
  if (!file.exists || file.size <= 0 || file.size > maximum) throw new Error(kind === 'video' ? 'Record a video smaller than 200MB.' : 'Choose a non-empty document smaller than 10MB.')
  const contentType = kind === 'video' ? (/\.mov(?:$|\?)/i.test(uri) ? 'video/quicktime' : 'video/mp4') : mimeType
  const extension = contentType === 'video/quicktime' ? 'mov' : contentType === 'video/mp4' ? 'mp4' : contentType === 'application/pdf' ? 'pdf' : contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : null
  if (!contentType || !extension) throw new Error('Choose a supported video or a PDF, JPG or PNG document.')
  const path = `${session.user.id}/${Crypto.randomUUID()}/${Date.now()}_${kind}.${extension}`
  const bucket = kind === 'video' ? 'listings-media' : 'compliance-docs'
  // Send the recorded or picked bytes directly, preserving the actual MOV format.
  const bytes = await file.arrayBuffer().catch(() => { throw new Error('The selected file could not be read. Keep this page open and record or choose the file again.') })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180000)
  try {
    const result = await fetch(`${config.apiUrl}/api/v1/uploads/${bucket}`, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': contentType, 'X-Upload-Path': path }, body: bytes, signal: controller.signal })
    const payload: unknown = await result.json()
    if (!result.ok || !payload || typeof payload !== 'object' || !('success' in payload) || payload.success !== true) throw new Error('The upload could not be completed. Check your backend and connection, then retry. Your files are kept here.')
    return path
  } finally { clearTimeout(timeout) }
}
