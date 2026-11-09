import { insightEventSchema } from '../../../../lib/analytics/policy'
import type { z } from 'zod'
type Observation = z.infer<typeof insightEventSchema>
type Boundary = { consent: (actorId: string) => Promise<{ allowed: boolean; collectionEnabled: boolean }>; post: (actorId: string, observation: Observation) => Promise<boolean>; now?: () => number }
/** Coarse, first-party only. No persistence, offline queue, raw query key or automatic retry. */
export function createNativeAnalytics(boundary: Boundary) {
  const attempts = new Map<string, { at: number; result: Promise<boolean> }>(), paused = new Set<string>(), revisions = new Map<string, number>()
  const now = boundary.now ?? Date.now
  const revision = (actorId: string) => revisions.get(actorId) ?? 0
  function recordConsented(actorId: string, coarseKey: string, send: () => Promise<boolean>): Promise<boolean> {
    if (!actorId || paused.has(actorId)) return Promise.resolve(false)
    const key = `${actorId}:${coarseKey}`, previous = attempts.get(key), started = revision(actorId)
    if (previous && now() - previous.at < 60000) return previous.result
    const result = (async () => {
      try {
        const consent = await boundary.consent(actorId)
        if (!consent.allowed || !consent.collectionEnabled || paused.has(actorId) || revision(actorId) !== started) return false
        return await send()
      } catch { return false }
    })()
    attempts.set(key, { at: now(), result })
    if (attempts.size > 128) attempts.delete(attempts.keys().next().value!)
    return result
  }
  return {
    // Callers use fixed coarse keys or a validated first-party placement ID,
    // never a raw search query, address, device identifier or uploaded content.
    recordConsented,
    permission(actorId: string, allowed: boolean) {
      revisions.set(actorId, revision(actorId) + 1)
      if (allowed) paused.delete(actorId); else paused.add(actorId)
      for (const key of attempts.keys()) if (key.startsWith(`${actorId}:`)) attempts.delete(key)
    },
    record(actorId: string, input: unknown): Promise<boolean> {
      const parsed = insightEventSchema.safeParse(input)
      if (!parsed.success) return Promise.resolve(false)
      return recordConsented(actorId, `preference:${JSON.stringify(parsed.data)}`, () => boundary.post(actorId, parsed.data))
    },
  }
}
