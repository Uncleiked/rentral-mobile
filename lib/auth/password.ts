import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

const KEY_BYTES = 64
function scrypt(password: string, salt: string): Promise<Buffer> {
  // OWASP's memory/CPU-equivalent32MiB configuration.
  return new Promise((resolve, reject) => scryptCallback(password, salt, KEY_BYTES, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)))
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24).toString('hex')
  const key = await scrypt(password, salt)
  return `scrypt-v1:${salt}:${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split(':') ?? []
  const valid = parts.length === 3 && parts[0] === 'scrypt-v1' && /^[a-f0-9]{48}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2])
  // Unknown emails still perform the expensive password operation.
  const salt = valid ? parts[1] : '0'.repeat(48)
  const actual = await scrypt(password, salt)
  const expected = Buffer.from(valid ? parts[2] : '0'.repeat(KEY_BYTES * 2), 'hex')
  return timingSafeEqual(actual, expected) && valid
}
