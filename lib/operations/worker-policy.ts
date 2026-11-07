import { createHash, timingSafeEqual } from 'node:crypto'

export function lifecycleAuthorized(header: string | null): boolean {
  const secret = process.env.LIFECYCLE_WORKER_SECRET
  if (!secret || secret.length < 32 || /\s/.test(secret) || !header?.startsWith('Bearer ')) return false
  const actual = createHash('sha256').update(header.slice(7)).digest()
  const expected = createHash('sha256').update(secret).digest()
  return timingSafeEqual(actual, expected)
}
