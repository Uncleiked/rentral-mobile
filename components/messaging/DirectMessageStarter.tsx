'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { MessageCircle } from 'lucide-react'
import { socialPersonSchema, type SocialPerson } from '@/lib/contracts/social'
import { socialError, socialRequest, SocialRequestError } from '@/lib/social/client'
const receipt = z.object({ id: z.uuid() }).strict()
const button = 'inline-flex min-h-11 min-w-0 items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50'
export function DirectMessageStarter({ recipientId, actorId }: { recipientId: string; actorId: string }) {
  const [person, setPerson] = useState<SocialPerson | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false)
  const command = useRef<string | null>(null), router = useRouter()
  useEffect(() => { let active = true; void socialRequest('/api/v1/people/' + recipientId, socialPersonSchema, undefined, actorId).then(value => { if (active) setPerson(value) }).catch(reason => { if (active) setError(socialError(reason)) }); return () => { active = false } }, [actorId, recipientId])
  async function open(check = false) {
    if (busy) return
    setBusy(true); setError(''); command.current ??= crypto.randomUUID()
    try {
      const result = await socialRequest(check ? '/api/v1/messages/start?recipientId=' + recipientId + '&clientId=' + command.current : '/api/v1/messages', receipt, check ? undefined : { recipientId, clientId: command.current }, actorId)
      command.current = null; setUncertain(false); router.push('/marketplace/messages?id=' + result.id)
    } catch (reason) {
      if (reason instanceof SocialRequestError && reason.status >= 400 && reason.status < 500 && reason.code !== 'INVALID_RESPONSE') { if (!check || reason.status !== 404) command.current = null; setUncertain(false) }
      else setUncertain(true)
      setError(socialError(reason))
    } finally { setBusy(false) }
  }
  return <section className="min-w-0 space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-7"><MessageCircle className="size-8 text-accent-primary" /><h2 className="break-words text-xl font-semibold">Message {person?.displayName ?? 'this member'}</h2><p className="text-sm leading-6 text-text-muted">{person?.following && person.followedBy ? 'You follow each other. Your conversation will appear in Primary.' : 'Your first message goes to their Requests. They can move it to Primary or follow you back to continue the conversation.'}</p><div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !person || person.blocked || recipientId === actorId} className={button + ' bg-accent-primary text-text-inverse'} onClick={() => { void open() }}>{busy ? 'Opening...' : uncertain ? 'Retry original request' : 'Open conversation'}</button>{uncertain && <button type="button" disabled={busy} className={button} onClick={() => { void open(true) }}>Check original request</button>}</div>{person?.blocked && <p className="text-sm text-text-muted">Unblock this member from their profile before messaging.</p>}{error && <p role="alert" className="break-words text-sm leading-6 text-trust-flagged">{error}</p>}</section>
}
