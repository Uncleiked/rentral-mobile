'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { adminCommandReceiptSchema, adminDashboardSchema, adminDocumentSchema, adminListingSchema, adminUsersSchema,
  type AdminCommand, type AdminDashboard, type AdminListing, type AdminUser } from '@/lib/contracts/admin'
import { CaptureRequestError, listingRequest } from '@/lib/listings/capture-client'
import { clearAdminCommand, readAdminCommand, saveAdminCommand } from '@/lib/admin/web-recovery'

const field = 'mt-2 block w-full min-w-0 rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary'
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold disabled:opacity-50'
const panel = 'min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6'
const label = 'block text-xs font-medium text-text-muted'
const errorText = (error: unknown) => error instanceof Error ? error.message.slice(0, 1000) : 'The request could not be confirmed. Keep the original instruction and check its status.'
type Selection = { kind: 'listing'; value: AdminListing } | { kind: 'user'; value: AdminUser } | { kind: 'inspection'; value: AdminDashboard['inspections'][number] }

export function AdminWorkspace({ actorId }: { actorId: string }) {
  const [data, setData] = useState<AdminDashboard | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [operation, setOperation] = useState('approve_document')
  const [role, setRole] = useState('member')
  const [reason, setReason] = useState('')
  const [override, setOverride] = useState(false)
  const [query, setQuery] = useState('')
  const [listingId, setListingId] = useState('')
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

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    const result = await listingRequest(actorId, '/api/v1/admin', adminDashboardSchema)
    if (active.current && sequence === loadSequence.current) setData(result)
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
  function select(next: Selection): void {
    if (busy || pending || recoveryError) return
    setSelection(next); setReason(''); setOverride(false); setMessage(''); setPrivateDocument(null); setOpenedDocument(null)
    setOperation(next.kind === 'listing' ? 'approve_document' : next.kind === 'inspection' ? 'approve' : 'set_gallery_permission')
    if (next.kind === 'user') setRole(next.value.role === 'owner' ? 'admin' : next.value.role)
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
      setPending(null); setCanRetry(false); setSelection(null); setUsers(null); setPrivateDocument(null); setOpenedDocument(null)
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
    const base = { clientId: crypto.randomUUID(), targetId: selection.value.id, expectedRevision: selection.value.revision, reason }
    const instruction = selection.kind === 'listing' ? { ...base, operation, ownerOverride: override }
      : selection.kind === 'inspection' ? { ...base, operation: 'review_manual_inspection', decision: operation }
      : operation === 'change_role' ? { ...base, operation, role }
      : operation === 'set_gallery_permission' ? { ...base, operation, allowed: !selection.value.galleryAllowed, ownerOverride: override }
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
  async function prepareDocument(item: AdminListing): Promise<void> {
    const result = await listingRequest(actorId, `/api/v1/admin/listings/${item.id}/document`, adminDocumentSchema)
    const url = new URL(result.url, window.location.origin)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.pathname.startsWith('/api/v1/files/compliance-docs/')) throw new Error('The private document link could not be verified.')
    if (active.current) setPrivateDocument({ id: item.id, url: url.pathname + url.search, expiresAt: result.expiresAt })
  }

  const permissions = data?.permissions ?? []
  const can = (permission: string) => permissions.includes(permission)
  const blocked = busy || Boolean(pending) || recoveryError || !hydrated
  const ownListing = selection?.kind === 'listing' && selection.value.lister.id === actorId
  const ownGalleryPermission = selection?.kind === 'user' && selection.value.id === actorId && data?.role === 'owner' && operation === 'set_gallery_permission'
  const tools = [
    { href: '/marketplace/admin', text: 'Reports, safety and renewal evidence', permission: 'staff:workspace' },
    { href: '/marketplace/admin/finance', text: 'Payments, refunds and settlement', permission: 'finance:review' },
    { href: '/marketplace/admin/lifecycle', text: 'Lease reviews and worker incidents', permission: 'operations:read' },
    { href: '/marketplace/admin/matching', text: 'Squat-Mates reports', permission: 'safety:review' },
    { href: '/marketplace/admin/campaigns', text: 'Sponsored campaign reviews', permission: 'ad:review' },
    { href: '/marketplace/insights', text: 'Platform Insights', permission: 'insights:view' },
  ]

  return <div className="mx-auto w-full max-w-6xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
    <header><p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent-hover"><ShieldCheck className="size-4" aria-hidden="true" /> {data?.role === 'owner' ? 'Owner console' : 'Administration'}</p><h1 className="mt-3 text-3xl font-semibold text-text-primary">Review and manage Rentral</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">Review documents, manage uploader permissions and decide which listings can go live. Every decision records who made it and why.</p></header>
    <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy} className={button} onClick={() => { void run(load) }}>Refresh records</button><Link className={button} href="/marketplace">Back to marketplace</Link></div>
    {message && <p role="status" className="break-words rounded-xl border border-border-subtle p-4 text-sm leading-6 text-text-secondary">{message}</p>}
    {pending && <section className={panel} aria-label="Unconfirmed admin instruction"><h2 className="text-lg font-semibold">Confirm the original decision</h2><p className="mt-3 break-words text-sm text-text-muted">{pending.operation.replaceAll('_', ' ')} · {pending.targetId}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-secondary">{pending.reason}</p><p className="mt-3 text-xs leading-5 text-text-muted">New decisions are paused until this instruction is confirmed. Status checks never send it again.</p><div className="mt-4 flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => { void run(checkPending) }}>Check original decision</button>{canRetry && <button className={button} disabled={busy} onClick={() => { void run(() => send(pending)) }}>Resend exact saved decision</button>}</div></section>}
    {loading ? <p role="status" className="text-sm text-text-muted">Loading administrative records…</p> : !data ? <section className={panel}><h2 className="font-semibold">Administration unavailable</h2><p className="mt-3 text-sm text-text-muted">Sign in with your authorized account and refresh. Your current account permissions are checked by the server.</p></section> : <>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Review totals">{[['Listings', data.listings.length], ['Manual inspections', data.inspections.length], ['Recent decisions', data.audit.length]].map(([name, count]) => <div className={panel} key={name}><p className="text-xs text-text-muted">{name}</p><p className="mt-2 text-2xl font-semibold text-text-primary">{count}</p><p className="mt-1 text-xs text-text-muted">Shown in this bounded view</p></div>)}</section>
      {selection && <section className={panel} aria-label="Selected record"><h2 className="text-lg font-semibold">{selection.kind === 'listing' ? selection.value.title : selection.kind === 'user' ? selection.value.email : 'Manual inspection review'}</h2><p className="mt-2 break-all text-xs text-text-muted">{selection.value.id}</p>
        {selection.kind === 'listing' && <><p className="mt-3 text-sm leading-6 text-text-secondary">{selection.value.address || 'No address supplied'}<br />{selection.value.source === 'approved_gallery' ? 'Admin-approved gallery; recording location is unverified.' : `Recording address: ${selection.value.locationStatus ?? 'not verified'}`}<br />Document: {selection.value.document.status}{selection.value.document.approvalMatches ? ' · current file approved' : ''}<br />Publication fee: {selection.value.fee.waived ? 'waived by admin' : selection.value.fee.paid ? 'verified payment' : 'not paid'}<br />Media: {selection.value.media.photoCount} photos{selection.value.media.hasVideo ? ` · video ${selection.value.media.status ?? 'not processed'}` : ''}</p>
          {selection.value.document.present && <div className="mt-4 flex flex-wrap items-center gap-3"><button className={button} disabled={blocked} onClick={() => { if (selection.kind === 'listing') void run(() => prepareDocument(selection.value)) }}>Prepare private document</button>{privateDocument?.id === selection.value.id && <a className={button} href={privateDocument.url} target="_blank" rel="noreferrer" onClick={() => setOpenedDocument(selection.value.id)}>Open current document ↗</a>}</div>}
          <p className="mt-3 text-xs leading-5 text-text-muted">Human review is required. A fee waiver replaces collection only; document and media requirements still apply.</p></>}
        {selection.kind === 'user' && <p className="mt-3 text-sm leading-6 text-text-secondary">Role: {selection.value.role} · {selection.value.closed ? 'account closed' : selection.value.suspended ? 'suspended' : 'active'}<br />Gallery uploads: {selection.value.galleryAllowed ? 'approved' : 'not approved'}. Revocation removes gallery listings from discovery pending review.</p>}
        {selection.kind === 'inspection' && <><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{selection.value.evidence}</p><p className="mt-3 text-xs leading-5 text-text-muted">This is a manual inspection decision. It does not establish GPS presence or send a payout. Neither participant may approve their own inspection.</p></>}
        <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void run(submit) }}><fieldset disabled={blocked} className="min-w-0 space-y-4">
          <label className={label}>Decision<select className={field} value={operation} onChange={event => setOperation(event.target.value)}>{selection.kind === 'listing' ? <>{can('listing:review') && <><option value="approve_document">Approve current document</option><option value="reject_document">Reject document</option><option value="publish">Publish listing</option><option value="suspend_listing">Remove listing from discovery</option></>}{can('listing:waive') && <><option value="waive_fee">Waive publication fee</option><option value="revoke_fee_waiver">Revoke fee waiver</option></>}</> : selection.kind === 'inspection' ? <><option value="approve">Approve manual inspection evidence</option><option value="reject">Reject manual inspection evidence</option></> : <>{can('gallery:manage') && <option value="set_gallery_permission">{selection.value.galleryAllowed ? 'Revoke gallery permission' : 'Approve gallery uploader'}</option>}{can('staff:manage') && <option value="change_role">Change staff role</option>}{can('user:manage') && <><option value="suspend_user">Suspend account</option><option value="restore_user">Restore suspended account</option></>}{can('owner:transfer') && selection.value.id !== actorId && <option value="transfer_ownership">Transfer platform ownership to this account</option>}</>}</select></label>
          {selection.kind === 'user' && operation === 'change_role' && <label className={label}>Staff role<select value={role} onChange={event => setRole(event.target.value)} className={field}>{['member', 'moderator', 'finance', 'analyst', 'admin'].map(value => <option value={value} key={value}>{value}</option>)}</select></label>}
          {ownListing && data.role === 'owner' && <label className="flex items-start gap-3 text-sm leading-6 text-text-secondary"><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)} className="mt-1 size-5 shrink-0 accent-accent-primary" />I am using an owner override to review my own listing. This will be recorded.</label>}
          {ownGalleryPermission && <label className="flex items-start gap-3 text-sm leading-6 text-text-secondary"><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)} className="mt-1 size-5 shrink-0 accent-accent-primary" />I am deciding my own gallery-upload exception as the platform owner. This will be recorded.</label>}
          <label className={label}>Reason for this decision<textarea required minLength={override || operation === 'transfer_ownership' || selection.kind === 'inspection' ? 30 : 15} maxLength={2000} rows={4} className={field} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <button className={`${button} bg-accent-primary text-text-inverse`} disabled={blocked || Boolean((ownListing || ownGalleryPermission) && !override)}>{busy ? 'Saving decision…' : 'Record decision'}</button><button type="button" className={`${button} ml-2`} disabled={busy} onClick={() => setSelection(null)}>Close record</button>
        </fieldset></form></section>}
      <section className={panel}><h2 className="text-lg font-semibold">Listings</h2><form className="mt-4 flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); void run(async () => { const result = await listingRequest(actorId, `/api/v1/admin/listings/${encodeURIComponent(listingId)}`, adminListingSchema); if (active.current) select({ kind: 'listing', value: result }) }) }}><label className={`${label} min-w-0 flex-1`}>Find a listing by its ID<input value={listingId} maxLength={36} onChange={event => setListingId(event.target.value)} className={field} placeholder="Listing ID" required /></label><button className={`${button} self-end`} disabled={blocked}>Find listing</button></form><div className="mt-4 grid gap-3 lg:grid-cols-2">{data.listings.map(item => <button key={item.id} disabled={blocked} onClick={() => select({ kind: 'listing', value: item })} className="min-w-0 rounded-xl border border-border-subtle p-4 text-left disabled:opacity-50"><span className="block break-words font-semibold">{item.title}</span><span className="mt-2 block text-xs leading-6 text-text-muted">{item.category} · {item.status.replaceAll('_', ' ')} · @{item.lister.username ?? 'member'}<br />{item.source === 'approved_gallery' ? 'Approved gallery' : 'Recorded walkthrough'} · Fee {item.fee.waived ? 'waived' : item.fee.paid ? 'paid' : 'unpaid'}</span></button>)}</div>{!data.listings.length && <p className="mt-4 text-sm text-text-muted">No listings in the review queue. Use a listing ID to review another record.</p>}</section>
      {(can('user:manage') || can('staff:manage') || can('gallery:manage')) && <section className={panel}><h2 className="text-lg font-semibold">Members and uploader permissions</h2><form className="mt-4 flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); void run(async () => { const result = await listingRequest(actorId, `/api/v1/admin/users?query=${encodeURIComponent(query)}`, adminUsersSchema); if (active.current) setUsers(result.items) }) }}><label className={`${label} min-w-0 flex-1`}>Search email, username or account ID<input className={field} value={query} maxLength={254} onChange={event => setQuery(event.target.value)} /></label><button className={`${button} self-end`} disabled={blocked}>Find members</button></form><div className="mt-4 grid gap-3 lg:grid-cols-2">{(users ?? data.users).map(item => <button key={item.id} className="min-w-0 rounded-xl border border-border-subtle p-4 text-left disabled:opacity-50" disabled={blocked} onClick={() => select({ kind: 'user', value: item })}><span className="block break-all text-sm font-semibold">{item.email}</span><span className="mt-2 block text-xs text-text-muted">{item.role} · Gallery {item.galleryAllowed ? 'approved' : 'not approved'} · {item.closed ? 'closed' : item.suspended ? 'suspended' : 'active'}</span></button>)}</div>{!(users ?? data.users).length && <p className="mt-4 text-sm text-text-muted">No matching accounts found.</p>}</section>}
      {can('inspection:review') && <section className={panel}><h2 className="text-lg font-semibold">Manual inspection evidence</h2><div className="mt-4 space-y-3">{data.inspections.map(item => <button key={item.id} className="block w-full min-w-0 rounded-xl border border-border-subtle p-4 text-left" disabled={blocked} onClick={() => select({ kind: 'inspection', value: item })}><span className="block break-all text-sm font-semibold">Inspection {item.id}</span><span className="mt-2 block whitespace-pre-wrap break-words text-xs leading-5 text-text-muted">{item.evidence}</span></button>)}</div>{!data.inspections.length && <p className="mt-4 text-sm text-text-muted">No manual inspections await review.</p>}</section>}
      <nav className="grid gap-3 sm:grid-cols-2" aria-label="Specialized admin workspaces">{tools.filter(tool => can(tool.permission)).map(tool => <Link key={tool.href} href={tool.href} className={`${button} justify-start`}>{tool.text} →</Link>)}</nav>
      {can('operations:read') && <section className={panel}><h2 className="text-lg font-semibold">Audit trail</h2><div className="mt-4 space-y-4">{data.audit.map(item => <article key={item.id} className="min-w-0 border-b border-border-subtle pb-4 last:border-0"><p className="text-sm font-semibold">{item.action.replaceAll('_', ' ')}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{item.reason}</p><p className="mt-2 break-all text-xs text-text-muted">{item.targetType} · {item.targetId} · {new Date(item.createdAt).toLocaleString()}</p></article>)}</div>{!data.audit.length && <p className="mt-4 text-sm text-text-muted">No administrative decisions recorded yet.</p>}</section>}
    </>}
  </div>
}
