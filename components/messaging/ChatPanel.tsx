'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { ArrowUpRight, LoaderCircle, Send, Link2 } from 'lucide-react'
import { createClient } from '@/lib/client'
import { conversationTopic, type ChatThread } from '@/lib/messaging/policy'
import { markThreadReadAction, readThreadAction, sendMessageAction } from '@/app/actions/messageActions'

type Props = { initialThread: ChatThread; realtimeEnabled: boolean }

export function ChatPanel({ initialThread, realtimeEnabled }: Props) {
  const [thread, setThread] = useState(initialThread)
  const [body, setBody] = useState('')
  const [share, setShare] = useState(false)
  const [error, setError] = useState('')
  const [typing, setTyping] = useState(false)
  const [online, setOnline] = useState(false)
  const [pending, startTransition] = useTransition()
  const retryId = useRef<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const broadcastTyping = useRef<(() => void) | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await readThreadAction(initialThread.id)
      if (result.success) {
        setThread(current => ({ ...result.data, messages: [
          ...current.messages.filter(item => item.sentAt < (result.data.messages[0]?.sentAt ?? '')),
          ...result.data.messages,
        ] }))
        if (document.visibilityState === 'visible') await markThreadReadAction(initialThread.id)
      }
    } catch { /* A later refresh retries; sending retains explicit feedback. */ }
  }, [initialThread.id])

  useEffect(() => {
    void markThreadReadAction(initialThread.id)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 8000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh, initialThread.id])

  useEffect(() => {
    if (!realtimeEnabled) return
    const supabase = createClient()
    const channel = supabase.channel(conversationTopic(initialThread.id), {
      config: { private: true, presence: { key: initialThread.userId } },
    })
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Message', filter: `conversation_id=eq.${initialThread.id}` }, () => { void refresh() })
      .on('broadcast', { event: 'typing' }, () => {
        setTyping(true)
        if (typingTimer.current) clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => setTyping(false), 2500)
      })
      .on('presence', { event: 'sync' }, () => {
        setOnline(Object.keys(channel.presenceState()).some(key => key !== initialThread.userId))
      }).subscribe(status => {
        if (status === 'SUBSCRIBED') void channel.track({ active: true }).catch(() => setOnline(false))
      })
    broadcastTyping.current = () => { void channel.send({ type: 'broadcast', event: 'typing', payload: {} }).catch(() => undefined) }
    return () => {
      broadcastTyping.current = null
      if (typingTimer.current) clearTimeout(typingTimer.current)
      void supabase.removeChannel(channel)
    }
  }, [initialThread.id, initialThread.userId, realtimeEnabled, refresh])

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [thread.messages.length])

  return <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-border-subtle bg-surface-card">
    <header className="flex items-center justify-between gap-3 border-b border-border-subtle p-4 sm:p-5">
      <div><h2 className="font-semibold">{thread.otherName}</h2><p className="text-xs text-text-muted">{typing ? 'Typing…' : online ? 'Online' : 'Your rental conversation'}</p></div>
      <Link href={`/marketplace/listing/${thread.listingId}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-accent-hover">View listing <ArrowUpRight className="size-4" /></Link>
    </header>
    <div role="log" aria-label="Conversation messages" aria-live="polite" className="flex max-h-[65dvh] min-h-80 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      {thread.hasMore && <button type="button" className="self-center rounded-full border border-border-subtle px-4 py-2 text-xs text-text-secondary" onClick={() => startTransition(async () => {
        try {
          const result = await readThreadAction(thread.id, thread.messages[0]?.id)
          if (result.success) setThread(current => ({ ...current, hasMore: result.data.hasMore, messages: [...result.data.messages, ...current.messages] }))
          else setError(result.error)
        } catch { setError('Earlier messages could not be loaded.') }
      })} disabled={pending}>Load earlier messages</button>}
      {!thread.messages.length && <p className="my-auto text-center text-sm text-text-muted">Say hello. Ask a question before you book.</p>}
      {thread.messages.map(message => {
        const own = message.senderId === thread.userId
        return <div key={message.id} className={`max-w-[90%] rounded-2xl p-3 sm:max-w-[80%] ${own ? 'self-end bg-accent-muted' : 'self-start border border-border-subtle bg-background-app'}`}>
          {message.sharedListing && <Link href={`/marketplace/listing/${message.sharedListing.id}`} className="mb-2 flex items-center gap-2 rounded-xl border border-glass-border-medium p-3 text-sm text-accent-hover"><Link2 className="size-4" /> View shared {message.sharedListing.category} <ArrowUpRight className="size-4" /></Link>}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{message.body}</p>
          <p className="mt-1 text-right text-[10px] text-text-muted">{new Date(message.sentAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}{own && thread.otherReadAt && message.sentAt <= thread.otherReadAt ? ' · Read' : ''}</p>
        </div>
      })}<div ref={bottom} />
    </div>
    <form className="mt-auto border-t border-border-subtle p-4" onSubmit={event => {
      event.preventDefault()
      if (pending || (!body.trim() && !share)) return
      retryId.current ??= crypto.randomUUID()
      startTransition(async () => {
        setError('')
        try {
          const result = await sendMessageAction({ conversationId: thread.id, clientId: retryId.current, body,
            ...(share ? { sharedListingId: thread.listingId } : {}) })
          if (!result.success) { setError(result.error); return }
          retryId.current = null; setBody(''); setShare(false); await refresh()
        } catch { setError('Connection interrupted. Your draft is still here; try sending again.') }
      })
    }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={share} onChange={event => { setShare(event.target.checked); retryId.current = null }} className="accent-accent-primary" /> Attach this listing</label>
        <span className="text-[10px] text-text-muted">{body.length}/4000</span>
      </div>
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="chat-message">Message</label>
        <textarea id="chat-message" rows={2} maxLength={4000} value={body} placeholder="Write a message…" className="min-w-0 flex-1 resize-none rounded-xl border border-border-subtle bg-background-app p-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary" onChange={event => { setBody(event.target.value); retryId.current = null; broadcastTyping.current?.() }} />
        <button type="submit" disabled={pending || (!body.trim() && !share)} aria-label="Send message" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-primary text-text-inverse disabled:opacity-50">{pending ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-trust-flagged">{error}</p>}
      <p className="mt-3 text-[10px] leading-relaxed text-text-muted">Keep your identity documents and bank details private. Rentral will never ask for your password in a message.</p>
    </form>
  </section>
}
