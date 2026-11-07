type Bucket = { count: number; resetsAt: number }

/** Per-process backstop. Production ingress must also enforce a distributed limit. */
export class ApiRateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  constructor(private readonly maximumKeys = 10000) {}

  allow(key: string, maximum: number, now = Date.now()): boolean {
    const bucket = this.buckets.get(key)
    if (bucket && bucket.resetsAt > now) {
      if (bucket.count >= maximum) return false
      bucket.count += 1
      return true
    }
    if (this.buckets.size >= this.maximumKeys) {
      for (const [id, item] of this.buckets) if (item.resetsAt <= now) this.buckets.delete(id)
      if (this.buckets.size >= this.maximumKeys) {
        const oldest = this.buckets.keys().next().value
        if (oldest) this.buckets.delete(oldest)
      }
    }
    this.buckets.set(key, { count: 1, resetsAt: now + 60000 })
    return true
  }
}

export const apiRateLimiter = new ApiRateLimiter()
