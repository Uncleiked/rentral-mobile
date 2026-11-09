import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authEmailConfiguration, emailEncryptionKey } from '@/lib/auth/email-config'
import { openAuthEmail, sealAuthEmail } from '@/lib/auth/email-crypto'
import { sendAuthEmail, type AuthMailTransport } from '@/lib/auth/email-provider'

const key = Buffer.alloc(32, 7).toString('base64url')
const nextKey = Buffer.alloc(32, 8).toString('base64url')
const id = '828db1e4-46ec-4774-9d8d-e78058b399d2'
const payload = { from: 'Rentral <mail@example.test>', to: 'private-person@example.test', subject: 'Your confirmation code', text: `Confirmation code: ${'A'.repeat(43)}\nExpires in15 minutes.` }

beforeEach(() => {
  vi.stubEnv('AUTH_EMAIL_ENABLED', 'true'); vi.stubEnv('RESEND_API_KEY', 're_owned_fixture_private')
  vi.stubEnv('RENTRAL_EMAIL_FROM', payload.from); vi.stubEnv('AUTH_EMAIL_ENCRYPTION_KEY', key); vi.stubEnv('AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY', '')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('authentication email configuration and encryption', () => {
  it('requires deliberate real-email activation and complete global configuration', () => {
    expect(authEmailConfiguration()).toEqual({ delivery: 'email', from: payload.from })
    vi.stubEnv('AUTH_EMAIL_ENCRYPTION_KEY', 'short')
    expect(() => authEmailConfiguration()).toThrow('not configured')
    expect(() => emailEncryptionKey('a'.repeat(43))).toThrow()
  })
  it('keeps developer delivery explicit and impossible in production', () => {
    vi.stubEnv('AUTH_EMAIL_ENABLED', 'false'); vi.stubEnv('AUTH_DEV_EMAIL_OUTBOX', 'true'); vi.stubEnv('NODE_ENV', 'development')
    expect(authEmailConfiguration().delivery).toBe('development-outbox')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => authEmailConfiguration()).toThrow('not configured')
  })
  it('uses fresh authenticated encryption and never persists plaintext-equivalent tokens or addresses', () => {
    const first = sealAuthEmail(id, 'password_reset', payload), second = sealAuthEmail(id, 'password_reset', payload)
    expect(first.encryptedPayload).not.toBe(second.encryptedPayload)
    expect(first.keyId).toMatch(/^[a-f0-9]{16}$/)
    expect(first.encryptedPayload).not.toContain(payload.to)
    expect(first.encryptedPayload).not.toContain('A'.repeat(43))
    expect(openAuthEmail(id, 'password_reset', first.encryptedPayload)).toEqual(payload)
  })
  it('authenticates job ID, purpose, tag and ciphertext rather than accepting substituted capabilities', () => {
    const sealed = sealAuthEmail(id, 'password_reset', payload)
    expect(() => openAuthEmail(randomUUID(), 'password_reset', sealed.encryptedPayload)).toThrow('AUTH_EMAIL_DECRYPTION_FAILED')
    expect(() => openAuthEmail(id, 'email_change_old', sealed.encryptedPayload)).toThrow('AUTH_EMAIL_DECRYPTION_FAILED')
    const tampered = JSON.parse(sealed.encryptedPayload)
    tampered.tag = 'A'.repeat(22)
    expect(() => openAuthEmail(id, 'password_reset', JSON.stringify(tampered))).toThrow('AUTH_EMAIL_DECRYPTION_FAILED')
  })
  it('reads the previous encryption key during a deliberate rotation and fails safely when it is unavailable', () => {
    const sealed = sealAuthEmail(id, 'password_reset', payload)
    vi.stubEnv('AUTH_EMAIL_ENCRYPTION_KEY', nextKey); vi.stubEnv('AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY', key)
    expect(openAuthEmail(id, 'password_reset', sealed.encryptedPayload)).toEqual(payload)
    vi.stubEnv('AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY', '')
    expect(() => openAuthEmail(id, 'password_reset', sealed.encryptedPayload)).toThrow('AUTH_EMAIL_DECRYPTION_FAILED')
  })
  it('does not let a malformed unused previous key corrupt current-key deliveries', () => {
    const sealed = sealAuthEmail(id, 'password_reset', payload)
    vi.stubEnv('AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY', 'bad-previous-key')
    expect(openAuthEmail(id, 'password_reset', sealed.encryptedPayload)).toEqual(payload)
  })
  it('bounds UTF8 payloads and rejects header/newline injection', () => {
    expect(() => sealAuthEmail(id, 'password_reset', { ...payload, text: '好'.repeat(5000) })).toThrow()
    expect(() => sealAuthEmail(id, 'password_reset', { ...payload, subject: 'test\r\nBcc: attacker@example.test' })).toThrow()
  })
})

describe('Resend transport and idempotency contracts', () => {
  it('uses the fixed HTTPS origin and unchanged per-job idempotency key with no redirect or automatic retry', async () => {
    const providerId = randomUUID(), fetcher = vi.fn<AuthMailTransport>().mockResolvedValue(Response.json({ id: providerId }))
    expect(await sendAuthEmail(id, payload, { fetch: fetcher })).toBe(providerId)
    expect(fetcher).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { Authorization: 'Bearer re_owned_fixture_private', 'Content-Type': 'application/json', 'Idempotency-Key': `rentral-auth:${id}` } }))
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual({ ...payload, to: [payload.to] })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('never sends with only a key when email delivery is not explicitly enabled', async () => {
    vi.stubEnv('AUTH_EMAIL_ENABLED', 'false')
    const fetcher = vi.fn<AuthMailTransport>()
    await expect(sendAuthEmail(id, payload, { fetch: fetcher })).rejects.toMatchObject({ code: 'REJECTED', uncertain: false })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([[400, 'REJECTED', false], [401, 'REJECTED', false], [429, 'RATE_LIMITED', true], [500, 'NETWORK', true]])('classifies%s safely without exposing addresses, secrets or provider body', async (status, code, uncertain) => {
    const fetcher = vi.fn<AuthMailTransport>().mockResolvedValue(new Response('PRIVATE private-person@example.test re_owned_fixture_private', { status: Number(status), headers: { 'retry-after': '60' } }))
    const error = await sendAuthEmail(id, payload, { fetch: fetcher }).catch(error => error)
    expect(error).toMatchObject({ code, uncertain, retryAfterSeconds: 60 })
    expect(String(error)).not.toMatch(/PRIVATE|private-person|re_owned_fixture_private/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('retains an uncertain outcome on timeout without replaying the send', async () => {
    const fetcher = vi.fn<AuthMailTransport>().mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('PRIVATE')), { once: true })
    }))
    await expect(sendAuthEmail(id, payload, { fetch: fetcher, timeoutMs: 5 })).rejects.toMatchObject({ code: 'TIMEOUT', uncertain: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([new Response('{"id":"not-a-valid-id"}'), new Response('x'.repeat(16385)), new Response('{}', { headers: { 'content-length': '16385' } })])('rejects malformed or oversized acknowledged replies', async response => {
    const fetcher = vi.fn<AuthMailTransport>().mockResolvedValue(response)
    await expect(sendAuthEmail(id, payload, { fetch: fetcher })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', uncertain: true })
  })
})
