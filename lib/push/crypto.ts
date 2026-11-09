import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { pushEncryptionKey, pushProjectId } from './config'
import { expoPushTokenSchema } from './policy'

export function pushTokenHash(token: string): string { return createHash('sha256').update(expoPushTokenSchema.parse(token)).digest('hex') }
export function pushProofHash(installationId: string, secret: string): string { return createHash('sha256').update(`rentral:push-proof:v1:${installationId}\0${secret}`).digest('hex') }
export function pushProofMatches(stored: string, installationId: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(stored)) return false
  return timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(pushProofHash(installationId, secret), 'hex'))
}
const context = (id: string) => Buffer.from(`rentral:push-token:v1:${id}:${pushProjectId()}`)
export function sealPushToken(id: string, token: string) {
  const key = pushEncryptionKey(), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(context(id))
  const ciphertext = Buffer.concat([cipher.update(expoPushTokenSchema.parse(token), 'utf8'), cipher.final()])
  return { token_ciphertext: ciphertext.toString('base64url'), token_iv: iv.toString('base64url'), token_tag: cipher.getAuthTag().toString('base64url') }
}
export function openPushToken(id: string, value: { token_ciphertext: string | null; token_iv: string | null; token_tag: string | null }): string {
  try {
    if (!value.token_ciphertext || value.token_ciphertext.length > 1000 || !value.token_iv || !/^[A-Za-z0-9_-]{16}$/.test(value.token_iv) || !value.token_tag || !/^[A-Za-z0-9_-]{22}$/.test(value.token_tag)) throw new Error()
    const decipher = createDecipheriv('aes-256-gcm', pushEncryptionKey(), Buffer.from(value.token_iv, 'base64url'))
    decipher.setAAD(context(id)); decipher.setAuthTag(Buffer.from(value.token_tag, 'base64url'))
    return expoPushTokenSchema.parse(Buffer.concat([decipher.update(Buffer.from(value.token_ciphertext, 'base64url')), decipher.final()]).toString('utf8'))
  } catch { throw new Error('PUSH_TOKEN_UNAVAILABLE') }
}
