'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUpRight, Building2, CheckCheck, ChevronRight, ClipboardCheck, FileClock, Layers3, Settings2, ShieldCheck, UsersRound } from 'lucide-react'
import { adminCommandReceiptSchema, adminDashboardSchema, adminDocumentSchema, adminUsersSchema,
  type AdminCommand, type AdminDashboard, type AdminUser } from '@/lib/contracts/admin'
import { CaptureRequestError, listingRequest } from '@/lib/listings/capture-client'
import { clearAdminCommand, readAdminCommand, saveAdminCommand } from '@/lib/admin/web-recovery'
import { OrganizationAdminQueue } from '@/components/organizations/OrganizationAdminQueue'
import { AdminRecordReview } from './AdminRecordReview'
import { AdminListingQueue, type AdminListingScope } from './AdminListingQueue'
import { adminTabs, decisionsFor, type AdminSelection, type AdminTab } from './admin-view'

const field = 'mt-2 block w-full min-w-0 rounded-xl border border-border-subtle bg-background-app p-3 text-base text-text-primary sm:text-sm focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-50'
const panel = 'min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6'
const label = 'block text-xs font-medium text-text-muted'
const errorText = (error: unknown) => error instanceof Error ? error.message.slice(0, 1000) : 'The request could not be confirmed. Keep the original instruction and check its status.'
const tabIcons = { listings: Layers3, members: UsersRound, organizations: Building2, inspections: ClipboardCheck, audit: FileClock, tools: Settings2 }

