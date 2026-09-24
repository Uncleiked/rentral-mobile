import { createHash, timingSafeEqual } from 'node:crypto'

export function mediaWorkerAuthorized(header: string | null): boolean {
  const secret = process.env.MEDIA_WORKER_SECRET
  if (!secret || secret.length < 32 || /\s/.test(secret) || !header) return false
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`))
}
