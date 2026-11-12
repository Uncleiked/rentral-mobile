'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { z } from 'zod'
import { matchCandidatePageSchema, matchConnectionPageSchema, type MatchCandidate, type MatchConnection } from '@/lib/matching/contracts'
import { matchingButton, matchingIdSchema, matchingMoney, matchingSecondary } from '@/lib/matching/client'
import { useMatchingRequest } from '@/components/account/ApiActorScope'
import { MatchingReport } from './MatchingReport'

function useMatchingPage<S extends z.ZodType<{ items: { id: string }[]; nextCursor: string | null }>>(path: string, schema: S, poll = false) {
  const matchingRequest = useMatchingRequest()
  type Item = z.infer<S>['items'][number]
  const [items, setItems] = useState<Item[]>([]), [cursor, setCursor] = useState<string | null>(null), [message, setMessage] = useState(''), [loading, setLoading] = useState(true)
  const load = useCallback(async (next?: string) => {
    setLoading(true)
    try { const page = await matchingRequest(`${path}?limit=20${next ? `&cursor=${encodeURIComponent(next)}` : ''}`, schema); setItems(current => (next ? [...current, ...page.items.filter(item => !current.some(old => old.id === item.id))] : page.items) as Item[]); setCursor(page.nextCursor); setMessage('') }
    catch (error) { setItems([]); setCursor(null); setMessage(error instanceof Error ? error.message : 'Refresh to load this page.') }
    finally { setLoading(false) }
  }, [path, schema, matchingRequest])
  useEffect(() => { const first = setTimeout(() => void load(), 0); const timer = poll ? setInterval(() => { if (document.visibilityState === 'visible') void load() }, 10000) : null; return () => { clearTimeout(first); if (timer) clearInterval(timer) } }, [load, poll])
  return { items, cursor, message, setMessage, loading, load }
}
export function MatchingDiscovery() {
  const matchingRequest = useMatchingRequest()
  const router = useRouter()
  const { items, cursor, message, setMessage, loading, load } = useMatchingPage('squat-mates', matchCandidatePageSchema)
  const [pending, startTransition] = useTransition()
  return <section aria-label="Matching profiles" className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 min-w-0"><div><h2 className="text-xl font-semibold break-words">Shared preferences</h2><p className="mt-2 text-sm text-text-muted">Profiles appear when your areas and monthly budget ranges overlap.</p></div><button disabled={loading} onClick={() => void load()} className={matchingSecondary}>Refresh profiles</button></div>
    {loading && <p role="status" className="text-sm text-text-muted">Loading profiles…</p>}{message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
    <div className="grid gap-4 lg:grid-cols-2">{(items as MatchCandidate[]).map(profile => <article key={profile.id} className="rounded-2xl border border-border-subtle bg-surface-card p-5 min-w-0 max-w-full wrap-anywhere text-text-primary"><div className="flex items-start justify-between gap-4 min-w-0 flex-wrap"><h3 className="text-lg font-semibold">{profile.username ? `@${profile.username}` : 'Rentral member'}</h3><span className="rounded-full bg-accent-muted px-3 py-1 text-xs font-semibold text-accent-hover">{profile.overlap.score}/100 overlap</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{profile.bio || 'This member shared their home preferences.'}</p><p className="mt-3 text-sm text-text-muted">Monthly share: {matchingMoney(profile.monthlyMinKobo)} – {matchingMoney(profile.monthlyMaxKobo)}</p><ul className="mt-4 space-y-2 text-xs leading-relaxed text-text-muted">{profile.overlap.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><p className="mt-4 text-xs leading-relaxed text-text-muted">The score uses stated areas, budgets and routines. It does not assess personal safety, credit or ability to pay.</p><button disabled={pending} className={`${matchingButton} mt-5`} onClick={() => startTransition(async () => {
      try { const result = await matchingRequest('squat-mates/connections', matchingIdSchema, { method: 'POST', body: { profileId: profile.id } }); router.push(`/marketplace/squat-mates/connections/${result.id}`) }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Check contacts before trying again.') }
    })}>Request a conversation</button><MatchingReport profileId={profile.id} /></article>)}</div>
    {!loading && !message && !items.length && <p className="rounded-2xl border border-border-subtle p-7 text-sm text-text-muted">No eligible profiles on this page. Update your preferences or check the next page.</p>}{cursor && <button disabled={loading} onClick={() => void load(cursor)} className={matchingSecondary}>More profiles</button>}
  </section>
}
export function MatchingContacts() {
  const matchingRequest = useMatchingRequest()
  const { items, cursor, message, setMessage, loading, load } = useMatchingPage('squat-mates/connections', matchConnectionPageSchema, true)
  const [pending, startTransition] = useTransition()
  return <section className="space-y-5" aria-label="Matching contacts"><div className="flex flex-wrap items-center justify-between gap-3 min-w-0"><h2 className="text-xl font-semibold break-words">Requests and conversations</h2><button disabled={loading} className={matchingSecondary} onClick={() => void load()}>Refresh contacts</button></div><p className="text-sm text-text-muted">Both people must accept before messaging. Blocking, withdrawal or a matching restriction makes a conversation unavailable.</p>{loading && !items.length && <p role="status" className="text-sm text-text-muted">Loading contacts…</p>}{message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
    {(items as MatchConnection[]).map(item => <article key={item.id} className="rounded-2xl border border-border-subtle bg-surface-card p-5 min-w-0 max-w-full wrap-anywhere text-text-primary"><div className="flex flex-wrap items-start justify-between gap-3 min-w-0"><div><h3 className="font-semibold">{item.other.username ? `@${item.other.username}` : 'Rentral member'}</h3><p className="mt-2 text-xs text-text-muted">{item.status === 'accepted' ? 'Mutually accepted' : item.requestedByMe ? 'Waiting for their response' : 'They requested a conversation'}{item.unread ? ' · Unread message' : ''}</p></div><Link href={`/marketplace/squat-mates/connections/${item.id}`} className={matchingSecondary}>{item.status === 'accepted' ? 'Open conversation' : 'Review request'}</Link></div>{item.lastMessage && <p className="mt-4 whitespace-pre-wrap text-sm text-text-secondary">{item.lastMessage.own ? 'You: ' : ''}{item.lastMessage.body}</p>}{item.status === 'requested' && !item.requestedByMe && <div className="mt-4 flex flex-wrap gap-3">{(['accept', 'decline'] as const).map(decision => <button key={decision} disabled={pending} className={decision === 'accept' ? matchingButton : matchingSecondary} onClick={() => startTransition(async () => {
      try { await matchingRequest(`squat-mates/connections/${item.id}`, z.object({ status: z.enum(['accepted', 'declined', 'closed']) }), { method: 'PATCH', body: { decision } }); await load() }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Refresh contacts before trying again.') }
    })}>{decision === 'accept' ? 'Accept conversation' : 'Decline'}</button>)}</div>}</article>)}
    {!loading && !message && !items.length && <p className="rounded-2xl border border-border-subtle p-7 text-sm text-text-muted">No active requests or conversations.</p>}{cursor && <button disabled={loading} className={matchingSecondary} onClick={() => void load(cursor)}>Older contacts</button>}
  </section>
}
