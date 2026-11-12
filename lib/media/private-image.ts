import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { PRIVATE_IMAGE_WIDTHS } from './image-loader'

type Source = { info: (path: string) => Promise<{ data: { size: number; contentType: string; digest: string } | null; error: unknown }>; download: (path: string) => Promise<{ data: Blob | null; error: unknown }> }
type Waiter = { start: () => void; timer: ReturnType<typeof setTimeout> }
const cached = new Map<string, { bytes: Buffer; expires: number }>(), pending = new Map<string, Promise<Buffer>>()
const MAX_BYTES = 10 * 1024 * 1024, MAX_CACHE_BYTES = 32 * 1024 * 1024, TTL = 30000
const MAX_ACTIVE = 2, MAX_QUEUED = 16, QUEUE_TIMEOUT = 10000
const waiting: Waiter[] = []
let active = 0
function unavailable(): never { throw new Error('Private image variant unavailable.') }

async function acquireTransform(): Promise<void> {
  if (active < MAX_ACTIVE) { active += 1; return }
  if (waiting.length >= MAX_QUEUED) return unavailable()
  await new Promise<void>((resolve, reject) => {
    const waiter: Waiter = { start: resolve, timer: setTimeout(() => {
      const index = waiting.indexOf(waiter)
      if (index < 0) return
      waiting.splice(index, 1)
      reject(new Error('Private image variant queue wait expired.'))
    }, QUEUE_TIMEOUT) }
    waiting.push(waiter)
  })
}
function releaseTransform(): void {
  const next = waiting.shift()
  // Transfer this occupied slot to the oldest queued request. Expired waiters
  // remove themselves before they can receive a slot; no timer survives a start.
  if (next) { clearTimeout(next.timer); next.start() }
  else active -= 1
}

/** Call only after current listing/gallery/ownership authorization. No originals are changed. */
export async function privateImageVariant(storage: Source, path: string, width: number): Promise<Buffer> {
  if (!PRIVATE_IMAGE_WIDTHS.some(size => size === width)) return unavailable()
  const info = await storage.info(path)
  if (info.error || !info.data || !['image/jpeg', 'image/png', 'image/webp'].includes(info.data.contentType) || !Number.isSafeInteger(info.data.size) || info.data.size <= 0 || info.data.size > MAX_BYTES || !/^[a-f0-9]{64}$/.test(info.data.digest)) return unavailable()
  const key = path + '\0' + info.data.digest + '\0' + width, now = Date.now()
  for (const [id, item] of cached) if (item.expires <= now) cached.delete(id)
  const saved = cached.get(key); if (saved) return saved.bytes
  const previous = pending.get(key); if (previous) return previous
  const job = (async () => {
    // Queue metadata only: original bytes are not buffered while waiting. A
    // normal grid may request many different thumbnails at the same instant.
    await acquireTransform()
    try {
      const original = await storage.download(path)
      if (original.error || !original.data || original.data.size !== info.data!.size) return unavailable()
      const bytes = Buffer.from(await original.data.arrayBuffer())
      if (createHash('sha256').update(bytes).digest('hex') !== info.data!.digest) return unavailable()
      const output = await sharp(bytes, { limitInputPixels: 40000000, failOn: 'warning', animated: false }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78, effort: 3 }).timeout({ seconds: 3 }).toBuffer()
      let held = [...cached.values()].reduce((sum, item) => sum + item.bytes.byteLength, 0)
      while (cached.size >= 32 || held + output.byteLength > MAX_CACHE_BYTES) { const first = cached.keys().next().value; if (!first) break; held -= cached.get(first)!.bytes.byteLength; cached.delete(first) }
      if (output.byteLength <= MAX_CACHE_BYTES) cached.set(key, { bytes: output, expires: Date.now() + TTL })
      return output
    } finally { releaseTransform() }
  })()
  pending.set(key, job)
  try { return await job } finally { pending.delete(key) }
}
