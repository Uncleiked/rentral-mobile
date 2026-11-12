'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { adminAuditPageSchema, adminAuditSearchSchema, type AdminAuditPage } from '@/lib/contracts/admin-operations'
import { listingRequest } from '@/lib/listings/capture-client'
const field = 'mt-2 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border-subtle bg-background-app p-3 text-base text-text-primary focus-visible:outline-2 focus-visible:outline-accent-primary sm:text-sm'
const button = 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-50'
const panel = 'min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6'
type Fields = { query: string; targetType: string; from: string; to: string; sort: string }
const defaults: Fields = { query: '', targetType: 'all', from: '', to: '', sort: 'newest' }
type Props = { actorId: string; disabled: boolean; refreshToken: number }
export function AdminAuditHistory({ actorId, disabled, refreshToken }: Props) {
  const [fields, setFields] = useState<Fields>(defaults), [filters, setFilters] = useState<Fields>(defaults)
  const [page, setPage] = useState<AdminAuditPage | null>(null), [cursor, setCursor] = useState<string | null>(null), [history, setHistory] = useState<(string | null)[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [validation, setValidation] = useState('')
  const active = useRef(true), sequence = useRef(0)
  const filterKey = JSON.stringify(filters)
  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true); setError('')
    try {
      const current = JSON.parse(filterKey) as Fields
      const normalized = adminAuditSearchSchema.parse({ query: current.query, targetType: current.targetType, sort: current.sort, ...(current.from ? { from: current.from } : {}), ...(current.to ? { to: current.to } : {}), ...(cursor ? { cursor } : {}), limit: 25 })
      const params = new URLSearchParams(Object.entries(normalized).map(([key, value]) => [key, String(value)]))
      const result = await listingRequest(actorId, '/api/v1/admin/audit?' + params, adminAuditPageSchema)
      if (active.current && request === sequence.current) setPage(result)
    } catch (error) {
      if (active.current && request === sequence.current) { setPage(null); setError(error instanceof Error ? error.message.slice(0, 1000) : 'Audit history could not be loaded.') }
    } finally { if (active.current && request === sequence.current) setLoading(false) }
  }, [actorId, filterKey, cursor])
  useEffect(() => { active.current = true; return () => { active.current = false; sequence.current += 1 } }, [])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load, refreshToken])
  function apply(): void {
    const normalized = adminAuditSearchSchema.safeParse({ ...fields, from: fields.from || undefined, to: fields.to || undefined })
    if (!normalized.success) { setValidation(normalized.error.issues[0]?.message ?? 'Check the search dates.'); return }
    const next = { ...fields, query: fields.query.trim() }
    setValidation(''); setFields(next); setFilters(next); setCursor(null); setHistory([]); setPage(null)
    if (JSON.stringify(next) === filterKey && cursor === null) void load()
  }
  const rows = page?.items ?? [], queryPending = JSON.stringify(fields) !== filterKey
  const busy = disabled || loading || queryPending
  return <div className="min-w-0 space-y-5">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-xl font-semibold">Audit trail</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">Search recorded decisions across the full history. Historical reasons are read-only.</p></div><button type="button" className={button} disabled={disabled || loading} onClick={() => { void load() }}><RefreshCw className={'size-4 shrink-0 ' + (loading ? 'animate-spin' : '')} />Refresh audit history</button></header>
    <form className={panel + ' space-y-4'} onSubmit={event => { event.preventDefault(); if (!disabled) apply() }}>
      <label className="block min-w-0 text-xs font-medium text-text-muted">Search decisions<div className="relative"><Search className="pointer-events-none absolute left-3 top-6 size-4" /><input type="search" aria-label="Search audit history" value={fields.query} maxLength={254} disabled={disabled} onChange={event => setFields(current => ({ ...current, query: event.target.value }))} placeholder="Staff username or email, action, target, reason" className={field + ' pl-10'} /></div></label>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4"><label className="block min-w-0 text-xs font-medium text-text-muted">Record type<select className={field} value={fields.targetType} disabled={disabled} onChange={event => setFields(current => ({ ...current, targetType: event.target.value }))}>{[['all','All record types'],['listing','Listings'],['user','Members'],['organization','Organizations'],['booking','Bookings'],['dispute','Reports'],['safety_notice','Safety notices'],['safety_appeal','Safety appeals']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block min-w-0 text-xs font-medium text-text-muted">From date (UTC)<input type="date" className={field} value={fields.from} disabled={disabled} onChange={event => setFields(current => ({ ...current, from: event.target.value }))} /></label><label className="block min-w-0 text-xs font-medium text-text-muted">To date (UTC)<input type="date" className={field} value={fields.to} disabled={disabled} onChange={event => setFields(current => ({ ...current, to: event.target.value }))} /></label>
      <label className="block min-w-0 text-xs font-medium text-text-muted">History order<select className={field} value={fields.sort} disabled={disabled} onChange={event => setFields(current => ({ ...current, sort: event.target.value }))}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
      <p className="text-xs leading-6 text-text-muted">Date filters cover complete UTC days. Decision timestamps below are displayed in WAT.</p>
      <div className="flex flex-wrap gap-3"><button type="submit" className={button} disabled={disabled || loading}>Search history</button><button type="button" className={button} disabled={disabled || loading} onClick={() => { setFields(defaults); setFilters(defaults); setCursor(null); setHistory([]); setValidation(''); setPage(null); if (filterKey === JSON.stringify(defaults) && cursor === null) void load() }}>Clear history filters</button></div>
      {validation && <p role="alert" className="text-sm text-trust-flagged">{validation}</p>}
    </form>
    {loading ? <p role="status" className="text-sm text-text-muted">Loading audit history...</p> : error ? <div className={panel}><h3 className="font-semibold">Audit history unavailable</h3><p role="alert" className="mt-2 break-words text-sm leading-6 text-text-secondary">{error}</p></div> : <>
      <p role="status" className="text-xs leading-6 text-text-muted">{page?.total ?? 0} matching decisions across all recorded history{queryPending ? '. Search to apply your changed filters.' : '.'}</p>
      <div className="space-y-3">{rows.map(item => <article key={item.id} className={panel}><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-semibold capitalize">{item.action.replaceAll('_', ' ')}</h3><time className="text-xs leading-6 text-text-muted" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' })} WAT</time></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary wrap-anywhere">{item.reason}</p><dl className="mt-4 grid min-w-0 gap-3 text-xs sm:grid-cols-2"><div className="min-w-0"><dt className="text-text-muted">Recorded by</dt><dd className="mt-1 break-all text-text-secondary">{item.actorUsername ? '@' + item.actorUsername : item.actorId ? 'Account ' + item.actorId : 'Actor not recorded'}</dd></div><div className="min-w-0"><dt className="text-text-muted">Target</dt><dd className="mt-1 break-all text-text-secondary">{item.targetType.replaceAll('_', ' ')} / {item.targetId}</dd></div></dl></article>)}</div>
      {!rows.length && <p className={panel + ' text-sm text-text-muted'}>{filters.query || filters.targetType !== 'all' || filters.from || filters.to ? 'No decisions match these filters.' : 'No administrative decisions recorded yet.'}</p>}
      <nav className="flex min-w-0 flex-wrap items-center justify-between gap-3" aria-label="Audit history pages"><button type="button" className={button} disabled={busy || !history.length} onClick={() => { setCursor(history.at(-1) ?? null); setHistory(current => current.slice(0, -1)) }}><ChevronLeft className="size-4" />Previous history page</button><span className="text-xs text-text-muted">Page {history.length + 1}</span><button type="button" className={button} disabled={busy || !page?.hasMore || !page.nextCursor} onClick={() => { setHistory(current => [...current, cursor]); setCursor(page?.nextCursor ?? null) }}>Next history page<ChevronRight className="size-4" /></button></nav>
    </>}
  </div>
}
