import { describe, expect, it, vi } from 'vitest'
import { sendMediaChunk, validatedUploadUrl, type UploadSource } from '@/lib/media/resumable-upload'

const url = 'https://storage.googleapis.com/owned-mux-upload?opaque=fixture-only'
function source(size = 8) {
  const stream = vi.fn(async ({ start, end }: { start: number; end: number }) => new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(Uint8Array.from({ length: end - start + 1 }, (_, index) => start + index)); controller.close() },
  }))
  return { size, contentType: 'video/quicktime', stream }
}

describe('Mux resumable byte transport', () => {
  it('resumes only the persisted range and streams the original bytes', async () => {
    const input = source()
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      if (!init.body) return new Response(null, { status: 308, headers: { Range: 'bytes=0-3' } })
      expect(init.headers).toMatchObject({ 'Content-Length': '4', 'Content-Range': 'bytes 4-7/8', 'Content-Type': 'video/quicktime' })
      expect([...new Uint8Array(await new Response(init.body).arrayBuffer())]).toEqual([4, 5, 6, 7])
      return new Response(null, { status: 200 })
    })
    expect(await sendMediaChunk(url, input, request)).toEqual({ bytes: 8, complete: true })
    expect(input.stream).toHaveBeenCalledWith({ start: 4, end: 7 })
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls.every(([, init]) => init.redirect === 'manual')).toBe(true)
  })
  it('does not open the file again when the provider already completed the upload', async () => {
    const input = source()
    expect(await sendMediaChunk(url, input, async () => new Response(null, { status: 201 }))).toEqual({ bytes: 8, complete: true })
    expect(input.stream).not.toHaveBeenCalled()
  })
  it('uses bounded8MiB chunks for a200MiB file without buffering that file', async () => {
    const stream = vi.fn(async () => new ReadableStream<Uint8Array>({ start(controller) { controller.close() } }))
    const input: UploadSource = { size: 209715200, contentType: 'video/mp4', stream }
    const request = vi.fn(async (_url: string, init: RequestInit) => init.body
      ? new Response(null, { status: 308, headers: { Range: 'bytes=0-8388607' } }) : new Response(null, { status: 308 }))
    expect(await sendMediaChunk(url, input, request)).toEqual({ bytes: 8388608, complete: false })
    expect(stream).toHaveBeenCalledWith({ start: 0, end: 8388607 })
  })
  it.each(['http://127.0.0.1/private', 'https://storage.googleapis.com.evil.test/path', 'https://user:pass@storage.googleapis.com/a', 'https://storage.googleapis.com:8443/a', 'file:///private'])('denies an untrusted destination before any request: %s', async destination => {
    const request = vi.fn()
    expect(() => validatedUploadUrl(destination)).toThrow('invalid_upload_url')
    await expect(sendMediaChunk(destination, source(), request)).rejects.toThrow('invalid_upload_url')
    expect(request).not.toHaveBeenCalled()
  })
  it.each(['bytes=4-7', 'bytes=0-8', 'unexpected', 'bytes=0-999999999999999999999'])('rejects impossible provider offsets: %s', async range => {
    const input = source()
    await expect(sendMediaChunk(url, input, async () => new Response(null, { status: 308, headers: { Range: range } }))).rejects.toThrow('invalid_upload_range')
    expect(input.stream).not.toHaveBeenCalled()
  })
  it('retains an unknown chunk outcome for a future probe, without a blind retry', async () => {
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      if (!init.body) return new Response(null, { status: 308 })
      throw new Error('simulated lost acknowledgement')
    })
    await expect(sendMediaChunk(url, source(), request)).rejects.toThrow('simulated lost acknowledgement')
    expect(request).toHaveBeenCalledTimes(2)
  })
})