export function AdminWorkspace({ actorId }: { actorId: string }) {
  const [data, setData] = useState<AdminDashboard | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selection, setSelection] = useState<AdminSelection | null>(null)
  const [operation, setOperation] = useState('')
  const [role, setRole] = useState('member')
  const [reason, setReason] = useState('')
  const [override, setOverride] = useState(false)
  const [galleryAllowed, setGalleryAllowed] = useState(false)
  const [query, setQuery] = useState('')
  const [listingScope, setListingScope] = useState<AdminListingScope | null>(null)
  const [listingRefresh, setListingRefresh] = useState(0)
  const [freePostingAllowed, setFreePostingAllowed] = useState(false)
  const [directPublishAllowed, setDirectPublishAllowed] = useState(false)
  const [tab, setTab] = useState<AdminTab>('listings')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [pending, setPending] = useState<AdminCommand | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const [recoveryError, setRecoveryError] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [privateDocument, setPrivateDocument] = useState<{ id: string; url: string; expiresAt: string } | null>(null)
  const [openedDocument, setOpenedDocument] = useState<string | null>(null)
  const active = useRef(true)
  const sending = useRef(false)
  const loadSequence = useRef(0)
  const memberQuery = useRef<string | null>(null)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    const result = await listingRequest(actorId, '/api/v1/admin', adminDashboardSchema)
    if (active.current && sequence === loadSequence.current) { setData(result); setListingRefresh(value => value + 1) }
    if (memberQuery.current !== null && result.permissions.some(permission => ['user:manage', 'gallery:manage', 'listing:waive', 'staff:manage'].includes(permission))) {
      const resultUsers = await listingRequest(actorId, `/api/v1/admin/users?query=${encodeURIComponent(memberQuery.current)}`, adminUsersSchema)
      if (active.current && sequence === loadSequence.current) setUsers(resultUsers.items)
    }
  }, [actorId])
  useEffect(() => {
    active.current = true
    let current = true
    void Promise.resolve().then(() => {
      if (!current) return
      try { setPending(readAdminCommand(actorId)) }
      catch { setRecoveryError(true); setMessage('A saved admin instruction could not be read. Review the audit trail before clearing browser site storage.') }
      setHydrated(true)
    })
    void load().catch(error => { if (active.current) setMessage(errorText(error)) }).finally(() => { if (active.current) setLoading(false) })
    return () => { current = false; active.current = false }
  }, [actorId, load])

  async function run(task: () => Promise<void>): Promise<void> {
    if (sending.current) return
    sending.current = true; setBusy(true); setMessage('')
    try { await task() } catch (error) { if (active.current) setMessage(errorText(error)) }
    finally { sending.current = false; if (active.current) setBusy(false) }
  }
  function select(next: AdminSelection): void {
    if (busy || pending || recoveryError || !data) return
    setSelection(next); setReason(''); setOverride(false); setMessage(''); setPrivateDocument(null); setOpenedDocument(null)
    setOperation(decisionsFor(next, data.permissions, actorId, data.role === 'owner')[0]?.value ?? '')
    if (next.kind === 'user') { setRole(next.value.role === 'owner' ? 'admin' : next.value.role); setGalleryAllowed(next.value.galleryAllowed); setFreePostingAllowed(next.value.freePostingAllowed); setDirectPublishAllowed(next.value.directPublishAllowed) }
    requestAnimationFrame(() => {
      const review = document.getElementById('admin-selected-record')
      review?.focus({ preventScroll: true })
      if (window.innerWidth < 1024) review?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
  }
  function chooseTab(next: AdminTab): void {
    if (busy) return
    setTab(next); setSelection(null); setPrivateDocument(null); setOpenedDocument(null)
  }
  async function send(command: AdminCommand): Promise<void> {
    if (active.current) setCanRetry(false)
    let confirmed = false
    try {
      const receipt = await listingRequest(actorId, '/api/v1/admin/commands', adminCommandReceiptSchema, command)
      if (receipt.clientId !== command.clientId) throw new Error('This receipt belongs to another instruction.')
      confirmed = true
      clearAdminCommand(actorId, command.clientId)
      if (!active.current) return
      setPending(null); setCanRetry(false); setSelection(null); setPrivateDocument(null); setOpenedDocument(null)
      setMessage('Decision recorded in the audit trail. Refreshing the current records…')
      await load()
      if (active.current) setMessage('Decision saved. Current records are shown below.')
    } catch (error) {
      if (confirmed) throw new Error('The decision was saved, but the list could not refresh. Refresh before continuing.')
      const rejected = error instanceof CaptureRequestError && error.status >= 400 && error.status < 500 && error.code !== 'INVALID_RESPONSE'
      if (rejected) { clearAdminCommand(actorId, command.clientId); if (active.current) { setPending(null); setCanRetry(false) } }
      throw error
    }
  }
  async function submit(): Promise<void> {
    if (!hydrated || !selection || pending || recoveryError || !data) return
    if (!decisionsFor(selection, data.permissions, actorId, data.role === 'owner').some(action => action.value === operation)) throw new Error('Choose an action available for your current role.')
    const base = { clientId: crypto.randomUUID(), targetId: selection.value.id, expectedRevision: selection.value.revision, reason }
    const instruction = selection.kind === 'listing' ? { ...base, operation, ownerOverride: override }
      : selection.kind === 'inspection' ? { ...base, operation: 'review_manual_inspection', decision: operation }
      : operation === 'change_role' ? { ...base, operation, role }
      : operation === 'set_gallery_permission' ? { ...base, operation, allowed: galleryAllowed, ownerOverride: override }
      : operation === 'set_free_posting_permission' ? { ...base, operation, allowed: freePostingAllowed, ownerOverride: override }
      : operation === 'set_direct_publish_permission' ? { ...base, operation, allowed: directPublishAllowed, ownerOverride: override }
      : { ...base, operation }
    if (selection.kind === 'listing' && operation === 'approve_document' && openedDocument !== selection.value.id) throw new Error('Open the current private document before approving it.')
    const command = saveAdminCommand(actorId, instruction)
    setPending(command); setCanRetry(false)
    await send(command)
  }
  async function checkPending(): Promise<void> {
    if (!pending) return
    try {
      const result = await listingRequest(actorId, `/api/v1/admin/commands/${pending.clientId}`, adminCommandReceiptSchema)
      if (result.clientId !== pending.clientId) throw new Error('The recovered receipt belongs to another instruction.')
      clearAdminCommand(actorId, pending.clientId)
      if (!active.current) return
      setPending(null); setCanRetry(false); setSelection(null); await load()
      if (active.current) setMessage('The original decision was already recorded. It was not sent again.')
    } catch (error) {
      if (error instanceof CaptureRequestError && error.status === 404) { if (active.current) { setCanRetry(true); setMessage('No receipt is recorded yet. You may explicitly resend the exact saved instruction with its original identifier.') } return }
      throw error
    }
  }
  async function prepareDocument(): Promise<void> {
    if (selection?.kind !== 'listing') return
    const item = selection.value
    const result = await listingRequest(actorId, `/api/v1/admin/listings/${item.id}/document`, adminDocumentSchema)
    const url = new URL(result.url, window.location.origin)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.pathname.startsWith('/api/v1/files/compliance-docs/')) throw new Error('The private document link could not be verified.')
    if (active.current) setPrivateDocument({ id: item.id, url: url.pathname + url.search, expiresAt: result.expiresAt })
  }

  const permissions = data?.permissions ?? []
  const can = (permission: string) => permissions.includes(permission)
  const tabs = adminTabs(permissions)
  const currentTab = tabs.some(item => item.id === tab) ? tab : tabs[0].id
  const blocked = busy || Boolean(pending) || recoveryError || !hydrated
  const rowClass = 'w-full min-w-0 rounded-xl border px-4 py-4 text-left transition-colors hover:border-glass-border-medium focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50'
  const selectedOnTab = selection && (currentTab === 'listings' && selection.kind === 'listing' || currentTab === 'members' && selection.kind === 'user' || currentTab === 'inspections' && selection.kind === 'inspection')
  const detail = selectedOnTab && selection ? <AdminRecordReview selection={selection} actorId={actorId} owner={data?.role === 'owner'} permissions={permissions} blocked={blocked} busy={busy}
    operation={operation} setOperation={value => { setOperation(value); setOverride(false); setReason('') }} role={role} setRole={setRole} reason={reason} setReason={setReason} override={override} setOverride={setOverride} galleryAllowed={galleryAllowed} setGalleryAllowed={setGalleryAllowed} freePostingAllowed={freePostingAllowed} setFreePostingAllowed={setFreePostingAllowed} directPublishAllowed={directPublishAllowed} setDirectPublishAllowed={setDirectPublishAllowed}
    privateDocument={privateDocument} openedDocument={openedDocument} onPrepareDocument={() => { void run(prepareDocument) }} onOpenDocument={() => setOpenedDocument(selection.value.id)} onSubmit={() => { void run(submit) }} onClose={() => setSelection(null)} onViewListings={selection.kind === 'user' && (can('listing:review') || can('listing:waive')) ? () => { const user = selection.value; setListingScope({ id: user.id, label: (user.username ? '@' + user.username + ' / ' : '') + user.email }); chooseTab('listings') } : undefined} /> : <div className="hidden min-h-64 rounded-2xl border border-dashed border-border-subtle bg-surface-card p-8 text-center lg:flex lg:flex-col lg:items-center lg:justify-center min-w-0 max-w-full wrap-anywhere text-text-primary"><ClipboardCheck className="size-8 text-text-muted" /><h3 className="mt-4 text-base font-semibold text-text-primary">Choose a record to review</h3><p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">Open a record from the queue. Its evidence, permissions and available decisions will appear here.</p></div>
  const tools = [
    { href: '/marketplace/admin', text: 'Reports, safety and renewal evidence', description: 'Member reports, public safety findings and renewal proof.', permission: 'staff:workspace' },
    { href: '/marketplace/admin/finance', text: 'Payments, refunds and settlement', description: 'Independent finance decisions and provider reconciliation.', permission: 'finance:review' },
    { href: '/marketplace/admin/lifecycle', text: 'Lease reviews and worker incidents', description: 'Lease changes, reminders and background-worker recovery.', permission: 'operations:read' },
    { href: '/marketplace/admin/matching', text: 'Squat-Mates reports', description: 'Private co-living moderation and member reports.', permission: 'safety:review' },
    { href: '/marketplace/admin/campaigns', text: 'Sponsored campaign reviews', description: 'Review sponsored content and its commercial terms.', permission: 'ad:review' },
    { href: '/marketplace/insights', text: 'Platform Insights', description: 'Consented market aggregates with privacy thresholds.', permission: 'insights:view' },
  ]
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || busy) return
    event.preventDefault()
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    chooseTab(tabs[target].id); document.getElementById(`admin-tab-${tabs[target].id}`)?.focus()
  }

  return <div className="mx-auto w-full max-w-7xl py-3 text-text-primary sm:py-6">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent-hover"><ShieldCheck className="size-4" aria-hidden="true" /> {data?.role === 'owner' ? 'Owner console' : 'Administration'}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl break-words">Review and manage Rentral</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">Manage submitted listings, upload access, free posting and member accounts. Start with the review queue or find a host, then save a clear, reasoned decision.</p></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" disabled={busy} className={button} onClick={() => { void run(async () => { await load(); setSelection(null) }) }}>Refresh records</button><Link className={button} href="/marketplace">Marketplace <ArrowUpRight className="ml-2 size-4" /></Link></div></header>
    {message && <p role="status" aria-live="polite" className="mt-5 break-words rounded-xl border border-border-subtle bg-surface-card p-4 text-sm leading-6 text-text-secondary min-w-0 max-w-full wrap-anywhere">{message}</p>}
    {pending && <section className={`${panel} mt-5 border-glass-border-warning`} aria-label="Unconfirmed admin instruction"><h2 className="text-lg font-semibold break-words">Confirm the original decision</h2><p className="mt-3 break-words text-sm text-text-muted">{pending.operation.replaceAll('_', ' ')} / {pending.targetId}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-secondary">{pending.reason}</p><p className="mt-3 text-xs leading-5 text-text-muted">New decisions are paused until this instruction is confirmed. Status checks never send it again.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={() => { void run(checkPending) }}>Check original decision</button>{canRetry && <button type="button" className={button} disabled={busy} onClick={() => { void run(() => send(pending)) }}>Resend exact saved decision</button>}</div></section>}
    {loading ? <p role="status" className="mt-7 text-sm text-text-muted">Loading administrative records…</p> : !data ? <section className={`${panel} mt-7`}><h2 className="font-semibold break-words">Administration unavailable</h2><p className="mt-3 text-sm leading-6 text-text-muted">Sign in with your authorized account and refresh. Your current account permissions are checked by the server.</p></section> : <>
      <section className="mt-7 grid grid-cols-3 gap-2 sm:gap-4" aria-label="Recent administrative records">{[{ name: 'Recent listings', count: data.listings.length, target: 'listings' as const }, { name: 'Recent members', count: data.users.length, target: 'members' as const }, { name: 'Recent inspections', count: data.inspections.length, target: 'inspections' as const }].map(item => <button type="button" key={item.name} disabled={busy || !tabs.some(candidate => candidate.id === item.target)} onClick={() => chooseTab(item.target)} className="min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-2.5 text-left transition-colors hover:border-glass-border-medium focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-50 sm:p-5 min-h-11 max-w-full whitespace-normal break-words wrap-anywhere text-text-primary"><span className="block text-2xl font-semibold tabular-nums">{item.count}</span><span className="mt-2 block text-xs font-medium text-text-secondary">{item.name}</span><span className="mt-1 hidden text-xs text-text-muted sm:block">Up to 50 recent records</span></button>)}</section>
      <div className="mt-6 rounded-2xl border border-border-subtle bg-surface-card p-1.5 min-w-0 max-w-full wrap-anywhere text-text-primary"><div role="tablist" aria-label="Administrative workspaces" className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">{tabs.map((item, index) => { const Icon = tabIcons[item.id]; return <button key={item.id} id={`admin-tab-${item.id}`} type="button" role="tab" aria-selected={currentTab === item.id} aria-controls={`admin-panel-${item.id}`} tabIndex={currentTab === item.id ? 0 : -1} disabled={busy} onKeyDown={event => navigateTabs(event, index)} onClick={() => chooseTab(item.id)} className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50 sm:flex-1 ${currentTab === item.id ? 'bg-accent-muted text-accent-hover' : 'text-text-muted hover:bg-glass-light hover:text-text-primary'}`}><Icon className="hidden size-4 shrink-0 lg:block" /><span className="min-w-0 break-words">{item.label}</span></button> })}</div></div>
      <section className="mt-7 min-w-0" role="tabpanel" id={`admin-panel-${currentTab}`} aria-labelledby={`admin-tab-${currentTab}`}>
        {currentTab === 'organizations' && <OrganizationAdminQueue actorId={actorId} disabled={blocked} />}
        {currentTab === 'listings' && <AdminListingQueue key={listingScope?.id ?? 'all-hosts'} actorId={actorId} disabled={blocked} selectedId={selection?.kind === 'listing' ? selection.value.id : null} refreshToken={listingRefresh} scope={listingScope} onClearScope={() => { setListingScope(null); setSelection(null) }} onSelect={item => select({ kind: 'listing', value: item })} onClearSelection={() => setSelection(null)} detail={detail} />}
        {currentTab === 'members' && <>
          <h2 className="text-xl font-semibold break-words">Members and posting permissions</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">Find a member to view their submitted listings or manage upload, free-posting and direct-publication permissions. Switches prepare a decision; Record decision saves only the selected change with your reason.</p>
          <form className="mt-5 flex flex-wrap items-end gap-3 min-w-0 max-w-full" onSubmit={event => { event.preventDefault(); void run(async () => { const searched = query.trim(); const result = await listingRequest(actorId, `/api/v1/admin/users?query=${encodeURIComponent(searched)}`, adminUsersSchema); if (active.current) { memberQuery.current = searched; setUsers(result.items); setSelection(null) } }) }}><label className={`${label} w-full min-w-0 sm:w-auto sm:flex-1`}>Search email, username or account ID<input type="search" className={field} value={query} maxLength={254} onChange={event => setQuery(event.target.value)} placeholder="Member email, username or exact ID" /></label><button className={button} disabled={blocked}>Find members</button><button type="button" className={button} disabled={blocked || users === null} onClick={() => { memberQuery.current = null; setUsers(null); setQuery(''); setSelection(null) }}>Clear search</button></form>
          <p className="mt-5 text-xs text-text-muted">{users === null ? 'Recent accounts' : 'Search results'} / {(users ?? data.users).length} loaded records. Search uses an email or username prefix, or an exact account ID.</p>
          <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.3fr)]"><div className="min-w-0 space-y-2">{(users ?? data.users).map(item => <button type="button" key={item.id} disabled={blocked} aria-pressed={selection?.kind === 'user' && selection.value.id === item.id} onClick={() => select({ kind: 'user', value: item })} className={`${rowClass} ${selection?.kind === 'user' && selection.value.id === item.id ? 'border-accent-primary bg-accent-muted' : 'border-border-subtle bg-surface-card'}`}><span className="flex items-start gap-3"><span className="min-w-0 flex-1"><span className="block break-all text-sm font-semibold">{item.email}</span><span className="mt-2 block text-xs leading-5 text-text-muted">{item.role} / {item.closed ? 'closed' : item.suspended ? 'suspended' : 'active'}</span><span className={`mt-2 inline-block rounded-full border px-2.5 py-1 text-xs ${item.galleryAllowed ? 'border-glass-border-success bg-accent-muted text-accent-hover' : 'border-border-subtle text-text-muted'}`}>Gallery {item.galleryAllowed ? 'allowed' : 'not allowed'}</span>{item.freePostingAllowed && <span className="ml-2 mt-2 inline-block rounded-full border border-glass-border-success bg-accent-muted px-2.5 py-1 text-xs text-accent-hover">Free posting</span>}{item.directPublishAllowed && <span className="ml-2 mt-2 inline-block rounded-full border border-border-subtle px-2.5 py-1 text-xs text-text-secondary">Direct publication</span>}</span><ChevronRight className="mt-1 size-4 shrink-0 text-text-muted" /></span></button>)}{!(users ?? data.users).length && <div className={`${panel} border-dashed`}><h3 className="font-semibold">No matching accounts</h3><p className="mt-2 text-sm leading-6 text-text-muted">Try the beginning of their email or username, or paste their complete account ID.</p></div>}</div>{detail}</div>
        </>}
        {currentTab === 'inspections' && <><h2 className="text-xl font-semibold break-words">Manual inspection evidence</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">Independent review for gallery listings. Decisions do not create GPS proof or move money.</p><div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.3fr)]"><div className="space-y-3">{data.inspections.map(item => <button type="button" key={item.id} className={`${rowClass} ${selection?.kind === 'inspection' && selection.value.id === item.id ? 'border-accent-primary bg-accent-muted' : 'border-border-subtle bg-surface-card'}`} disabled={blocked} aria-pressed={selection?.kind === 'inspection' && selection.value.id === item.id} onClick={() => select({ kind: 'inspection', value: item })}><span className="block break-all text-sm font-semibold">Inspection {item.id}</span><span className="mt-2 block line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-text-muted">{item.evidence}</span></button>)}{!data.inspections.length && <div className={`${panel} border-dashed`}><CheckCheck className="size-6 text-accent-hover" /><h3 className="mt-3 font-semibold">No manual inspections await review</h3></div>}</div>{detail}</div></>}
        {currentTab === 'audit' && <><h2 className="text-xl font-semibold break-words">Audit trail</h2><p className="mt-2 text-sm leading-6 text-text-muted">The most recent recorded decisions. Historical reasons cannot be edited here.</p><div className="mt-5 space-y-3">{data.audit.map(item => <article key={item.id} className={panel}><div className="flex flex-wrap items-center justify-between gap-2 min-w-0"><h3 className="text-sm font-semibold capitalize">{item.action.replaceAll('_', ' ')}</h3><time dateTime={item.createdAt} className="text-xs text-text-muted">{new Date(item.createdAt).toLocaleString()}</time></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{item.reason}</p><p className="mt-3 break-all text-xs text-text-muted">{item.targetType} / {item.targetId}</p></article>)}</div>{!data.audit.length && <p className={`${panel} mt-5 text-sm text-text-muted`}>No administrative decisions recorded yet.</p>}</>}
        {currentTab === 'tools' && <><h2 className="text-xl font-semibold break-words">Specialized workspaces</h2><p className="mt-2 text-sm leading-6 text-text-muted">Open the tools available to your current role. Financial decisions keep their independent review and provider checks.</p><nav className="mt-5 grid gap-4 sm:grid-cols-2" aria-label="Specialized admin workspaces">{tools.filter(tool => can(tool.permission)).map(tool => <Link key={tool.href} href={tool.href} className={`${panel} group flex gap-4 transition-colors hover:border-accent-primary focus-visible:outline-2 focus-visible:outline-accent-primary`}><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{tool.text}</span><span className="mt-2 block text-xs leading-5 text-text-muted">{tool.description}</span></span><ArrowUpRight className="size-4 shrink-0 text-text-muted group-hover:text-accent-hover" /></Link>)}</nav></>}
      </section>
      <footer className="mt-8 border-t border-border-subtle pt-5 text-xs leading-5 text-text-muted">Listing search covers all matching submissions in pages. Other recent-record panels show up to 50 entries. Upload access, fee waivers and publication permission are separate; every saved decision requires current permission and an audit reason.</footer>
    </>}
  </div>
}