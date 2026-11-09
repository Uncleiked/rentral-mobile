import { useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../providers/AuthProvider'
import { nativeAnalytics } from '../lib/native-analytics'
import type { z } from 'zod'
import type { insightEventSchema } from '../../../../lib/analytics/policy'
export function useNativeObservation(observation: z.infer<typeof insightEventSchema> | null) {
  const { session } = useAuth(), actorId = session?.user.id ?? ''
  const key = observation ? JSON.stringify(observation) : ''
  useFocusEffect(useCallback(() => {
    if (actorId && key) void nativeAnalytics.record(actorId, JSON.parse(key))
  }, [actorId, key]))
}
