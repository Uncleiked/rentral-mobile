import { useCallback, useLayoutEffect, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { subscribeAuth } from '../lib/auth'
import { useAuth } from '../providers/AuthProvider'

/** Stops delayed private actions from navigating or opening a browser for a new account. */
export function useActorGuard() {
  const { session } = useAuth(), actorId = session?.user.id ?? ''
  const current = useRef(actorId), focused = useRef(true)
  useLayoutEffect(() => subscribeAuth(value => { current.current = value?.user.id ?? '' }), [])
  useFocusEffect(useCallback(() => {
    focused.current = true
    return () => { focused.current = false }
  }, []))
  const isCurrent = useCallback((captured: string) => Boolean(captured) && current.current === captured && focused.current, [])
  return { actorId, isCurrent }
}
