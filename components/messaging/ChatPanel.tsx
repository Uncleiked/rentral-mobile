'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, LoaderCircle, Send, Link2, Check, RefreshCw } from 'lucide-react'
import { z } from 'zod'
import { messageThreadSchema } from '@/lib/contracts/messaging'
import { socialError, socialRequest, SocialRequestError } from '@/lib/social/client'
import { markThreadReadAction } from '@/app/actions/messageActions'
import { useConversationActivity } from './useConversationActivity'

type Thread = z.infer<typeof messageThreadSchema>
type Command = { clientId: string; body: string; sharedListingId?: string }
type Props = { initialThread: Thread; onInboxChange?: (folder?: Thread['folder']) => void }
const messageReceipt = z.object({ id: z.uuid() }).strict()
const acceptedReceipt = z.object({ id: z.uuid(), accepted: z.literal(true) }).strict()
const secondaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50'

export function ChatPanel({ initialThread, onInboxChange }: Props) {
  const [thread, setThread] = useState(initialThread)
  const [body, setBody] = useState(''), [share, setShare] = useState(false)
  const [error, setError] = useState(''), [syncError, setSyncError] = useState('')
  const [pending, setPending] = useState(false), [accepting, setAccepting] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState<Command | null>(null)
  const [acceptUnconfirmed, setAcceptUnconfirmed] = useState(false)
  const [absentConfirmed, setAbsentConfirmed] = useState(false)
  const acceptanceId = useRef<string | null>(null), sendCommand = useRef<Command | null>(null)
  const bottom = useRef<HTMLDivElement>(null), refreshing = useRef(false), active = useRef(true)
  const lastFolder = useRef(initialThread.folder)
  const path = '/api/v1/messages/' + initialThread.id
  const activityEnabled = thread.folder === 'primary'
  const { activity, shareActivity, setShareActivity } = useConversationActivity(initialThread.id, initialThread.userId, body, activityEnabled)

  const refresh = useCallback(async () => {
    if (refreshing.current || !active.current || document.visibilityState !== 'visible') return
    refreshing.current = true
    try {
      const result = await socialRequest(path, messageThreadSchema, undefined, initialThread.userId)
      if (!active.current) return
      setSyncError('')
      if (lastFolder.current !== result.folder) { lastFolder.current = result.folder; onInboxChange?.(result.folder) }
      setThread(current => {
        const ids = new Set(current.messages.map(item => item.id))
        const overlap = result.messages.some(item => ids.has(item.id))
        if (!overlap && result.hasMore) return result
        const messages = new Map(current.messages.map(item => [item.id, item]))
        for (const item of result.messages) messages.set(item.id, item)
        return { ...result, hasMore: current.hasMore, messages: [...messages.values()].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id)) }
      })
      if (result.folder === 'primary' && document.visibilityState === 'visible') await markThreadReadAction(initialThread.id)
    } catch (reason) { if (active.current) setSyncError(socialError(reason)) }
    finally { refreshing.current = false }
  }, [path, initialThread.id, initialThread.userId, onInboxChange])

  useEffect(() => {
    active.current = true
    const start = setTimeout(() => { void refresh() }, 0)
    const timer = setInterval(() => { void refresh() }, 8000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus); window.addEventListener('online', focus)
    document.addEventListener('visibilitychange', focus)
    return () => { active.current = false; clearTimeout(start); clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('online', focus); document.removeEventListener('visibilitychange', focus) }
  }, [refresh])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [thread.messages.length])

  async function accept(check = false) {
    if (accepting) return
    setAccepting(true); setError('')
    acceptanceId.current ??= crypto.randomUUID()
    try {
      await socialRequest(path + '/accept' + (check ? '?clientId=' + acceptanceId.current : ''), acceptedReceipt, check ? undefined : { clientId: acceptanceId.current }, thread.userId)
      acceptanceId.current = null; setAcceptUnconfirmed(false)
      lastFolder.current = 'primary'; onInboxChange?.('primary')
      await refresh()
    } catch (reason) {
      if (reason instanceof SocialRequestError && reason.status >= 400 && reason.status < 500 && reason.code !== 'INVALID_RESPONSE') {
        if (!check || reason.status !== 404) acceptanceId.current = null
        setAcceptUnconfirmed(false)
      } else setAcceptUnconfirmed(true)
      setError(socialError(reason))
    } finally { if (active.current) setAccepting(false) }
  }

  async function send(command: Command) {
    if (pending) return
    sendCommand.current = command
    setPending(true); setError(''); setAbsentConfirmed(false)
    try {
      await socialRequest(path, messageReceipt, command, thread.userId)
      sendCommand.current = null; setUnconfirmed(null); setBody(''); setShare(false)
      await refresh(); onInboxChange?.()
    } catch (reason) {
      if (reason instanceof SocialRequestError && reason.status >= 400 && reason.status < 500 && reason.code !== 'INVALID_RESPONSE') {
        sendCommand.current = null; setUnconfirmed(null)
      } else setUnconfirmed(command)
      setError(socialError(reason))
    } finally { if (active.current) setPending(false) }
  }

  async function checkSend() {
    const command = sendCommand.current
    if (!command || pending) return
    setPending(true); setError('')
    try {
      await socialRequest(path + '/send?clientId=' + command.clientId, messageReceipt, undefined, thread.userId)
      sendCommand.current = null; setUnconfirmed(null); setBody(''); setShare(false)
      await refresh(); onInboxChange?.()
    } catch (reason) {
      if (reason instanceof SocialRequestError && reason.status === 404) setAbsentConfirmed(true)
      else setError(socialError(reason))
    } finally { if (active.current) setPending(false) }
  }

  return <section className="flex min-w-0 max-w-full flex-1 flex-col rounded-2xl border border-border-subtle bg-surface-card text-text-primary wrap-anywhere">
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4 sm:p-5">
      <div className="min-w-0"><h2 className="break-words font-semibold">{thread.otherName}</h2><p aria-live="polite" className="text-xs text-text-muted">{activity?.otherTyping ? 'Typing...' : activity?.otherOnline ? 'Active in this conversation' : thread.folder === 'sent' ? 'Message request sent' : thread.requestIncoming ? 'Message request' : 'Your rental conversation'}</p></div>
      {thread.listingId && <Link href={'/marketplace/listing/' + thread.listingId} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-xs text-accent-hover">View listing <ArrowUpRight className="size-4" /></Link>}
    </header>
    {thread.requestIncoming && <div className="space-y-3 border-b border-border-subtle bg-accent-muted p-4"><h3 className="text-sm font-semibold">Choose who can reach your Primary inbox</h3><p className="text-sm leading-6 text-text-secondary">Move this conversation to Primary to reply. Following each other also moves it automatically. Activity and read receipts stay private while this is a request.</p><button type="button" disabled={accepting} className={secondaryButton} onClick={() => { void accept() }}>{accepting ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Move to Primary</button>{acceptUnconfirmed && <button type="button" disabled={accepting} className={secondaryButton + ' ml-2'} onClick={() => { void accept(true) }}>Check acceptance</button>}</div>}
    {syncError && <div className="px-4 pt-3"><p role="status" className="text-xs text-trust-flagged">{syncError}</p><button type="button" className={secondaryButton + ' mt-2'} onClick={() => { void refresh() }}><RefreshCw className="size-4" />Refresh messages</button></div>}
    <div role="log" aria-label="Conversation messages" aria-live="polite" className="flex max-h-[65dvh] min-h-72 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      {thread.hasMore && <button type="button" className={secondaryButton + ' self-center'} disabled={pending} onClick={async () => {
        setPending(true)
        try { const page = await socialRequest(path + '?before=' + thread.messages[0]?.id, messageThreadSchema, undefined, thread.userId); setThread(current => ({ ...current, hasMore: page.hasMore, messages: [...page.messages, ...current.messages.filter(item => !page.messages.some(older => older.id === item.id))] })) }
        catch (reason) { setError(socialError(reason)) }
        finally { setPending(false) }
      }}>Load earlier messages</button>}
      {!thread.messages.length && <p className="my-auto text-center text-sm text-text-muted">Say hello. Ask a question before you book.</p>}
      {thread.messages.map(message => {
        const own = message.senderId === thread.userId
        const readAt = activityEnabled ? (activity?.otherReadAt ?? thread.otherReadAt) : null
        return <div key={message.id} className={'max-w-[90%] rounded-2xl p-3 sm:max-w-[80%] ' + (own ? 'self-end bg-accent-muted' : 'self-start border border-border-subtle bg-background-app')}>
          {message.sharedListing && <Link href={'/marketplace/listing/' + message.sharedListing.id} className="mb-2 flex min-h-11 items-center gap-2 rounded-xl border border-glass-border-medium p-3 text-sm text-accent-hover"><Link2 className="size-4 shrink-0" />View shared {message.sharedListing.category}<ArrowUpRight className="size-4 shrink-0" /></Link>}
          <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{message.body}</p><p className="mt-1 text-right text-[10px] text-text-muted">{new Date(message.sentAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}{own && readAt && message.sentAt <= readAt ? ' - Read' : ''}</p>
        </div>
      })}<div ref={bottom} />
    </div>
    {thread.folder === 'sent' && <p className="border-t border-border-subtle px-4 py-3 text-xs leading-5 text-text-muted">Your message is in their Requests. They can reply after moving this chat to Primary or following you back.</p>}
    {thread.canSend && <form className="mt-auto min-w-0 border-t border-border-subtle p-4" onSubmit={event => { event.preventDefault(); if (!pending && !unconfirmed && (body.trim() || share)) void send({ clientId: crypto.randomUUID(), body, ...(share && thread.listingId ? { sharedListingId: thread.listingId } : {}) }) }}>
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">{thread.listingId && <label className="inline-flex min-h-11 items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={share} disabled={pending || Boolean(unconfirmed)} onChange={event => setShare(event.target.checked)} className="accent-accent-primary" />Attach this listing</label>}<span className="ml-auto text-[10px] text-text-muted">{body.length}/4000</span></div>
      {activityEnabled && <label className="mb-3 flex min-h-11 items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={shareActivity} onChange={event => setShareActivity(event.target.checked)} className="accent-accent-primary" />Share activity and typing while this chat is open</label>}
      <div className="flex min-w-0 items-end gap-2"><label className="sr-only" htmlFor={'chat-message-' + thread.id}>Message</label><textarea id={'chat-message-' + thread.id} rows={2} maxLength={4000} value={body} disabled={pending || Boolean(unconfirmed)} placeholder="Write a message..." className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-border-subtle bg-background-app p-3 text-base focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-60 sm:text-sm" onChange={event => setBody(event.target.value)} /><button type="submit" disabled={pending || Boolean(unconfirmed) || (!body.trim() && !share)} aria-label="Send message" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-primary text-text-inverse disabled:opacity-50">{pending ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}</button></div>
      <p className="mt-3 text-[10px] leading-relaxed text-text-muted">Keep identity documents and bank details private. Rentral will never ask for your password in a message.</p>
    </form>}
    {unconfirmed && <div className="space-y-3 border-t border-border-subtle p-4"><p className="text-sm leading-6 text-text-secondary">Your last send was not confirmed. Your original message is kept here so a retry uses the same request.</p><div className="flex flex-wrap gap-2"><button type="button" className={secondaryButton} disabled={pending} onClick={() => { void send(unconfirmed) }}>Retry original message</button><button type="button" className={secondaryButton} disabled={pending} onClick={() => { void checkSend() }}>Check sent status</button>{absentConfirmed && <button type="button" className={secondaryButton} disabled={pending} onClick={() => { sendCommand.current = null; setUnconfirmed(null); setAbsentConfirmed(false); setError('') }}>Edit unsent message</button>}</div>{absentConfirmed && <p role="status" className="text-xs text-text-muted">The server confirmed no saved message for this request. You can retry it or edit your draft.</p>}</div>}
    {error && <p role="alert" className="break-words px-4 pb-4 text-xs leading-5 text-trust-flagged">{error}</p>}
  </section>
}
