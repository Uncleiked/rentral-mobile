'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import { adminListingPageSchema, type AdminListingPage } from '@/lib/contracts/admin-search'
import type { AdminListing } from '@/lib/contracts/admin'
import { listingRequest } from '@/lib/listings/capture-client'
import { AdminToggle } from './AdminToggle'

const field = 'mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-border-subtle bg-background-app p-3 text-base text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary sm:text-sm'
const button = 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-50'
const panel = 'min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6'
const label = 'block min-w-0 text-xs font-medium text-text-muted'
const PAGE_SIZE = 25

type Filters = {
  query: string; status: string; category: string; source: string; fee: string; archived: string; sort: string
}
export type AdminListingScope = { id: string; label: string }
const defaults: Filters = { query: '', status: 'review', category: 'all', source: 'all', fee: 'all', archived: 'exclude', sort: 'newest' }
const statuses = [
  ['review', 'Awaiting review'], ['all', 'All submitted listings'], ['pending_verification', 'Pending verification'],
  ['active', 'Live'], ['suspended', 'Suspended'], ['on_hold', 'On hold'], ['rented', 'Rented'],
]
function paramsFor(filters: Filters, scope: AdminListingScope | null, cursor?: string | null): URLSearchParams {
  const params = new URLSearchParams({ ...filters, limit: String(PAGE_SIZE) })
  if (scope) params.set('listerId', scope.id)
  if (cursor) params.set('cursor', cursor)
  return params
}
function messageFor(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1000) : 'The listings could not be loaded. Try refreshing the queue.'
}

type Props = {
  actorId: string; disabled: boolean; selectedId: string | null; refreshToken: number
  scope: AdminListingScope | null; onClearScope: () => void; onSelect: (listing: AdminListing) => void
  onClearSelection: () => void; detail: ReactNode
}

