'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { conversationActivitySchema, type ConversationActivity } from '@/lib/contracts/messaging'

export function useConversationActivity(id: string, userId: string, body: string) {
  const [activity, setActivity] = useState<ConversationActivity | null>(null)
  const [shareActivity, setShareActivity] = useState(true)
  const typingRef = useRef({ hasText: false, editedAt: 0 })
  const heartbeatRef = useRef<(() => Promise<void>) | null>(null)
  const lastHeartbeat = useRef(0)
  const path = `/api/v1/messages/${encodeURIComponent(id)}/activity`
  const clear = useCallback(() => {
    void fetch(path, { method: 'DELETE', keepalive: true, headers: { 'X-Rentral-Account': userId } }).catch(() => undefined)
  }, [path, userId])

  useEffect(() => {
    typingRef.current = { hasText: Boolean(body.trim()), editedAt: Date.now() }
    void heartbeatRef.current?.()
  }, [body])
  useEffect(() => {
    let active = true, busy = false
    const read = async () => {
      if (!active || busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        const response = await fetch(path, { cache: 'no-store', headers: { 'X-Rentral-Account': userId } })
        const payload = await response.json()
        if (active && response.ok && payload.success === true) setActivity(conversationActivitySchema.parse(payload.data))
        else if (active) setActivity(null)
      } catch { if (active) setActivity(null) }
      finally { busy = false }
    }
    const heartbeat = async () => {
      if (!active || !shareActivity || document.visibilityState !== 'visible' || Date.now() - lastHeartbeat.current < 5000) return
      lastHeartbeat.current = Date.now()
      try { await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rentral-Account': userId }, body: JSON.stringify({ typing: typingRef.current.hasText && Date.now() - typingRef.current.editedAt < 8000 }) }) }
      catch { /* Presence is advisory; message persistence has its own recovery. */ }
    }
    heartbeatRef.current = heartbeat
    const focus = () => {
      if (document.visibilityState === 'visible') { void read(); void heartbeat() }
      else { setActivity(null); if (shareActivity) clear() }
    }
    const start = setTimeout(focus, 0)
    const reader = setInterval(() => { void read() }, 5000)
    const writer = setInterval(() => { void heartbeat() }, 20000)
    // Typing changes are coalesced and bounded by the same write cooldown.
    const typingTimer = setInterval(() => { if (typingRef.current.hasText && Date.now() - typingRef.current.editedAt < 8000) void heartbeat() }, 6000)
    window.addEventListener('focus', focus); window.addEventListener('online', focus)
    document.addEventListener('visibilitychange', focus)
    if (!shareActivity) clear()
    return () => {
      active = false; clearTimeout(start); clearInterval(reader); clearInterval(writer); clearInterval(typingTimer)
      if (heartbeatRef.current === heartbeat) heartbeatRef.current = null
      window.removeEventListener('focus', focus); window.removeEventListener('online', focus); document.removeEventListener('visibilitychange', focus)
      if (shareActivity) clear()
    }
  }, [clear, path, userId, shareActivity])
  return { activity, shareActivity, setShareActivity }
}
