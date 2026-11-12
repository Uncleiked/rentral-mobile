'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { z } from 'zod'
import { matchConnectionSchema, matchMessagePageSchema, type MatchConnection, type MatchMessage } from '@/lib/matching/contracts'
import { matchingButton, matchingField, matchingIdSchema, matchingSecondary, MatchingRequestError } from '@/lib/matching/client'
import { useMatchingRequest } from '@/components/account/ApiActorScope'
import { MatchingReport } from './MatchingReport'

export function MatchingConversation({ id }: { id: string }) {
  const matchingRequest = useMatchingRequest()
  const [contact, setContact] = useState<MatchConnection | null>(null), [messages, setMessages] = useState<MatchMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(null), [body, setBody] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState('')
  const [pending, startTransition] = useTransition(), [uncertain, setUncertain] = useState(false)
  const [reportContext, setReportContext] = useState<{ profileId: string; connectionId: string } | null>(null)
  const retry = useRef<{ clientId: string; body: string } | null>(null), readThrough = useRef<string | null>(null), loading = useRef(false)
  const load = useCallback(async () => {
    if (loading.current) return false
    loading.current = true
    try {
      const current = await matchingRequest(`squat-mates/connections/${id}`, matchConnectionSchema)
      const page = current.status === 'accepted' ? await matchingRequest(`squat-mates/connections/${id}/messages?limit=30`, matchMessagePageSchema) : null
      setContact(current); setMessages(page?.items ?? []); setCursor(page?.nextCursor ?? null); setError('')
      const confirmed = retry.current && page?.items.some(item => item.own && item.clientId === retry.current?.clientId && item.body === retry.current.body)
      if (confirmed) { retry.current = null; setBody(''); setUncertain(false); setMessage('Your message is in the conversation.') }
      const latestOther = page?.items.findLast(item => !item.own)
      if (latestOther && readThrough.current !== latestOther.id) {
        await matchingRequest(`squat-mates/connections/${id}/read`, z.object({ readAt: z.string().datetime({ offset: true }) }), { method: 'POST', body: { messageId: latestOther.id } })
        readThrough.current = latestOther.id
      }
      return true
    } catch (failure) {
      // Clear sensitive cached contents whenever current authorization cannot be verified.
      setContact(null); setMessages([]); setCursor(null)
      setError(failure instanceof Error ? failure.message : 'This conversation is unavailable.')
      try { setReportContext(await matchingRequest(`squat-mates/connections/${id}/report-context`, z.object({ profileId: z.uuid(), connectionId: z.uuid() }).strict())) }
      catch { setReportContext(null) }
      return false
    } finally { loading.current = false }
  }, [id, matchingRequest])
  useEffect(() => { const first = setTimeout(() => void load(), 0); const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5000); return () => { clearTimeout(first); clearInterval(timer) } }, [load])
  const decide = (decision: 'accept' | 'decline' | 'close') => startTransition(async () => {
    try { await matchingRequest(`squat-mates/connections/${id}`, z.object({ status: z.enum(['accepted', 'declined', 'closed']) }), { method: 'PATCH', body: { decision } }); setContact(null); setMessages([]); await load() }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Refresh contacts before trying again.') }
  })
  return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 min-w-0"><Link href="/marketplace/squat-mates" className={matchingSecondary}>Back to matching</Link><button className={matchingSecondary} onClick={() => void load()}>Refresh conversation</button></div>
    {error && <div className="rounded-2xl border border-border-subtle p-6"><p role="status" className="text-sm text-text-muted">{error}</p>{reportContext && <MatchingReport {...reportContext} />}</div>}
    {contact && <><header className="rounded-2xl border border-border-subtle bg-surface-card p-5 min-w-0 max-w-full wrap-anywhere text-text-primary"><h1 className="text-2xl font-semibold break-words">{contact.other.username ? `@${contact.other.username}` : 'Rentral member'}</h1><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{contact.other.bio}</p><p className="mt-3 text-xs text-text-muted">{contact.status === 'accepted' ? 'Both members accepted this conversation.' : contact.requestedByMe ? 'Your request is waiting for their response.' : 'This member would like to talk about sharing a home.'}</p>{contact.status === 'requested' && !contact.requestedByMe && <div className="mt-4 flex flex-wrap gap-3"><button disabled={pending} onClick={() => decide('accept')} className={matchingButton}>Accept conversation</button><button disabled={pending} onClick={() => decide('decline')} className={matchingSecondary}>Decline</button></div>}</header>
      {contact.status === 'accepted' && <><p className="text-xs leading-relaxed text-text-muted">Messages refresh while this page is open. A read time reflects an opened conversation, and does not mean someone is online. Keep payments and identity documents out of chat.</p>
        {cursor && <button disabled={pending} className={matchingSecondary} onClick={() => startTransition(async () => {
          try { const page = await matchingRequest(`squat-mates/connections/${id}/messages?limit=30&cursor=${encodeURIComponent(cursor)}`, matchMessagePageSchema); setMessages(current => [...page.items.filter(item => !current.some(old => old.id === item.id)), ...current]); setCursor(page.nextCursor) }
          catch (failure) { setContact(null); setMessages([]); setMessage(failure instanceof Error ? failure.message : 'Refresh the conversation.') }
        })}>Older messages</button>}
        <div className="space-y-4" aria-label="Conversation messages">{messages.map(item => <article key={item.id} className={`max-w-xl rounded-2xl border border-border-subtle p-4 ${item.own ? 'ml-auto bg-accent-muted' : 'bg-surface-card'}`}><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.body}</p><p className="mt-2 text-xs text-text-muted">{item.own ? 'You' : 'Member'} · {new Date(item.createdAt).toLocaleString('en-NG')}{item.own && contact.otherReadAt && item.createdAt <= contact.otherReadAt ? ' · Read' : ''}</p>{!item.own && <MatchingReport profileId={contact.other.id} connectionId={id} messageId={item.id} />}</article>)}{!messages.length && <p className="text-sm text-text-muted">Start with a conversation about your expectations for the home.</p>}</div>
        <form className="space-y-3 rounded-2xl border border-border-subtle p-5 min-w-0 max-w-full" onSubmit={event => { event.preventDefault(); startTransition(async () => {
          const trimmed = body.trim(); if (!trimmed || trimmed.length > 2000) return
          const draft = retry.current ?? { clientId: crypto.randomUUID(), body: trimmed }
          if (draft.body !== trimmed) { setMessage('Check the previous message before changing an uncertain send.'); return }
          retry.current = draft
          try { await matchingRequest(`squat-mates/connections/${id}/messages`, matchingIdSchema, { method: 'POST', body: draft }); retry.current = null; setBody(''); setUncertain(false); setMessage('Message saved.'); await load() }
          catch (failure) { const unknown = !(failure instanceof MatchingRequestError) || !failure.status || failure.status >= 500; setUncertain(unknown); if (!unknown) retry.current = null; setMessage(failure instanceof Error ? failure.message : 'Refresh to check this message.') }
        }) }}><label className="block text-sm text-text-secondary min-w-0 max-w-full">Your message<textarea required maxLength={2000} rows={3} disabled={pending || uncertain} value={body} onChange={event => setBody(event.target.value)} className={matchingField} /></label><button disabled={pending || uncertain || !body.trim()} className={matchingButton}>{pending ? 'Sending…' : 'Send message'}</button>{uncertain && <div className="space-y-2"><p className="text-xs text-text-muted">Refresh first to check whether this message arrived. If it is still missing, an explicit retry uses the same identifier and content.</p><button type="button" disabled={pending} className={matchingSecondary} onClick={() => startTransition(async () => { if (await load()) setUncertain(false) })}>Check message, then enable same-message retry</button></div>}</form></>}
      <div className="rounded-2xl border border-border-subtle p-5"><div className="flex flex-wrap gap-3"><button disabled={pending} onClick={() => decide('close')} className={matchingSecondary}>Close conversation</button><button disabled={pending} className={matchingSecondary} onClick={() => startTransition(async () => {
        try { await matchingRequest(`squat-mates/blocks/${contact.other.id}`, z.object({ blocked: z.literal(true) }), { method: 'PUT', body: {} }); setContact(null); setMessages([]); setMessage('Contact blocked. Unblocking does not reopen the conversation. You can still submit a private report from your saved report form.') }
        catch (failure) { setMessage(failure instanceof Error ? failure.message : 'Refresh your block list to check this action.') }
      })}>Block contact</button></div><MatchingReport profileId={contact.other.id} connectionId={id} /></div>
    </>}{message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
  </section>
}
