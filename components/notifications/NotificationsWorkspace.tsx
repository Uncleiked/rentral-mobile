'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, RefreshCw } from 'lucide-react'
import { notificationPageSchema, type Notification } from '@/lib/contracts/notifications'
import { socialError, socialRequest } from '@/lib/social/client'
import { NotificationItem } from './NotificationItem'
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50'
export function NotificationsWorkspace({ actorId }: { actorId: string }) {
  const [items, setItems] = useState<Notification[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState('')
  const active = useRef(true), sequence = useRef(0), current = useRef<Notification[]>([]), olderLoaded = useRef(false)
  const load = useCallback(async (next: string | null = null, quiet = false) => {
    const request = ++sequence.current; if (!quiet) setBusy(true)
    try {
      const params = new URLSearchParams({ limit: '20' }); if (next) params.set('cursor', next)
      const page = await socialRequest('/api/v1/notifications?' + params, notificationPageSchema, undefined, actorId)
      if (!active.current || request !== sequence.current) return
      setError('')
      if (next) { olderLoaded.current = true; current.current = [...current.current, ...page.items.filter(item => !current.current.some(existing => existing.id === item.id))]; setCursor(page.nextCursor) }
      else if (quiet && olderLoaded.current && page.items.some(item => current.current.some(existing => existing.id === item.id))) current.current = [...page.items, ...current.current.filter(item => !page.items.some(latest => latest.id === item.id))]
      else { current.current = page.items; olderLoaded.current = false; setCursor(page.nextCursor) }
      setItems(current.current)
    } catch (reason) { if (active.current && request === sequence.current) setError(socialError(reason)) }
    finally { if (active.current && request === sequence.current) setBusy(false) }
  }, [actorId])
  useEffect(() => {
    active.current = true
    const initial = setTimeout(() => { void load() }, 0)
    const refresh = () => { if (document.visibilityState === 'visible') void load(null, true) }
    const timer = setInterval(refresh, 20000)
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh)
    return () => { active.current = false; clearTimeout(initial); clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh) }
  }, [load])
  function read(id: string, readAt: string) { current.current = current.current.map(item => item.id === id ? { ...item, readAt } : item); setItems(current.current) }
  return <section className="min-w-0"><header className="mb-6 flex min-w-0 flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-accent-hover">In the loop</p><h1 className="mt-2 text-3xl font-semibold">Notifications</h1><p className="mt-3 text-sm leading-6 text-text-muted">Follows, likes, messages and rental updates in one place.</p></div><button type="button" disabled={busy} className={button} onClick={() => { void load() }}><RefreshCw className={'size-4 ' + (busy ? 'animate-spin' : '')} />Refresh</button></header>{error && <div className="mb-4 rounded-xl border border-border-subtle p-4"><p role="alert" className="break-words text-sm leading-6 text-trust-flagged">{error}</p><button type="button" className={button + ' mt-3'} disabled={busy} onClick={() => { void load() }}>Try again</button></div>}<div className="space-y-3" aria-busy={busy}>{items.map(item => <NotificationItem key={item.id} id={item.id} title={item.title} body={item.body} href={item.href} read={Boolean(item.readAt)} date={item.createdAt} kind={item.kind} actorId={actorId} onRead={read} />)}</div>{busy && !items.length && <p role="status" className="py-5 text-sm text-text-muted">Loading notifications...</p>}{!busy && !error && !items.length && <div className="rounded-2xl border border-border-subtle bg-surface-card p-8 text-center"><Bell className="mx-auto mb-4 size-10 text-accent-primary" /><h2 className="text-xl font-semibold">You are all caught up.</h2><p className="mt-3 text-sm leading-6 text-text-muted">New followers, listing likes, messages and booking updates will appear here.</p><Link href="/marketplace" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-accent-hover">Explore Rentral</Link></div>}{cursor && <button type="button" className={button + ' mt-5'} disabled={busy} onClick={() => { void load(cursor) }}>Load earlier notifications</button>}</section>
}
