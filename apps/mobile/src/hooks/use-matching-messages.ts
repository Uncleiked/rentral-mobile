import { useCallback, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { loadMatchingMessages } from '../lib/matching-api'
import { latestMatchingWindow, olderMatchingWindow, type MatchingMessagesPage } from '../lib/matching-message-window'
import { ApiError, errorMessage } from '../lib/api'

export function useMatchingMessages(id: string, actorId: string, enabled: boolean, onDenied: () => void) {
  const key = `${actorId}:${id}`
  const [window, setWindow] = useState<{ key: string; page: MatchingMessagesPage; gap: boolean } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [loading, setLoading] = useState(false), [loadingOlder, setLoadingOlder] = useState(false)
  const request = useRef<AbortController | null>(null), olderRequest = useRef<AbortController | null>(null), generation = useRef(0), active = useRef(false)
  const current = enabled && window?.key === key ? window : null
  const clear = useCallback(() => { request.current?.abort(); olderRequest.current?.abort(); setWindow(null) }, [])
  const refresh = useCallback(async () => {
    if (!enabled || !active.current) throw new ApiError('This matching contact is unavailable.', 'NOT_FOUND', 404)
    const started = generation.current, controller = new AbortController()
    request.current?.abort(); request.current = controller
    try {
      const next = await loadMatchingMessages(id, actorId, undefined, controller.signal)
      if (active.current && started === generation.current && !controller.signal.aborted && AppState.currentState === 'active') {
        setWindow(previous => {
          const result = latestMatchingWindow(previous?.key === key ? previous.page : null, next)
          return { key, page: result.page, gap: result.gap || Boolean(previous?.key === key && previous.gap) }
        }); setFailure(null)
      }
      return next
    } catch (reason) {
      if (active.current && started === generation.current && !controller.signal.aborted) {
        if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) { setWindow(null); onDenied() }
        setFailure({ key, message: errorMessage(reason) })
      }
      throw reason
    } finally { if (active.current && started === generation.current && request.current === controller) setLoading(false) }
  }, [actorId, enabled, id, key, onDenied])
  useFocusEffect(useCallback(() => {
    if (!enabled || !actorId) { clear(); return }
    active.current = true; generation.current++; setLoading(true)
    let fetching = false
    const reload = () => { if (AppState.currentState === 'active' && !fetching) { fetching = true; void refresh().catch(() => undefined).finally(() => { fetching = false }) } }
    reload()
    const timer = setInterval(reload, 5000), listener = AppState.addEventListener('change', state => { if (state === 'active') reload(); else request.current?.abort() })
    return () => { active.current = false; generation.current++; request.current?.abort(); olderRequest.current?.abort(); clearInterval(timer); listener.remove() }
  }, [actorId, enabled, clear, refresh]))
  async function loadOlder() {
    const cursor = current?.page.nextCursor, anchor = current?.page.items[0]?.id
    if (!cursor || !anchor || olderRequest.current) return
    const controller = new AbortController(), started = generation.current
    olderRequest.current = controller; setLoadingOlder(true)
    try {
      const next = await loadMatchingMessages(id, actorId, cursor, controller.signal)
      if (active.current && started === generation.current && !controller.signal.aborted) setWindow(previous => {
        if (!previous || previous.key !== key) return previous
        const page = olderMatchingWindow(previous.page, next, anchor)
        return !page || page === previous.page ? previous : { key, page, gap: false }
      })
    } catch (reason) {
      if (active.current && !controller.signal.aborted) {
        if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) { setWindow(null); onDenied() }
        setFailure({ key, message: errorMessage(reason) })
      }
    } finally { if (olderRequest.current === controller) { olderRequest.current = null; setLoadingOlder(false) } }
  }
  return { page: current?.page ?? null, gap: current?.gap ?? false, error: failure?.key === key ? failure.message : null, loading: enabled && loading, loadingOlder, refresh, loadOlder, clear }
}
