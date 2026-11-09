import { useCallback, useSyncExternalStore } from 'react'
import { matchingPrivacyEpoch, subscribeMatchingPrivacy } from '../lib/matching-privacy'
export function useMatchingPrivacy(actorId: string) {
  const snapshot = useCallback(() => matchingPrivacyEpoch(actorId), [actorId])
  return useSyncExternalStore(subscribeMatchingPrivacy, snapshot, snapshot)
}
