import { useCallback, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import type { ConversationActivity } from '../../../../lib/contracts/messaging'
import { clearThreadActivity, loadThreadActivity, markThreadRead, publishThreadActivity } from '../lib/messaging-api'
import { ApiError } from '../lib/api'
import { activityPost } from '../lib/conversation-activity'

export function useConversationActivity(id: string, actorId: string, enabled: boolean, onDenied: () => void) {
  const [snapshot, setSnapshot] = useState<{ key: string; activity: ConversationActivity | null } | null>(null)
  const typedAt = useRef(0)
  const visibleMessage = useRef<string | null>(null)
  const key = `${actorId}:${id}`
  const typing = useCallback((value: string) => { typedAt.current = value.trim() ? Date.now() : 0 }, [])
  const displayed = useCallback((messageId: string | null) => { visibleMessage.current = messageId }, [])
  useFocusEffect(useCallback(() => {
    if (!enabled || !actorId) return
    let active = true, fetching = false, writing = false, reading = false
    let lastPost = 0, lastTyping = false, lastRead = 0, readId: string | null = null
    const controller = new AbortController()
    const usable = () => active && AppState.currentState === 'active'
    const failed = (reason: unknown) => {
      if (!active) return
      setSnapshot({ key, activity: null })
      if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) onDenied()
    }
    const poll = async () => {
      if (!usable() || fetching) return
      fetching = true
      try { const activity = await loadThreadActivity(id, actorId, controller.signal); if (usable()) setSnapshot({ key, activity }) }
      catch (reason) { if (usable() && !controller.signal.aborted) failed(reason) }
      finally { fetching = false }
    }
    const tick = () => {
      if (!usable()) return
      const now = Date.now(), decision = activityPost(now, lastPost, lastTyping, typedAt.current)
      // Typing shares the heartbeat; it cannot issue a request for every keystroke.
      if (!writing && decision.due) {
        writing = true; lastPost = now; lastTyping = decision.typing
        void publishThreadActivity(id, actorId, decision.typing).catch(failed).finally(() => { writing = false })
      }
      const messageId = visibleMessage.current
      if (!reading && messageId && messageId !== readId && now - lastRead >= 15000) {
        reading = true; lastRead = now
        void markThreadRead(id, actorId, messageId).then(() => { readId = messageId }, failed).finally(() => { reading = false })
      }
    }
    void poll(); tick()
    const pollTimer = setInterval(() => { void poll() }, 5000)
    const activityTimer = setInterval(tick, 1000)
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') { void poll(); tick() }
      else { typedAt.current = 0; setSnapshot({ key, activity: null }); void clearThreadActivity(id, actorId).catch(() => undefined) }
    })
    return () => {
      active = false; controller.abort(); typedAt.current = 0; visibleMessage.current = null
      clearInterval(pollTimer); clearInterval(activityTimer); listener.remove()
      void clearThreadActivity(id, actorId).catch(() => undefined)
    }
  }, [enabled, actorId, id, key, onDenied]))
  return { activity: snapshot?.key === key ? snapshot.activity : null, typing, displayed }
}
