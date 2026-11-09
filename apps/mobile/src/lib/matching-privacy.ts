const epochs = new Map<string, number>()
const listeners = new Set<() => void>()
export function matchingPrivacyEpoch(actorId: string): number { return epochs.get(actorId) ?? 0 }
export function invalidateMatchingPrivacy(actorId: string): void {
  if (!actorId) return
  epochs.set(actorId, matchingPrivacyEpoch(actorId) + 1)
  for (const listener of listeners) listener()
}
export function subscribeMatchingPrivacy(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener) } }
