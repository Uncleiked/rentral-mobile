import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { useAuth } from '../providers/AuthProvider'
import { ApiError, errorMessage } from '../lib/api'
import { loadThread, type NativeThread } from '../lib/messaging-api'
import { mergeLatestThread, mergeOlderThread } from '../lib/conversation-window'
import { dismissPendingMessage, loadPendingMessage, submitPendingMessage, type PendingMessage } from '../lib/message-pending-store'
import type { Listing } from '../lib/types'

export function useNativeConversation(id: string, validId: boolean) {
  const { session } = useAuth()
  const actorId = session?.user.id ?? ''
  const key = `${actorId}:${id}`
  const actor = useRef(key)
  useEffect(() => { actor.current = key }, [key])
  const [window, setWindow] = useState<{ thread: NativeThread | null; gap: boolean }>({ thread: null, gap: false })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [shared, setShared] = useState<Listing | null>(null)
  const [outbox, setOutbox] = useState<{ key: string; record: PendingMessage | null; error: string | null } | null>(null)
  const [sending, setSending] = useState(false)
  const [checked, setChecked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const active = useRef(false)
  const generation = useRef(0)
  const sendLock = useRef(false)
  const latestRequest = useRef<AbortController | null>(null)
  const olderRequest = useRef<AbortController | null>(null)
  const current = window.thread?.id === id && window.thread.userId === actorId ? window.thread : null
  const recovery = outbox?.key === key ? outbox : null
  const denied = useCallback(() => { setWindow({ thread: null, gap: false }); setError('This conversation is unavailable to your account.'); setNotice(null) }, [])
  const refresh = useCallback(async (): Promise<NativeThread> => {
    latestRequest.current?.abort()
    const controller = new AbortController(), started = generation.current
    latestRequest.current = controller
    try {
      const next = await loadThread(id, actorId, undefined, controller.signal)
      if (active.current && generation.current === started && !controller.signal.aborted && AppState.currentState === 'active') {
        setWindow(previous => {
          const result = mergeLatestThread(previous.thread, next)
          return { thread: result.thread, gap: result.gap || (previous.thread?.id === next.id && previous.thread.userId === next.userId && previous.gap) }
        }); setError(null)
      }
      return next
    } catch (reason) {
      if (active.current && generation.current === started && !controller.signal.aborted) {
        if (reason instanceof ApiError && ([401, 403, 404].includes(reason.status) || reason.code === 'INVALID_RESPONSE')) setWindow({ thread: null, gap: false })
        setError(errorMessage(reason))
      }
      throw reason
    } finally { if (active.current && generation.current === started && latestRequest.current === controller) setLoading(false) }
  }, [actorId, id])
  useFocusEffect(useCallback(() => {
    if (!validId || !actorId) return
    active.current = true; generation.current++; setChecked(false)
    const started = generation.current
    void loadPendingMessage(actorId, id).then(record => {
      if (active.current && generation.current === started) setOutbox({ key, record, error: null })
    }, reason => { if (active.current && generation.current === started) setOutbox({ key, record: null, error: errorMessage(reason) }) })
    let fetching = false
    const reload = () => {
      if (AppState.currentState !== 'active' || fetching) return
      fetching = true; void refresh().catch(() => undefined).finally(() => { fetching = false })
    }
    reload()
    const timer = setInterval(reload, 5000)
    const listener = AppState.addEventListener('change', state => { if (state === 'active') reload(); else latestRequest.current?.abort() })
    return () => { active.current = false; generation.current++; latestRequest.current?.abort(); olderRequest.current?.abort(); clearInterval(timer); listener.remove() }
  }, [actorId, id, validId, key, refresh]))

  async function loadOlder(): Promise<void> {
    const anchor = current?.messages[0]?.id
    if (!current?.hasMore || !anchor || loadingOlder || olderRequest.current) return
    const controller = new AbortController(), started = generation.current
    olderRequest.current = controller; setLoadingOlder(true)
    try {
      const older = await loadThread(id, actorId, anchor, controller.signal)
      if (active.current && generation.current === started && !controller.signal.aborted) setWindow(previous => {
        const thread = mergeOlderThread(previous.thread, older, anchor)
        return thread === previous.thread ? previous : { thread, gap: false }
      })
    } catch (reason) { if (active.current && !controller.signal.aborted) {
      if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) setWindow({ thread: null, gap: false })
      setError(errorMessage(reason))
    } }
    finally { if (olderRequest.current === controller) { olderRequest.current = null; setLoadingOlder(false) } }
  }
  async function send(): Promise<void> {
    if (sendLock.current || !current || !recovery || recovery.error || (recovery.record && !checked && !recovery.record.confirmedId)) return
    const record = recovery.record
    const command = record?.command ?? { clientId: Crypto.randomUUID(), body: draft.trim(), ...(shared ? { sharedListingId: shared.id } : {}) }
    if (!command.body && !command.sharedListingId) return
    const captured = key
    sendLock.current = true; setSending(true); setError(null); setNotice(null); setChecked(false)
    setOutbox({ key, record: record ?? { command }, error: null })
    try {
      const result = await submitPendingMessage(actorId, id, command)
      if (actor.current === captured) {
        setOutbox({ key: captured, record: result.cleanupPending ? { command, confirmedId: result.id } : null, error: null })
        setDraft(value => value.trim() === command.body ? '' : value); setShared(null)
        setNotice(result.cleanupPending ? 'Message acknowledged. Its recovery record could not be cleared; confirm it before sending different text.' : 'Message sent.')
        void refresh().catch(() => undefined)
      }
    } catch (reason) {
      if (actor.current === captured) {
        setError(errorMessage(reason))
        try { const saved = await loadPendingMessage(actorId, id); if (actor.current === captured) setOutbox({ key: captured, record: saved, error: null }) }
        catch (failure) { if (actor.current === captured) setOutbox({ key: captured, record: null, error: errorMessage(failure) }) }
      }
    } finally { sendLock.current = false; setSending(false) }
  }
  async function check(): Promise<void> {
    if (sendLock.current) return
    const captured = key
    try { await refresh(); if (actor.current === captured && active.current) { setChecked(true); setNotice('Latest messages loaded. Older messages can be outside this window. A retry below uses the original message identifier and content.') } }
    catch { /* The refresh error remains visible beside the preserved draft. */ }
  }
  async function dismiss(): Promise<void> {
    if (sendLock.current || !checked) return
    const captured = key
    sendLock.current = true; setSending(true)
    try { await dismissPendingMessage(actorId, id); if (actor.current === captured) { setOutbox({ key: captured, record: null, error: null }); setChecked(false); setNotice('Local recovery dismissed. This does not delete a message already delivered.') } }
    catch (reason) { if (actor.current === captured) setError(errorMessage(reason)) }
    finally { sendLock.current = false; setSending(false) }
  }
  return { actorId, thread: current, loading, loadingOlder, error, gap: Boolean(current && window.gap), draft, setDraft, shared, setShared, recovery, sending, checked, notice, send, refresh, check, dismiss, loadOlder, denied }
}
