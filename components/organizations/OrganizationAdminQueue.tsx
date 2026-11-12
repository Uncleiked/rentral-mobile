'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CaptureRequestError, listingRequest } from '@/lib/listings/capture-client'
import { organizationLinkSchema, organizationQueuePageSchema, organizationReceiptSchema, organizationReviewSchema, type OrganizationView } from '@/lib/contracts/organizations'
import { clearOrganizationPending, readOrganizationPending, saveOrganizationPending, type OrganizationPending } from '@/lib/organizations/recovery'

const panel = 'min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6'
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold disabled:opacity-50'
const field = 'mt-2 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border-subtle bg-background-app p-3 text-base text-text-primary focus-visible:outline-2 focus-visible:outline-accent-primary sm:text-sm'
export function OrganizationAdminQueue({ actorId, disabled = false, onDecisionRecorded }: { actorId: string; disabled?: boolean; onDecisionRecorded?: () => void }) {
  const [items, setItems] = useState<OrganizationView[]>([])
  const [selected, setSelected] = useState<OrganizationView | null>(null)
  const [checklist, setChecklist] = useState({ registrationMatches: false, registerChecked: false, authorityConfirmed: false })
  const [reason, setReason] = useState(''), [decision, setDecision] = useState<'approve' | 'request_changes' | 'reject'>('request_changes')
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [message, setMessage] = useState('')
  const [document, setDocument] = useState<{ url: string; expiresAt: string; supporting: boolean } | null>(null), [opened, setOpened] = useState(false)
  const [pending, setPending] = useState<OrganizationPending | null>(null), [canRetry, setCanRetry] = useState(false), [recoveryError, setRecoveryError] = useState(false)
  const [query, setQuery] = useState(''), [search, setSearch] = useState('')
  const [status, setStatus] = useState('pending'), [sort, setSort] = useState('oldest')
  const [cursor, setCursor] = useState<string | null>(null), [history, setHistory] = useState<(string | null)[]>([])
  const [total, setTotal] = useState(0), [nextCursor, setNextCursor] = useState<string | null>(null), [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true), [queueError, setQueueError] = useState(''), [loadedAt, setLoadedAt] = useState<string | null>(null)
  const active = useRef(true), sending = useRef(false), sequence = useRef(0)
  const load = useCallback(async () => {
    const current = ++sequence.current
    setLoading(true); setQueueError('')
    try {
      const params = new URLSearchParams({ query: search, status, sort, limit: '25', ...(cursor ? { cursor } : {}) })
      const result = await listingRequest(actorId, '/api/v1/admin/organizations?' + params, organizationQueuePageSchema)
      if (active.current && current === sequence.current) { setItems(result.items); setLoadedAt(new Date().toISOString()); setTotal(result.total); setNextCursor(result.nextCursor); setHasMore(result.hasMore); setReady(true) }
    } catch (error) {
      if (active.current && current === sequence.current) { setItems([]); setTotal(0); setNextCursor(null); setHasMore(false); setQueueError(error instanceof Error ? error.message : 'Organization applications could not be loaded.') }
      throw error
    } finally { if (active.current && current === sequence.current) setLoading(false) }
  }, [actorId, search, status, sort, cursor])
  useEffect(() => { const timer = setTimeout(() => { void load().catch(() => undefined) }, 0); return () => clearTimeout(timer) }, [load])
  useEffect(() => {
    active.current = true
    let current = true
    void Promise.resolve().then(() => {
      if (!current) return
      try { setPending(readOrganizationPending(actorId, 'review')) } catch { setRecoveryError(true); setMessage('A saved organization decision needs recovery. Keep browser data and review its audit history.') }
    })
    return () => { current = false; active.current = false; sequence.current += 1 }
  }, [actorId])
  async function run(work: () => Promise<void>): Promise<void> {
    if (sending.current) return
    sending.current = true; setBusy(true); setMessage('')
    try { await work() } catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : 'The original decision could not be confirmed.') }
    finally { sending.current = false; if (active.current) setBusy(false) }
  }
  function select(item: OrganizationView): void {
    if (disabled || busy || pending || recoveryError) return
    setSelected(item); setChecklist({ registrationMatches: false, registerChecked: false, authorityConfirmed: false }); setReason(''); setDecision('request_changes'); setDocument(null); setOpened(false); setMessage('')
    requestAnimationFrame(() => { const review = window.document.getElementById('organization-selected-application'); review?.focus({ preventScroll: true }); if (window.innerWidth < 1024) review?.scrollIntoView({ block: 'start', behavior: 'instant' }) })
  }
  async function send(instruction: OrganizationPending): Promise<void> {
    if (instruction.scope !== 'review') return
    setCanRetry(false)
    let confirmed = false
    try {
      const result = await listingRequest(actorId, '/api/v1/admin/organizations', organizationReceiptSchema, instruction.command)
      if (result.clientId !== instruction.command.clientId) throw new Error('The decision receipt does not match the original instruction.')
      confirmed = true
      clearOrganizationPending(actorId, 'review', result.clientId); setPending(null); setSelected(null); setDocument(null); onDecisionRecorded?.(); await load(); setMessage('Organization decision recorded. Current applications are shown.')
    } catch (error) {
      if (confirmed) throw new Error('The organization decision was saved, but applications could not refresh. Refresh this queue before another decision.')
      if (error instanceof CaptureRequestError && error.status >= 400 && error.status < 500 && error.code !== 'INVALID_RESPONSE') {
        clearOrganizationPending(actorId, 'review', instruction.command.clientId); setPending(null)
        if (error.code === 'ORGANIZATION_CHANGED') { setSelected(null); setDocument(null); await load() }
      }
      throw error
    }
  }
  async function submit(): Promise<void> {
    if (!selected || disabled || busy || pending || recoveryError) return
    if (decision === 'approve' && !opened) throw new Error('Open the current private registration document before approving.')
    const command = organizationReviewSchema.parse({ clientId: crypto.randomUUID(), targetId: selected.id, expectedRevision: selected.revision, decision, reason, checklist })
    const instruction = saveOrganizationPending({ actorId, scope: 'review', command }); setPending(instruction)
    await send(instruction)
  }
  async function check(): Promise<void> {
    if (!pending) return
    let confirmed = false
    try {
      const result = await listingRequest(actorId, '/api/v1/admin/organizations/receipts/' + pending.command.clientId, organizationReceiptSchema)
      if (result.clientId !== pending.command.clientId) throw new Error('The original decision receipt does not match.')
      confirmed = true
      clearOrganizationPending(actorId, 'review', result.clientId); setPending(null); setCanRetry(false); setSelected(null); onDecisionRecorded?.(); await load(); setMessage('The original organization decision was confirmed without replay.')
    } catch (error) { if (confirmed) throw new Error('The original organization decision was confirmed. Refresh applications before another decision.'); if (error instanceof CaptureRequestError && error.status === 404) { setCanRetry(true); setMessage('No committed receipt exists. Resend only the exact saved decision if you wish.'); return } throw error }
  }
  async function prepareDocument(supporting = false): Promise<void> {
    if (!selected) return
    const result = await listingRequest(actorId, '/api/v1/admin/organizations/' + selected.id + '/document' + (supporting ? '?supporting=1' : ''), organizationLinkSchema)
    const url = new URL(result.url, window.location.origin)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/files/compliance-docs/')) throw new Error('The private document link could not be verified.')
    setDocument({ url: url.pathname + url.search, expiresAt: result.expiresAt, supporting })
  }
  function clearSelection(): void { setSelected(null); setDocument(null); setOpened(false); setReason('') }
  function changeFilter(name: 'status' | 'sort', value: string): void {
    if (name === 'status') setStatus(value); else setSort(value)
    setCursor(null); setHistory([]); clearSelection()
  }
  const blocked = disabled || busy || Boolean(pending) || recoveryError || loading || Boolean(queueError)
  const filtersBlocked = disabled || busy || Boolean(pending) || recoveryError
  const first = items.length ? history.length * 25 + 1 : 0, last = items.length ? first + items.length - 1 : 0
  return <section className="space-y-5" aria-label="Organization applications">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Organization applications</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">Review CAC registration evidence and the representative’s authority. Registration approval opens marketplace access; asset ownership and listing publication require their own review.</p></div><button className={button} disabled={busy || loading} onClick={() => { void run(load) }}>Refresh organizations</button></div>
    {message && <p role="status" className={panel + ' text-sm leading-6 text-text-secondary'}>{message}</p>}
    <form className={panel + ' grid min-w-0 gap-4 sm:grid-cols-2'} onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setCursor(null); setHistory([]); clearSelection() }}>
      <label className="min-w-0 text-xs font-medium text-text-muted sm:col-span-2">Search organizations<input type="search" maxLength={254} disabled={filtersBlocked} value={query} onChange={event => setQuery(event.target.value)} placeholder="Legal name, RC number or representative" className={field} /></label>
      <label className="min-w-0 text-xs font-medium text-text-muted">Application status<select className={field} disabled={filtersBlocked} value={status} onChange={event => changeFilter('status', event.target.value)}><option value="pending">Pending review</option><option value="approved">Approved</option><option value="changes_requested">Changes requested</option><option value="rejected">Rejected</option><option value="all">All applications</option></select></label>
      <label className="min-w-0 text-xs font-medium text-text-muted">Application sort order<select className={field} disabled={filtersBlocked} value={sort} onChange={event => changeFilter('sort', event.target.value)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
      <div className="flex min-w-0 flex-wrap gap-3 sm:col-span-2"><button className={button} disabled={filtersBlocked || loading}>Search applications</button><button type="button" className={button} disabled={filtersBlocked} onClick={() => { setQuery(''); setSearch(''); setStatus('pending'); setSort('oldest'); setCursor(null); setHistory([]); clearSelection() }}>Clear application filters</button></div>
      <p className="text-xs leading-6 text-text-muted sm:col-span-2">Pending applications are shown oldest first so earlier requests remain discoverable. Search covers all matching applications, not only this page.</p>
    </form>
    {loading && <p role="status" className={panel + ' text-sm leading-6 text-text-muted'}>Loading organization applications...</p>}
    {queueError && <div className={panel}><p role="alert" className="break-words text-sm leading-6 text-text-secondary">{queueError}</p><button type="button" className={button + ' mt-4'} disabled={filtersBlocked || loading} onClick={() => { void run(load) }}>Retry organization search</button></div>}
    {pending && <section className={panel}><h3 className="font-semibold">Confirm the original organization decision</h3><p className="mt-2 text-sm text-text-muted">New organization decisions are paused. Readback does not send another decision.</p><button className={button + ' mt-4'} disabled={busy} onClick={() => { void run(check) }}>Check original organization decision</button>{canRetry && <button className={button + ' mt-4'} disabled={busy || disabled} onClick={() => { void run(() => send(pending)) }}>Resend exact saved organization decision</button>}</section>}
    {ready && !queueError && <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"><div className="space-y-3"><p role="status" className="text-xs leading-6 text-text-muted">Showing {first}-{last} of {total} matching applications.</p>{items.length ? items.map(item => <button key={item.id + ':' + item.revision} className={panel + ' w-full text-left disabled:opacity-50'} disabled={blocked} onClick={() => select(item)}><span className="block break-words font-semibold">{item.legalName}</span><span className="mt-2 block text-xs text-text-muted">{item.registrationNumber} · {item.status.replaceAll('_', ' ')}</span><span className="mt-2 block text-xs text-text-muted">Submitted <time dateTime={item.submittedAt}>{new Date(item.submittedAt).toLocaleDateString()}</time>{item.status === 'pending' ? ' / Waiting ' + Math.max(0, Math.floor((new Date(loadedAt ?? item.submittedAt).getTime() - new Date(item.submittedAt).getTime()) / 86400000)) + ' days' : ''}</span></button>) : <p className={panel + ' text-sm text-text-muted'}>No applications match these filters. Try another name, registration number or status.</p>}</div>
      {selected ? <form id="organization-selected-application" tabIndex={-1} aria-label="Review organization application" key={selected.id + ':' + selected.revision} className={panel + ' space-y-5'} onSubmit={event => { event.preventDefault(); void run(submit) }}><div><div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-words text-lg font-semibold">{selected.legalName}</h3><button type="button" className={button} disabled={filtersBlocked} onClick={clearSelection}>Close application</button></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{selected.registrationType.replaceAll('_', ' ')} · {selected.registrationNumber}<br />Representative: {selected.representativeName} · {selected.representativeRole}<br />Evidence: {selected.documentKind.replaceAll('_', ' ')}</p></div>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={blocked} className={button} onClick={() => { void run(() => prepareDocument()) }}>Prepare registration document</button>{selected.supportingKind && <button type="button" className={button} disabled={blocked} onClick={() => { void run(() => prepareDocument(true)) }}>Prepare supporting document</button>}</div>
        {document && <p className="text-xs leading-6 text-text-muted"><a href={document.url} target="_blank" rel="noreferrer" onClick={() => { if (!document.supporting) setOpened(true) }} className="inline-flex min-h-11 items-center text-accent-hover underline">Download private document</a><br />Link expires at {new Date(document.expiresAt).toLocaleTimeString()}.</p>}
        {selected.reviewReason && <p className="whitespace-pre-wrap text-sm text-text-muted">{selected.reviewReason}</p>}
        {selected.status === 'pending' && selected.userId !== actorId && <fieldset disabled={blocked} className="space-y-4"><legend className="mb-3 font-semibold">Independent review</legend>{([['registrationMatches', 'Legal name and registration number match the submitted evidence.'], ['registerChecked', 'I checked the registration against the official CAC register.'], ['authorityConfirmed', 'I established the representative’s authority to act for this organization.']] as const).map(([name, text]) => <label key={name} className="flex items-start gap-3 text-sm leading-6 text-text-secondary"><input type="checkbox" checked={checklist[name]} onChange={event => setChecklist(previous => ({ ...previous, [name]: event.target.checked }))} className="mt-1 size-5 shrink-0 accent-accent-primary" />{text}</label>)}<a className="inline-flex min-h-11 items-center text-xs text-accent-hover underline" href="https://search.cac.gov.ng/home" target="_blank" rel="noreferrer">Open official CAC public search</a>
          <label className="block text-sm">Decision<select className={field} value={decision} onChange={event => { const parsed = organizationReviewSchema.shape.decision.safeParse(event.target.value); if (parsed.success) setDecision(parsed.data) }}><option value="request_changes">Request changes</option><option value="reject">Reject application</option><option value="approve">Approve marketplace access</option></select></label><label className="block text-sm">Reason visible to the applicant (at least 15 characters)<textarea className={field + ' min-h-28'} minLength={15} maxLength={2000} required value={reason} onChange={event => setReason(event.target.value)} /></label>
          <button className={button + ' w-full bg-accent-primary text-text-inverse'} disabled={blocked || reason.trim().length < 15 || decision === 'approve' && (!opened || !Object.values(checklist).every(Boolean))}>{busy ? 'Saving decision…' : 'Record organization decision'}</button></fieldset>}
        {selected.userId === actorId && <p className="text-sm text-text-muted">Another administrator must review your organization. An owner override cannot approve this application.</p>}
      </form> : <div className={panel + ' text-sm leading-6 text-text-muted'}>Select an application to review its private evidence and registration details.</div>}</div>}
    {ready && !queueError && <nav className="flex min-w-0 flex-wrap items-center justify-between gap-3" aria-label="Organization result pages"><button type="button" className={button} disabled={filtersBlocked || loading || !history.length} onClick={() => { const pages = [...history]; setCursor(pages.pop() ?? null); setHistory(pages); clearSelection() }}>Previous applications</button><span className="text-xs text-text-muted">Page {history.length + 1}</span><button type="button" className={button} disabled={filtersBlocked || loading || !hasMore || !nextCursor} onClick={() => { setHistory(previous => [...previous, cursor]); setCursor(nextCursor); clearSelection() }}>Next applications</button></nav>}
  </section>
}
