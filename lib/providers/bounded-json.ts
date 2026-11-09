export class ProviderJsonError extends Error {
  readonly code: 'UNAVAILABLE' | 'RESPONSE_TOO_LARGE' | 'INVALID_RESPONSE' | 'TIMEOUT'
  constructor(code: ProviderJsonError['code']) { super('The configured provider is temporarily unavailable.'); this.name = 'ProviderJsonError'; this.code = code }
}
const allowedHosts = new Set(['generativelanguage.googleapis.com', 'api.geoapify.com'])

/** Fixed provider destinations, no redirect forwarding, and one deadline for
 * both headers and the actual streamed body. Never retain provider error text. */
export async function fetchBoundedProviderJson(url: string | URL, init: Omit<RequestInit, 'signal' | 'redirect' | 'cache'>, options: { maximumBytes: number; timeoutMs: number }): Promise<unknown> {
  let destination: URL
  try { destination = new URL(url) } catch { throw new ProviderJsonError('INVALID_RESPONSE') }
  if (destination.protocol !== 'https:' || !allowedHosts.has(destination.hostname) || destination.port || destination.username || destination.password
    || !Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 1 || options.maximumBytes > 1024 * 1024 || !Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 45000) throw new ProviderJsonError('INVALID_RESPONSE')
  const signal = AbortSignal.timeout(options.timeoutMs)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let onAbort: (() => void) | undefined
  try {
    const response = await fetch(destination, { ...init, cache: 'no-store', redirect: 'error', signal })
    const rejectBody = (code: ProviderJsonError['code']): never => { void response.body?.cancel().catch(() => undefined); throw new ProviderJsonError(code) }
    if (!response.ok || response.redirected) rejectBody('UNAVAILABLE')
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (!type || !/^application\/(?:[a-z0-9.+-]+\+)?json$/.test(type) || !response.body) rejectBody('INVALID_RESPONSE')
    const length = response.headers.get('content-length')
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > options.maximumBytes)) rejectBody('RESPONSE_TOO_LARGE')
    reader = response.body!.getReader()
    const abort = new Promise<never>((_resolve, reject) => {
      onAbort = () => { void reader?.cancel().catch(() => undefined); reject(new ProviderJsonError('TIMEOUT')) }
      signal.addEventListener('abort', onAbort, { once: true })
    })
    void abort.catch(() => undefined)
    if (signal.aborted) throw new ProviderJsonError('TIMEOUT')
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const chunk = await Promise.race([reader.read(), abort])
      if (signal.aborted) throw new ProviderJsonError('TIMEOUT')
      if (chunk.done) break
      if (!(chunk.value instanceof Uint8Array)) throw new ProviderJsonError('INVALID_RESPONSE')
      size += chunk.value.byteLength
      if (size > options.maximumBytes) { void reader.cancel().catch(() => undefined); throw new ProviderJsonError('RESPONSE_TOO_LARGE') }
      chunks.push(chunk.value)
    }
    const body = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown }
    catch { throw new ProviderJsonError('INVALID_RESPONSE') }
  } catch (error) {
    if (error instanceof ProviderJsonError) throw error
    throw new ProviderJsonError(signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE')
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
    try { reader?.releaseLock() } catch { /* An aborted non-compliant stream can still have a pending read. */ }
  }
}
