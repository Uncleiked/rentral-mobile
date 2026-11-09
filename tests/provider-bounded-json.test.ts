import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBoundedProviderJson } from '@/lib/providers/bounded-json'
const destination = 'https://api.geoapify.com/v1/geocode/search?apiKey=owned-not-live'
const options = { maximumBytes: 64, timeoutMs: 1000 }
beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.unstubAllGlobals())
describe('bounded advisory-provider JSON transport', () => {
  it('uses a fixed HTTPS destination, forbids redirect forwarding and parses a bounded JSON body', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ safe: true }))
    expect(await fetchBoundedProviderJson(destination, {}, options)).toEqual({ safe: true })
    expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.any(URL), expect.objectContaining({ redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal) }))
    await expect(fetchBoundedProviderJson('https://unapproved.invalid/data', {}, options)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects chunked overflow even with a false short Content-Length and cancels the actual stream', async () => {
    const cancel = vi.fn(), bytes = new TextEncoder().encode('a'.repeat(32))
    vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ pull(controller) { controller.enqueue(bytes) }, cancel }), { headers: { 'content-type': 'application/json', 'content-length': '1' } }))
    await expect(fetchBoundedProviderJson(destination, {}, options)).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
    expect(cancel).toHaveBeenCalled()
  })
  it('rejects announced overflow, redirects, invalid UTF8 and malformed JSON without surfacing response text', async () => {
    for (const response of [new Response('private body', { headers: { 'content-type': 'application/json', 'content-length': '1000' } }),
      new Response(null, { status: 302, headers: { location: 'https://unapproved.invalid/private' } }),
      new Response(new Uint8Array([255]), { headers: { 'content-type': 'application/json' } }),
      new Response('PRIVATE provider details', { headers: { 'content-type': 'application/json' } })]) {
      vi.mocked(fetch).mockResolvedValueOnce(response)
      const result = await fetchBoundedProviderJson(destination, {}, options).catch(error => error)
      expect(result).toBeInstanceOf(Error)
      if (!(result instanceof Error)) throw new Error('Expected a safe provider error')
      expect(result.message).not.toContain('PRIVATE'); expect(result.message).not.toContain('apiKey')
    }
  })
  it('bounds a stalled body after headers have already arrived', async () => {
    const cancel = vi.fn()
    vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ pull() { return new Promise(() => undefined) }, cancel }), { headers: { 'content-type': 'application/json' } }))
    await expect(fetchBoundedProviderJson(destination, {}, { maximumBytes: 64, timeoutMs: 25 })).rejects.toMatchObject({ code: 'TIMEOUT' })
  })
})
