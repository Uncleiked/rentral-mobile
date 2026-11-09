import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import type { z } from 'zod'
import { ApiError, errorMessage } from '../lib/api'
import { memberGet } from '../lib/member-api'
import type { CursorPage } from '../lib/member-contracts'
import { useAuth } from '../providers/AuthProvider'
import { createMemberResourceScope, currentMemberResult, type ScopedMemberResult } from '../lib/member-resource-scope'

export function useMemberResource<T>(path: string, schema: z.ZodType<T>, enabled = true, pollMs = 0) {
  const { session } = useAuth()
  const actorId = session?.user.id ?? ''
  const [result, setResult] = useState<ScopedMemberResult<T> | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [scope] = useState(createMemberResourceScope)
  const request = useRef<AbortController | null>(null)
  const refresh = useCallback(async (showProgress = false): Promise<T> => {
    const lease = scope.capture(actorId, path)
    if (!lease || !actorId) throw new ApiError('Reopen this screen for your signed-in account before refreshing.', 'ACCOUNT_CHANGED', 409)
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    if (showProgress) setRefreshing(true)
    try {
      const data = await memberGet(path, schema, controller.signal, actorId)
      if (scope.accepts(lease) && !controller.signal.aborted) setResult({ actorId, path, data, error: null })
      return data
    } catch (reason) {
      if (scope.accepts(lease) && !controller.signal.aborted) setResult(previous => ({ actorId, path,
        data: reason instanceof ApiError && [401, 403, 404].includes(reason.status) ? null : currentMemberResult(previous, actorId, path)?.data ?? null,
        error: errorMessage(reason),
      }))
      throw reason
    } finally { if (scope.accepts(lease) && request.current === controller) setRefreshing(false) }
  }, [actorId, path, schema, scope])
  useFocusEffect(useCallback(() => {
    if (!enabled || !actorId) return
    const lease = scope.activate(actorId, path)
    const reload = (): void => { if (AppState.currentState === 'active') void refresh().catch(() => undefined) }
    reload()
    const listener = AppState.addEventListener('change', state => { if (state === 'active') reload() })
    const timer = pollMs > 0 ? setInterval(reload, pollMs) : undefined
    return () => { scope.release(lease); request.current?.abort(); listener.remove(); if (timer) clearInterval(timer) }
  }, [enabled, actorId, path, refresh, pollMs, scope]))
  const replace = useCallback((data: T): void => {
    if (!scope.capture(actorId, path)) return
    request.current?.abort()
    setResult({ actorId, path, data, error: null }); setRefreshing(false)
  }, [actorId, path, scope])
  const clear = useCallback((message: string | null = null): void => {
    if (!scope.capture(actorId, path)) return
    request.current?.abort()
    setResult({ actorId, path, data: null, error: message }); setRefreshing(false)
  }, [actorId, path, scope])
  const current = currentMemberResult(result, actorId, path)
  return { actorId, data: current?.data ?? null, error: current?.error ?? null, loading: enabled && !current, refreshing, refresh, replace, clear }
}

export function useMemberPages<T extends { id: string }>(path: string, schema: z.ZodType<CursorPage<T>>, enabled = true, pollMs = 0) {
  const first = useMemberResource(path, schema, enabled, pollMs)
  const [extra, setExtra] = useState<{ base: CursorPage<T>; items: T[]; nextCursor: string | null } | null>(null)
  const [pending, setPending] = useState<CursorPage<T> | null>(null)
  const [failure, setFailure] = useState<{ base: CursorPage<T>; message: string } | null>(null)
  const current = useRef(first.data)
  const request = useRef<AbortController | null>(null)
  useEffect(() => { current.current = first.data; return () => { request.current?.abort(); request.current = null } }, [path, first.data])
  const matching = extra?.base === first.data ? extra : null
  const nextCursor = matching ? matching.nextCursor : first.data?.nextCursor
  const loadMore = useCallback(async (): Promise<void> => {
    if (!first.data || !nextCursor || request.current) return
    const base = first.data
    const controller = new AbortController()
    request.current = controller; setPending(base); setFailure(null)
    try {
      const next = await memberGet(`${path}${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(nextCursor)}`, schema, controller.signal, first.actorId)
      if (!controller.signal.aborted && current.current === base) setExtra(previous => {
        const existing = previous?.base === base ? previous.items : []
        const seen = new Set([...base.items, ...existing].map(item => item.id))
        return { base, items: [...existing, ...next.items.filter(item => !seen.has(item.id))], nextCursor: next.nextCursor }
      })
    } catch (reason) { if (!controller.signal.aborted && current.current === base) setFailure({ base, message: errorMessage(reason) }) }
    finally { if (request.current === controller) { request.current = null; setPending(null) } }
  }, [first.actorId, first.data, nextCursor, path, schema])
  return { ...first, items: [...(first.data?.items ?? []), ...(matching?.items ?? [])], hasMore: Boolean(nextCursor), loadingMore: pending !== null && pending === first.data,
    moreError: failure?.base === first.data ? failure.message : null, loadMore }
}
