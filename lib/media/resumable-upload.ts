/** Streaming transport for the authenticated GCS session returned by Mux.
 * Never follow redirects or retain/log the signed upload URL. */
export class MediaUploadError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'MediaUploadError' }
}

export type UploadSource = {
  size: number
  contentType: string
  stream: (range: { start: number; end: number }) => Promise<ReadableStream<Uint8Array>>
}
type UploadRequest = RequestInit & { duplex?: 'half' }
type UploadFetch = (url: string, init: UploadRequest) => Promise<Response>
export type UploadProgress = { bytes: number; complete: boolean }
const CHUNK_BYTES = 8 * 1024 * 1024
const MAX_BYTES = 200 * 1024 * 1024

export function validatedUploadUrl(input: string): string {
  let url: URL
  try { url = new URL(input) } catch { throw new MediaUploadError('invalid_upload_url') }
  if (input.length > 16384 || url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') ||
    !(url.hostname === 'storage.googleapis.com' || url.hostname.endsWith('.storage.googleapis.com'))) throw new MediaUploadError('invalid_upload_url')
  return url.href
}

function acknowledged(response: Response, total: number): UploadProgress {
  if (response.status === 200 || response.status === 201) return { bytes: total, complete: true }
  if (response.status !== 308) throw new MediaUploadError(response.status === 404 || response.status === 410 ? 'upload_session_unavailable' : 'upload_transport_unavailable')
  const range = response.headers.get('range')
  if (!range) return { bytes: 0, complete: false }
  const match = /^bytes=0-(\d+)$/.exec(range)
  const bytes = match ? Number(match[1]) + 1 : NaN
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > total) throw new MediaUploadError('invalid_upload_range')
  return { bytes, complete: false }
}

async function discard(response: Response): Promise<void> {
  try { await response.body?.cancel() } catch { /* No provider response body is needed or retained. */ }
}

/** Probe persisted bytes before every continuation. A timeout never restarts a
 * session or creates another asset. Non-final chunks are multiples of 256KiB. */
export async function sendMediaChunk(urlInput: string, source: UploadSource, request: UploadFetch = (url, init) => fetch(url, init)): Promise<UploadProgress> {
  const url = validatedUploadUrl(urlInput)
  if (!Number.isSafeInteger(source.size) || source.size <= 0 || source.size > MAX_BYTES ||
    !['video/mp4', 'video/webm', 'video/quicktime'].includes(source.contentType)) throw new MediaUploadError('invalid_source')
  const probe = await request(url, { method: 'PUT', redirect: 'manual', headers: {
    'Content-Length': '0', 'Content-Range': 'bytes */' + source.size,
  }, signal: AbortSignal.timeout(15000) })
  let progress: UploadProgress
  try { progress = acknowledged(probe, source.size) } finally { await discard(probe) }
  if (progress.complete || progress.bytes === source.size) return progress
  const end = Math.min(source.size - 1, progress.bytes + CHUNK_BYTES - 1)
  const body = await source.stream({ start: progress.bytes, end })
  try {
    const response = await request(url, { method: 'PUT', redirect: 'manual', duplex: 'half',
      headers: { 'Content-Type': source.contentType, 'Content-Length': String(end - progress.bytes + 1),
        'Content-Range': 'bytes ' + progress.bytes + '-' + end + '/' + source.size },
      body, signal: AbortSignal.timeout(30000) })
    try { return acknowledged(response, source.size) } finally { await discard(response) }
  } finally {
    // On a failed HTTP request fetch normally cancels the body; also close any
    // unlocked source so a rejected response cannot strand a file descriptor.
    if (!body.locked) await body.cancel().catch(() => undefined)
  }
}