/** Search is always server-backed: a match outside the first page remains discoverable. */
export function AdminListingQueue({ actorId, disabled, selectedId, refreshToken, scope, onClearScope, onSelect, onClearSelection, detail }: Props) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(() => ({ ...defaults, status: scope ? 'all' : 'review' }))
  const [cursor, setCursor] = useState<string | null>(null)
  const [history, setHistory] = useState<(string | null)[]>([])
  const [page, setPage] = useState<AdminListingPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadMessage, setDownloadMessage] = useState('')
  const [exporting, setExporting] = useState(false)
  const [compact, setCompact] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const sequence = useRef(0), mounted = useRef(true)
  const clearSelection = useRef(onClearSelection)
  useEffect(() => { clearSelection.current = onClearSelection }, [onClearSelection])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; sequence.current += 1 }
  }, [])


  const filterKey = JSON.stringify(filters)
  const scopeId = scope?.id ?? ''
  const load = useCallback(async () => {
    const requestSequence = ++sequence.current
    setLoading(true); setError('')
    try {
      const params = paramsFor(JSON.parse(filterKey) as Filters, scopeId ? { id: scopeId, label: '' } : null, cursor)
      const result = await listingRequest(actorId, '/api/v1/admin/listings?' + params, adminListingPageSchema)
      if (!mounted.current || requestSequence !== sequence.current) return
      setPage(result); setUpdatedAt(new Date())
    } catch (error) {
      if (mounted.current && requestSequence === sequence.current) { setError(messageFor(error)); setPage(null) }
    } finally {
      if (mounted.current && requestSequence === sequence.current) setLoading(false)
    }
  }, [actorId, filterKey, scopeId, cursor])

  useEffect(() => { const start = setTimeout(() => { void load() }, 0); return () => clearTimeout(start) }, [load, refreshToken])
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (query.trim() === filters.query) return
      setFilters(current => ({ ...current, query: query.trim() })); setCursor(null); setHistory([])
      clearSelection.current()
    }, 350)
    return () => clearTimeout(timeout)
  }, [query, filters.query])
  useEffect(() => {
    if (!autoRefresh || disabled || selectedId || exporting) return
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000)
    return () => clearInterval(timer)
  }, [autoRefresh, disabled, selectedId, exporting, load])

  function apply(name: keyof Filters, value: string): void {
    setFilters(current => ({ ...current, [name]: value })); setCursor(null); setHistory([]); setDownloadMessage('')
    onClearSelection()
  }
  function clearFilters(): void {
    setFilters({ ...defaults, status: scope ? 'all' : 'review' }); setQuery(''); setCursor(null); setHistory([]); setDownloadMessage('')
    onClearSelection()
  }
  async function download(): Promise<void> {
    if (disabled || loading || exporting || !page?.items.length) return
    setExporting(true); setDownloadMessage('')
    try {
      const params = paramsFor(filters, scope); params.delete('limit'); params.delete('cursor')
      const response = await fetch('/api/v1/admin/listings/export?' + params, { credentials: 'same-origin', cache: 'no-store',
        headers: { 'X-Rentral-Account': actorId }, signal: AbortSignal.timeout(30000) })
      if (!response.ok) {
        let error = 'The export could not be downloaded. Refresh and try again.'
        const result: unknown = await response.json().catch(() => null)
        if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'string') error = result.error.slice(0, 1000)
        throw new Error(error)
      }
      const rowHeader = response.headers.get('X-Rentral-Export-Rows')
      const matchedHeader = response.headers.get('X-Rentral-Export-Matched')
      const rows = Number(rowHeader)
      const matched = Number(matchedHeader)
      const truncated = response.headers.get('X-Rentral-Export-Truncated')
      if (!rowHeader || !matchedHeader || !response.headers.get('content-type')?.includes('text/csv') || !Number.isInteger(rows) || rows < 0 || rows > 1000 ||
        !Number.isInteger(matched) || matched < rows || !['true', 'false'].includes(truncated ?? '')) throw new Error('The export response could not be confirmed. Refresh and try again.')
      const blob = await response.blob()
      if (blob.size > 10 * 1024 * 1024) throw new Error('This export is too large. Narrow the filters and try again.')
      if (!mounted.current) return
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = 'rentral-listings-' + new Date().toISOString().slice(0, 10) + '.csv'
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDownloadMessage(truncated === 'true' ? 'Downloaded ' + rows + ' of ' + matched + ' matching listings. Add filters to export a smaller, complete result.' : 'Downloaded all ' + rows + ' matching listings.')
    } catch (error) {
      if (mounted.current) setDownloadMessage(messageFor(error))
    } finally { if (mounted.current) setExporting(false) }
  }
  const rows = page?.items ?? []
  const queryPending = query.trim() !== filters.query
  const rowsDisabled = disabled || loading || queryPending
  const rowClass = 'w-full min-w-0 rounded-xl border px-4 text-left transition-colors hover:border-glass-border-medium focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50 ' + (compact ? 'py-3' : 'py-4')
  const first = rows.length ? history.length * PAGE_SIZE + 1 : 0
  const last = rows.length ? first + rows.length - 1 : 0

  return <div className="space-y-5">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h2 className="text-xl font-semibold">Listing review queue</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">Find submitted listings by host email, username, title, address or listing reference. Upload permission, free posting and publication review are separate decisions.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={disabled || loading} onClick={() => { onClearSelection(); void load() }}><RefreshCw className={'size-4 shrink-0 ' + (loading ? 'animate-spin' : '')} />Refresh queue</button>
        <button type="button" className={button} disabled={disabled || loading || exporting || queryPending || !rows.length} onClick={() => { void download() }}><Download className="size-4 shrink-0" />{exporting ? 'Preparing CSV...' : 'Export matching listings'}</button>
      </div>
    </header>
    {scope && <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-glass-border-success bg-accent-muted p-4"><p className="min-w-0 break-words text-sm text-text-secondary">Showing listings by <strong className="font-semibold text-text-primary">{scope.label}</strong></p><button type="button" className={button} disabled={disabled} onClick={onClearScope}><X className="size-4" />All hosts</button></div>}
    <div className={panel}>
      <form onSubmit={event => { event.preventDefault(); apply('query', query.trim()) }} className="flex min-w-0 flex-wrap items-end gap-3">
        <label className={label + ' min-w-0 flex-1 basis-60'}>Search submitted listings<div className="relative"><Search className="pointer-events-none absolute left-3 top-6 size-4 text-text-muted" /><input type="search" aria-label="Search submitted listings" maxLength={254} value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} placeholder="Host email, @username, title or address" className={field + ' pl-10'} /></div></label>
        <button type="submit" className={button} disabled={disabled}>Search listings</button>
        <button type="button" className={button} disabled={disabled} onClick={clearFilters}>Clear filters</button>
      </form>
      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className={label}>Listing status<select aria-label="Listing status" className={field} value={filters.status} disabled={disabled} onChange={event => apply('status', event.target.value)}>{statuses.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className={label}>Asset category<select aria-label="Asset category" className={field} value={filters.category} disabled={disabled} onChange={event => apply('category', event.target.value)}><option value="all">All categories</option><option value="house">Homes</option><option value="car">Cars</option><option value="boat">Boats</option></select></label>
        <AdminToggle label="Compact rows" checked={compact} disabled={disabled} onChange={setCompact} />
      </div>
      <details className="mt-4 border-t border-border-subtle pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-text-secondary"><SlidersHorizontal className="size-4" />More filters and queue settings</summary>
        <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className={label}>Media source<select className={field} value={filters.source} disabled={disabled} onChange={event => apply('source', event.target.value)}><option value="all">All media</option><option value="approved_gallery">Approved gallery</option><option value="recorded">Recorded walkthrough</option></select></label>
          <label className={label}>Publication fee<select className={field} value={filters.fee} disabled={disabled} onChange={event => apply('fee', event.target.value)}><option value="all">All fee states</option><option value="unpaid">Needs payment or waiver</option><option value="waived">Waived by admin</option><option value="paid">Verified payment</option></select></label>
          <label className={label}>Archived listings<select className={field} value={filters.archived} disabled={disabled} onChange={event => apply('archived', event.target.value)}><option value="exclude">Hide archived</option><option value="include">Include archived</option><option value="only">Archived only</option></select></label>
          <label className={label}>Sort order<select className={field} value={filters.sort} disabled={disabled} onChange={event => apply('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        </div>
        <div className="mt-4"><AdminToggle label="Auto-refresh queue" description="Check for new submissions every 30 seconds while no listing is open." checked={autoRefresh} disabled={disabled} onChange={setAutoRefresh} /></div>
      </details>
      <p className="mt-4 text-xs leading-5 text-text-muted">CSV follows these filters across matching pages, up to 1,000 records. Private documents, exact GPS and bank information are excluded. Drafts remain private until submitted.</p>
    </div>
    {downloadMessage && <p role="status" className="break-words rounded-xl border border-border-subtle bg-surface-card p-4 text-sm leading-6 text-text-secondary">{downloadMessage}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted"><p role="status" aria-live="polite">{loading || queryPending ? 'Updating listing results...' : error ? 'Listing results are unavailable.' : 'Showing ' + first + '-' + last + ' of ' + (page?.total ?? 0) + ' matching listings.'}</p>{updatedAt && !loading && <time dateTime={updatedAt.toISOString()}>Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}</div>
    {error ? <div className={panel}><h3 className="font-semibold">The queue could not be loaded</h3><p role="alert" className="mt-2 text-sm leading-6 text-text-secondary">{error}</p><button type="button" className={button + ' mt-4'} disabled={disabled || loading} onClick={() => { void load() }}>Retry listing search</button></div> :
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.3fr)]">
        <div className="min-w-0 space-y-2" aria-busy={loading}>
          {rows.map(item => <button type="button" key={item.id} disabled={rowsDisabled} aria-pressed={selectedId === item.id} onClick={() => onSelect(item)} className={rowClass + ' ' + (selectedId === item.id ? 'border-accent-primary bg-accent-muted' : 'border-border-subtle bg-surface-card')}>
            <span className="flex items-start gap-3"><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{item.title}</span><span className="mt-2 block text-xs leading-5 text-text-muted">{item.category} / {item.status.replaceAll('_', ' ')} / @{item.lister.username ?? 'member'}<br />{item.publicationMode === 'trusted_publisher' && <>{item.status === 'active' ? 'Direct publication permission used' : 'Direct publisher - awaiting completion'}<br /></>}{item.source === 'approved_gallery' ? 'Gallery media' : 'Recorded walkthrough'} / Fee {item.fee.waived ? 'waived' : item.fee.paid ? 'paid' : 'unpaid'}</span><span className="mt-2 block break-words text-xs leading-5 text-text-secondary">{item.address || 'No address supplied'}</span></span><ChevronRight className="mt-1 size-4 shrink-0 text-text-muted" /></span>
          </button>)}
          {!loading && !rows.length && <div className={panel + ' border-dashed'}><h3 className="font-semibold">No matching listings</h3><p className="mt-2 text-sm leading-6 text-text-muted">{filters.status === 'review' ? 'No submitted listings match this review queue. Try All submitted listings, another host or Clear filters.' : 'Try another host, title or address, or clear the filters.'}</p><button type="button" className={button + ' mt-4'} disabled={disabled} onClick={() => apply('status', 'all')}>Show all submitted listings</button></div>}
          {loading && !page && <div className={panel}><p role="status" className="text-sm text-text-muted">Loading submitted listings...</p></div>}
          <nav aria-label="Listing result pages" className="flex flex-wrap items-center justify-between gap-3 pt-3">
            <button type="button" className={button} disabled={rowsDisabled || !history.length} onClick={() => { setCursor(history.at(-1) ?? null); setHistory(current => current.slice(0, -1)); onClearSelection() }}><ChevronLeft className="size-4" />Previous</button>
            <span className="text-xs text-text-muted">Page {history.length + 1}</span>
            <button type="button" className={button} disabled={rowsDisabled || !page?.hasMore || !page.nextCursor} onClick={() => { setHistory(current => [...current, cursor]); setCursor(page?.nextCursor ?? null); onClearSelection() }}>Next<ChevronRight className="size-4" /></button>
          </nav>
        </div>
        {detail}
      </div>}
  </div>
}
