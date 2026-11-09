'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { z } from 'zod'
import { matchingBlockPageSchema, ownMatchingReportsSchema } from '@/lib/matching/contracts'
import { matchingSecondary } from '@/lib/matching/client'
import { useMatchingRequest } from '@/components/account/ApiActorScope'
import { MatchingReport } from './MatchingReport'

export function MatchingPrivacy({ kind }: { kind: 'blocks' | 'reports' }) {
  const matchingRequest = useMatchingRequest()
  const [blocks, setBlocks] = useState<z.infer<typeof matchingBlockPageSchema>['items']>([]), [reports, setReports] = useState<z.infer<typeof ownMatchingReportsSchema>['items']>([])
  const [cursor, setCursor] = useState<string | null>(null), [message, setMessage] = useState(''), [loading, setLoading] = useState(true), [pending, startTransition] = useTransition()
  const load = useCallback(async (next?: string) => {
    setLoading(true)
    try { const path = `squat-mates/${kind}?limit=20${next ? `&cursor=${encodeURIComponent(next)}` : ''}`
      if (kind === 'blocks') { const page = await matchingRequest(path, matchingBlockPageSchema); setBlocks(current => next ? [...current, ...page.items] : page.items); setCursor(page.nextCursor) }
      else { const page = await matchingRequest(path, ownMatchingReportsSchema); setReports(current => next ? [...current, ...page.items] : page.items); setCursor(page.nextCursor) }
      setMessage('')
    } catch (error) { setBlocks([]); setReports([]); setCursor(null); setMessage(error instanceof Error ? error.message : 'Refresh this history.') }
    finally { setLoading(false) }
  }, [kind, matchingRequest])
  useEffect(() => { const first = setTimeout(() => void load(), 0); return () => clearTimeout(first) }, [load])
  return <div className="space-y-5"><div className="flex flex-wrap gap-3"><Link href="/marketplace/squat-mates" className={matchingSecondary}>Back to matching</Link><Link href={`/marketplace/squat-mates/${kind === 'blocks' ? 'reports' : 'blocks'}`} className={matchingSecondary}>{kind === 'blocks' ? 'Private reports' : 'Blocked contacts'}</Link><button disabled={loading} onClick={() => void load()} className={matchingSecondary}>Refresh history</button></div><h1 className="text-3xl font-semibold">{kind === 'blocks' ? 'Blocked contacts' : 'Your private reports'}</h1><p className="text-sm leading-relaxed text-text-muted">{kind === 'blocks' ? 'A block hides both profiles from each other and closes matching contact. Unblocking does not reopen a request or conversation. You can still report concerns.' : 'Only your submissions and their review decisions appear here. Reports can be reviewed independently even after a contact is blocked or a profile is withdrawn.'}</p>
    {loading && <p role="status" className="text-sm text-text-muted">Loading history…</p>}{message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
    {blocks.map(item => <article key={item.id} className="rounded-2xl border border-border-subtle bg-surface-card p-5"><h2 className="font-semibold">{item.username ? `@${item.username}` : 'Blocked member'}</h2><p className="mt-2 text-xs text-text-muted">Blocked {new Date(item.createdAt).toLocaleDateString('en-NG')}</p>{item.profileId && <><button disabled={pending} className={`${matchingSecondary} mt-4`} onClick={() => startTransition(async () => {
      try { await matchingRequest(`squat-mates/blocks/${item.profileId}`, z.object({ blocked: z.literal(false) }), { method: 'DELETE', body: {} }); await load() }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Refresh to check this block.') }
    })}>Unblock contact</button><MatchingReport profileId={item.profileId} /></>}</article>)}
    {reports.map(item => <article key={item.id} className="rounded-2xl border border-border-subtle bg-surface-card p-5"><h2 className="font-semibold">{item.status === 'open' ? 'Awaiting independent review' : 'Review recorded'}</h2><p className="mt-2 text-xs text-text-muted">Submitted {new Date(item.createdAt).toLocaleString('en-NG')}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{item.reason}</p>{item.resolution && <p className="mt-4 whitespace-pre-wrap border-t border-border-subtle pt-4 text-sm text-text-muted">Decision: {item.resolution}</p>}</article>)}
    {!loading && !message && !blocks.length && !reports.length && <p className="rounded-2xl border border-border-subtle p-6 text-sm text-text-muted">No records in this history.</p>}{cursor && <button disabled={loading} className={matchingSecondary} onClick={() => void load(cursor)}>Older records</button>}
  </div>
}
