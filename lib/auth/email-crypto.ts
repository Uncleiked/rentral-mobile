import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { emailEncryptionKey } from './email-config'

export const authEmailPayloadSchema = z.object({ from: z.string().min(3).max(320).refine(value => !/[\r\n]/.test(value)), to: z.string().email().max(254),
  subject: z.string().min(1).max(160).refine(value => !/[\r\n]/.test(value)), text: z.string().min(1).max(6000) }).strict()
export type AuthEmailPayload = z.infer<typeof authEmailPayloadSchema>
const envelopeSchema = z.object({ v: z.literal(1), kid: z.string().regex(/^[a-f0-9]{16}$/), iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  tag: z.string().regex(/^[A-Za-z0-9_-]{22}$/), data: z.string().regex(/^[A-Za-z0-9_-]+$/).max(16000) }).strict()

function keyId(key: Buffer): string { return createHash('sha256').update(key).digest('hex').slice(0, 16) }
function context(id: string, kind: string): Buffer { return Buffer.from(`rentral:auth-email:v1:${z.string().uuid().parse(id)}:${z.enum(['password_reset', 'email_change_old', 'email_change_new', 'security_notice']).parse(kind)}`) }

export function sealAuthEmail(id: string, kind: string, payload: AuthEmailPayload): { encryptedPayload: string; keyId: string } {
  const raw = JSON.stringify(authEmailPayloadSchema.parse(payload))
  if (Buffer.byteLength(raw) > 8192) throw new Error('Invalid auth email payload.')
  const key = emailEncryptionKey(process.env.AUTH_EMAIL_ENCRYPTION_KEY), iv = randomBytes(12), kid = keyId(key)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(context(id, kind))
  const data = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()])
  return { encryptedPayload: JSON.stringify({ v: 1, kid, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url') }), keyId: kid }
}

export function openAuthEmail(id: string, kind: string, encryptedPayload: string): AuthEmailPayload {
  try {
    if (Buffer.byteLength(encryptedPayload) > 32768) throw new Error()
    const envelope = envelopeSchema.parse(JSON.parse(encryptedPayload))
    const keys = [process.env.AUTH_EMAIL_ENCRYPTION_KEY, process.env.AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY].flatMap(value => {
      if (!value?.trim()) return []
      try { return [emailEncryptionKey(value)] } catch { return [] }
    })
    const key = keys.find(candidate => keyId(candidate) === envelope.kid)
    if (!key) throw new Error()
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'))
    decipher.setAAD(context(id, kind)); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
    const raw = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64url')), decipher.final()])
    if (raw.length > 8192) throw new Error()
    return authEmailPayloadSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)))
  } catch { throw new Error('AUTH_EMAIL_DECRYPTION_FAILED') }
}
