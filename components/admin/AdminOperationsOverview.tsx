'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Clock3, RefreshCw } from 'lucide-react'
import { adminOverviewSchema, type AdminOverview } from '@/lib/contracts/admin-operations'
import { listingRequest } from '@/lib/listings/capture-client'

type Queue = AdminOverview['queues'][number]
type Props = { actorId: string; disabled: boolean; refreshToken: number; onNavigate: (tab: NonNullable<Queue['tab']>) => void }
const button = 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-50'
function date(value: string): string { return new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }) + ' WAT' }
function age(value: string, generatedAt: string): string {
  const hours = Math.floor(Math.max(0, Date.parse(generatedAt) - Date.parse(value)) / 3600000)
  return hours < 1 ? 'less than 1 hour ago' : hours < 24 ? hours + (hours === 1 ? ' hour ago' : ' hours ago') : Math.floor(hours / 24) + (hours < 48 ? ' day ago' : ' days ago')
}
export function AdminOperationsOverview({ actorId, disabled, refreshToken, onNavigate }: Props) {
  const [data, setData] = useState<AdminOverview | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const active = useRef(true), sequence = useRef(0)
  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true); setError('')
    try {
      const result = await listingRequest(actorId, '/api/v1/admin/overview', adminOverviewSchema)
      if (active.current && sequence.current === request) setData(result)
    } catch (error) {
      if (active.current && sequence.current === request) { setData(null); setError(error instanceof Error ? error.message.slice(0, 1000) : 'Review counts could not be loaded.') }
    } finally { if (active.current && sequence.current === request) setLoading(false) }
  }, [actorId])
  useEffect(() => { active.current = true; return () => { active.current = false; sequence.current += 1 } }, [])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load, refreshToken])
  return <section className="mt-7 min-w-0 space-y-4" aria-label="Current review workload" aria-busy={loading}>
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-semibold">Work needing attention</h2><p className="mt-2 text-xs leading-6 text-text-muted">Current queue totals across all matching records, limited to your role.</p></div><button type="button" className={button} disabled={disabled || loading} onClick={() => { void load() }}><RefreshCw className={'size-4 shrink-0 ' + (loading ? 'animate-spin' : '')} />Refresh review counts</button></header>
    {error ? <div className="rounded-2xl border border-border-subtle bg-surface-card p-5"><p role="alert" className="break-words text-sm leading-6 text-text-secondary">{error}</p><p className="mt-2 text-xs leading-5 text-text-muted">Queue totals are unavailable. The individual workspaces retain their own permission checks.</p></div> : !data ? <p role="status" className="text-sm text-text-muted">Loading review counts...</p> : <>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.queues.map(queue => {
        const content = <><span className="flex min-w-0 items-start justify-between gap-3"><span className="min-w-0 text-sm font-medium leading-6 text-text-secondary">{queue.label}</span><ArrowUpRight className="mt-1 size-4 shrink-0 text-text-muted" /></span><span className="mt-3 block text-2xl font-semibold tabular-nums text-text-primary">{queue.count.toLocaleString('en-NG')}</span><span className="mt-2 flex min-w-0 items-start gap-2 text-xs leading-5 text-text-muted"><Clock3 className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0">{queue.count && queue.oldestAt ? <>Oldest record: {age(queue.oldestAt, data.generatedAt)}<time className="mt-1 block" dateTime={queue.oldestAt}>{date(queue.oldestAt)}</time></> : 'No records waiting'}</span></span></>
        const className = 'block min-h-11 min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-4 text-left transition-colors hover:border-glass-border-medium focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-50 sm:p-5'
        return queue.tab ? <button type="button" key={queue.id} className={className} disabled={disabled || loading} onClick={() => onNavigate(queue.tab!)}>{content}</button> : <Link key={queue.id} className={className + (disabled || loading ? ' cursor-not-allowed opacity-50' : '')} href={queue.href} aria-disabled={disabled || loading} tabIndex={disabled || loading ? -1 : undefined} onClick={event => { if (disabled || loading) event.preventDefault() }}>{content}</Link>
      })}</div>
      {!data.queues.length && <p className="rounded-2xl border border-border-subtle bg-surface-card p-5 text-sm leading-6 text-text-muted">No review queues are assigned to your current role. Open the specialized workspaces available below.</p>}
      <p className="text-xs leading-5 text-text-muted">Updated <time dateTime={data.generatedAt}>{date(data.generatedAt)}</time>. Counts refresh after recorded decisions or when you choose Refresh review counts.</p>
    </>}
  </section>
}
