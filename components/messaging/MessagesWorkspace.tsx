'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { ArrowLeft, MessageCircle, RefreshCw, UsersRound } from 'lucide-react'
import { messageInboxPageSchema, messageThreadSchema } from '@/lib/contracts/messaging'
import { socialError, socialRequest } from '@/lib/social/client'
import { ChatPanel } from './ChatPanel'
import { MessageStarter } from './MessageStarter'
import { DirectMessageStarter } from './DirectMessageStarter'
type Folder = 'primary' | 'requests' | 'sent'
type InboxItem = z.infer<typeof messageInboxPageSchema>['items'][number]
type Thread = z.infer<typeof messageThreadSchema>
const folders: { id: Folder; label: string; description: string }[] = [{ id: 'primary', label: 'Primary', description: 'Accepted conversations, mutual followers and rental enquiries.' }, { id: 'requests', label: 'Requests', description: 'New introductions that need your approval.' }, { id: 'sent', label: 'Sent requests', description: 'Your introductions awaiting a reply or acceptance.' }]
const button = 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50'
export function MessagesWorkspace({ actorId, threadId, listingId, recipientId, initialFolder = 'primary' }: { actorId: string; threadId?: string; listingId?: string; recipientId?: string; initialFolder?: Folder }) {
  const [folder, setFolder] = useState<Folder>(initialFolder), [items, setItems] = useState<InboxItem[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [thread, setThread] = useState<Thread | null>(null), [busy, setBusy] = useState(true), [threadBusy, setThreadBusy] = useState(Boolean(threadId))
  const [error, setError] = useState(''), [threadError, setThreadError] = useState('')
  const active = useRef(true), sequence = useRef(0)
  const load = useCallback(async (next: string | null = null) => {
    const request = ++sequence.current; setBusy(true); setError('')
    try {
      const params = new URLSearchParams({ folder, limit: '20' }); if (next) params.set('cursor', next)
      const page = await socialRequest('/api/v1/messages?' + params, messageInboxPageSchema, undefined, actorId)
      if (active.current && sequence.current === request) { setItems(current => next ? [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))] : page.items); setCursor(page.nextCursor) }
    } catch (reason) { if (active.current && sequence.current === request) setError(socialError(reason)) }
    finally { if (active.current && sequence.current === request) setBusy(false) }
  }, [actorId, folder])
  const loadThread = useCallback(async () => {
    if (!threadId) return
    setThreadBusy(true); setThreadError('')
    try { const value = await socialRequest('/api/v1/messages/' + threadId, messageThreadSchema, undefined, actorId); if (active.current) { setThread(value); setFolder(value.folder) } }
    catch (reason) { if (active.current) setThreadError(socialError(reason)) }
    finally { if (active.current) setThreadBusy(false) }
  }, [actorId, threadId])
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { const start = setTimeout(() => { void load() }, 0); const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 20000); const focus = () => { if (document.visibilityState === 'visible') void load() }; window.addEventListener('focus', focus); window.addEventListener('online', focus); return () => { clearTimeout(start); clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('online', focus) } }, [load])
  useEffect(() => { const start = setTimeout(() => { void loadThread() }, 0); return () => clearTimeout(start) }, [loadThread])
  const inboxChanged = useCallback((next?: Folder) => { if (next && next !== folder) { setItems([]); setCursor(null); setFolder(next) } else void load() }, [folder, load])
  const selected = Boolean(threadId || listingId || recipientId)
  return <div className="min-w-0"><div className="mb-5 flex min-w-0 flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-accent-hover">Stay connected</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Inbox</h1></div><Link href="/marketplace/people" className={button}><UsersRound className="size-4" />Find people</Link></div><div className="flex min-w-0 items-start gap-5"><aside aria-label="Conversations" className={'min-w-0 w-full shrink-0 space-y-4 md:w-72 ' + (selected ? 'hidden md:block' : '')}><nav aria-label="Inbox folders" className="grid min-w-0 grid-cols-3 gap-1 rounded-xl border border-border-subtle p-1">{folders.map(item => <button type="button" key={item.id} aria-current={folder === item.id ? 'page' : undefined} onClick={() => { setItems([]); setCursor(null); setFolder(item.id) }} className={'min-h-11 min-w-0 rounded-lg px-2 py-2 text-xs font-semibold ' + (folder === item.id ? 'bg-accent-muted text-accent-hover' : 'text-text-muted hover:bg-glass-light')}>{item.label}</button>)}</nav><p className="text-xs leading-5 text-text-muted">{folders.find(item => item.id === folder)?.description}</p><div className="space-y-2" aria-busy={busy}>{items.map(item => <Link key={item.id} href={'/marketplace/messages?id=' + item.id + '&folder=' + folder} aria-current={item.id === threadId ? 'page' : undefined} className={'block min-w-0 rounded-2xl border p-4 ' + (item.id === threadId ? 'border-accent-primary bg-accent-muted' : 'border-border-subtle bg-surface-card')}><div className="flex min-w-0 items-center gap-2"><p className="min-w-0 flex-1 truncate font-semibold">{item.otherName}</p>{item.unread && <span className="size-2 shrink-0 rounded-full bg-accent-primary"><span className="sr-only">Unread messages</span></span>}</div><p className="mt-1 truncate text-sm text-text-muted">{item.lastMessage || 'Start the conversation'}</p>{item.kind === 'listing' && <span className="mt-2 inline-block text-[10px] text-text-muted">Rental enquiry</span>}</Link>)}</div>{busy && !items.length && <p role="status" className="text-sm text-text-muted">Loading conversations...</p>}{!busy && !error && !items.length && <p className="rounded-2xl border border-border-subtle p-5 text-sm leading-6 text-text-muted">{folder === 'requests' ? 'No message requests. New introductions appear here.' : folder === 'sent' ? 'No pending introductions. Find a member to start a conversation.' : 'No conversations yet. Message a host or find people you know.'}</p>}{error && <div><p role="alert" className="break-words text-xs leading-5 text-trust-flagged">{error}</p><button type="button" className={button + ' mt-2'} onClick={() => { void load() }}><RefreshCw className="size-4" />Retry inbox</button></div>}{cursor && <button type="button" className={button} disabled={busy} onClick={() => { void load(cursor) }}>Load more conversations</button>}</aside><div className={'min-w-0 flex-1 ' + (!selected ? 'hidden md:block' : '')}>{selected && <Link href={'/marketplace/messages?folder=' + folder} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-text-muted md:hidden"><ArrowLeft className="size-4" />All conversations</Link>}{threadBusy && <p role="status" className="rounded-2xl border border-border-subtle p-5 text-sm text-text-muted">Opening conversation...</p>}{!threadBusy && thread && <ChatPanel key={thread.id} initialThread={thread} onInboxChange={inboxChanged} />}{threadError && <div className="rounded-2xl border border-border-subtle p-5"><p role="alert" className="break-words text-sm text-trust-flagged">{threadError}</p><button type="button" className={button + ' mt-3'} onClick={() => { void loadThread() }}>Retry conversation</button></div>}{!threadId && recipientId ? <DirectMessageStarter recipientId={recipientId} actorId={actorId} /> : !threadId && listingId ? <MessageStarter listingId={listingId} /> : !selected && <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-border-subtle p-8 text-center"><MessageCircle className="mb-4 size-10 text-accent-primary" /><h2 className="text-xl font-semibold">Make your next move.</h2><p className="mt-2 text-sm leading-6 text-text-muted">Choose a conversation, find a member, or discover a listing you love.</p></div>}</div></div></div>
}
