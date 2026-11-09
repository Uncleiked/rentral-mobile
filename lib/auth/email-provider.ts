import { z } from 'zod'
import { authEmailPayloadSchema, type AuthEmailPayload } from './email-crypto'

export class AuthMailError extends Error {
  constructor(public readonly code: 'TIMEOUT' | 'NETWORK' | 'RATE_LIMITED' | 'REJECTED' | 'INVALID_RESPONSE', public readonly uncertain: boolean, public readonly retryAfterSeconds = 30) {
    super('Account email delivery could not be confirmed.'); this.name = 'AuthMailError'
  }
}
export type AuthMailTransport = (url: string, init: RequestInit) => Promise<Response>

/** A retry must use this exact job ID and unchanged decrypted payload, inside its expiry window. */
export async function sendAuthEmail(id: string, payload: AuthEmailPayload, options: { fetch?: AuthMailTransport; timeoutMs?: number } = {}): Promise<string> {
  z.string().uuid().parse(id)
  const checked = authEmailPayloadSchema.parse(payload)
  const key = process.env.RESEND_API_KEY?.trim()
  if (process.env.AUTH_EMAIL_ENABLED !== 'true' || !key || /[\r\n]/.test(key)) throw new AuthMailError('REJECTED', false)
  const timeout = options.timeoutMs ?? 10000
  z.number().int().min(1).max(10000).parse(timeout)
  const signal = AbortSignal.timeout(timeout)
  try {
    const fetcher: AuthMailTransport = options.fetch ?? ((url, init) => globalThis.fetch(url, init))
    const response = await fetcher('https://api.resend.com/emails', { method: 'POST', redirect: 'error', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `rentral-auth:${id}` },
      body: JSON.stringify({ from: checked.from, to: [checked.to], subject: checked.subject, text: checked.text }) })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      const retry = Number(response.headers.get('retry-after'))
      const retryAfter = Number.isSafeInteger(retry) && retry > 0 && retry <= 900 ? retry : 30
      throw new AuthMailError(response.status === 429 ? 'RATE_LIMITED' : response.status >= 500 ? 'NETWORK' : 'REJECTED', response.status >= 500 || response.status === 429, retryAfter)
    }
    if (!response.body) throw new AuthMailError('INVALID_RESPONSE', true)
    const advertised = response.headers.get('content-length')
    if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > 16384)) {
      await response.body.cancel().catch(() => undefined)
      throw new AuthMailError('INVALID_RESPONSE', true)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let raw = '', bytes = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 16384) throw new Error()
        raw += decoder.decode(value, { stream: true })
      }
      raw += decoder.decode()
      return z.object({ id: z.string().uuid() }).parse(JSON.parse(raw)).id
    } catch {
      await reader.cancel().catch(() => undefined)
      throw new AuthMailError(signal.aborted ? 'TIMEOUT' : 'INVALID_RESPONSE', true)
    } finally { reader.releaseLock() }
  } catch (error) {
    if (error instanceof AuthMailError) throw error
    throw new AuthMailError(signal.aborted ? 'TIMEOUT' : 'NETWORK', true)
  }
}
