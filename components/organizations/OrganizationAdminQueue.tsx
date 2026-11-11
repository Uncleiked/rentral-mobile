'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CaptureRequestError, listingRequest } from '@/lib/listings/capture-client'
import { organizationLinkSchema, organizationQueueSchema, organizationReceiptSchema, organizationReviewSchema, type OrganizationView } from '@/lib/contracts/organizations'
import { clearOrganizationPending, readOrganizationPending, saveOrganizationPending, type OrganizationPending } from '@/lib/organizations/recovery'

const panel = 'min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6'
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold disabled:opacity-50'
const field = 'mt-2 block w-full min-w-0 rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary'
export function OrganizationAdminQueue({ actorId, disabled = false }: { actorId: string; disabled?: boolean }) {
  const [items, setItems] = useState<OrganizationView[]>([])
  const [selected, setSelected] = useState<OrganizationView | null>(null)
  const [checklist, setChecklist] = useState({ registrationMatches: false, registerChecked: false, authorityConfirmed: false })
  const [reason, setReason] = useState(''), [decision, setDecision] = useState<'approve' | 'request_changes' | 'reject'>('request_changes')
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [message, setMessage] = useState('')
  const [document, setDocument] = useState<{ url: string; expiresAt: string; supporting: boolean } | null>(null), [opened, setOpened] = useState(false)
  const [pending, setPending] = useState<OrganizationPending | null>(null), [canRetry, setCanRetry] = useState(false), [recoveryError, setRecoveryError] = useState(false)
  const active = useRef(true), sending = useRef(false)
  const load = useCallback(async () => {
    const result = await listingRequest(actorId, '/api/v1/admin/organizations', organizationQueueSchema)
    if (active.current) { setItems(result.items); setReady(true) }
  }, [actorId])
  useEffect(() => {
    active.current = true
    void load().catch(error => { if (active.current) setMessage(error instanceof Error ? error.message : 'Organization review is unavailable.') })
    let current = true
    void Promise.resolve().then(() => {
      if (!current) return
      try { setPending(readOrganizationPending(actorId, 'review')) } catch { setRecoveryError(true); setMessage('A saved organization decision needs recovery. Keep browser data and review its audit history.') }
    })
    return () => { current = false; active.current = false }
  }, [actorId, load])
  async function run(work: () => Promise<void>): Promise<void> {
    if (sending.current) return
    sending.current = true; setBusy(true); setMessage('')
    try { await work() } catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : 'The original decision could not be confirmed.') }
    finally { sending.current = false; if (active.current) setBusy(false) }
  }
  function select(item: OrganizationView): void {
    if (disabled || busy || pending || recoveryError) return
    setSelected(item); setChecklist({ registrationMatches: false, registerChecked: false, authorityConfirmed: false }); setReason(''); setDecision('request_changes'); setDocument(null); setOpened(false); setMessage('')
  }
  async function send(instruction: OrganizationPending): Promise<void> {
    if (instruction.scope !== 'review') return
    setCanRetry(false)
    try {
      const result = await listingRequest(actorId, '/api/v1/admin/organizations', organizationReceiptSchema, instruction.command)
      if (result.clientId !== instruction.command.clientId) throw new Error('The decision receipt does not match the original instruction.')
      clearOrganizationPending(actorId, 'review', result.clientId); setPending(null); setSelected(null); setDocument(null); await load(); setMessage('Organization decision recorded. Current applications are shown.')
    } catch (error) {
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
    try {
      const result = await listingRequest(actorId, '/api/v1/admin/organizations/receipts/' + pending.command.clientId, organizationReceiptSchema)
      if (result.clientId !== pending.command.clientId) throw new Error('The original decision receipt does not match.')
      clearOrganizationPending(actorId, 'review', result.clientId); setPending(null); setCanRetry(false); setSelected(null); await load(); setMessage('The original organization decision was confirmed without replay.')
    } catch (error) { if (error instanceof CaptureRequestError && error.status === 404) { setCanRetry(true); setMessage('No committed receipt exists. Resend only the exact saved decision if you wish.'); return } throw error }
  }
  async function prepareDocument(supporting = false): Promise<void> {
    if (!selected) return
    const result = await listingRequest(actorId, '/api/v1/admin/organizations/' + selected.id + '/document' + (supporting ? '?supporting=1' : ''), organizationLinkSchema)
    const url = new URL(result.url, window.location.origin)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/files/compliance-docs/')) throw new Error('The private document link could not be verified.')
    setDocument({ url: url.pathname + url.search, expiresAt: result.expiresAt, supporting })
  }
  const blocked = disabled || busy || Boolean(pending) || recoveryError
  const pendingItems = items.filter(item => item.status === 'pending')
  return <section className="space-y-5" aria-label="Organization applications">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Organization applications</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">Review CAC registration evidence and the representative’s authority. Registration approval opens marketplace access; asset ownership and listing publication require their own review.</p></div><button className={button} disabled={busy} onClick={() => { void run(load) }}>Refresh organizations</button></div>
    {message && <p role="status" className={panel + ' text-sm leading-6 text-text-secondary'}>{message}</p>}
    {!ready && <p className={panel + ' text-sm leading-6 text-text-muted'}>Organization review requires its separately prepared database collection. Existing admin tools remain available.</p>}
    {pending && <section className={panel}><h3 className="font-semibold">Confirm the original organization decision</h3><p className="mt-2 text-sm text-text-muted">New organization decisions are paused. Readback does not send another decision.</p><button className={button + ' mt-4'} disabled={busy} onClick={() => { void run(check) }}>Check original organization decision</button>{canRetry && <button className={button + ' mt-4'} disabled={busy || disabled} onClick={() => { void run(() => send(pending)) }}>Resend exact saved organization decision</button>}</section>}
    {ready && <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"><div className="space-y-3"><p className="text-xs text-text-muted">{pendingItems.length} pending in this bounded view of {items.length} applications.</p>{items.length ? items.map(item => <button key={item.id + ':' + item.revision} className={panel + ' w-full text-left disabled:opacity-50'} disabled={blocked} onClick={() => select(item)}><span className="block break-words font-semibold">{item.legalName}</span><span className="mt-2 block text-xs text-text-muted">{item.registrationNumber} · {item.status.replaceAll('_', ' ')}</span></button>) : <p className={panel + ' text-sm text-text-muted'}>No organization applications have been submitted.</p>}</div>
      {selected ? <form key={selected.id + ':' + selected.revision} className={panel + ' space-y-5'} onSubmit={event => { event.preventDefault(); void run(submit) }}><div><h3 className="break-words text-lg font-semibold">{selected.legalName}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{selected.registrationType.replaceAll('_', ' ')} · {selected.registrationNumber}<br />Representative: {selected.representativeName} · {selected.representativeRole}<br />Evidence: {selected.documentKind.replaceAll('_', ' ')}</p></div>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={blocked} className={button} onClick={() => { void run(() => prepareDocument()) }}>Prepare registration document</button>{selected.supportingKind && <button type="button" className={button} disabled={blocked} onClick={() => { void run(() => prepareDocument(true)) }}>Prepare supporting document</button>}</div>
        {document && <p className="text-xs leading-6 text-text-muted"><a href={document.url} target="_blank" rel="noreferrer" onClick={() => { if (!document.supporting) setOpened(true) }} className="inline-flex min-h-11 items-center text-accent-hover underline">Download private document</a><br />Link expires at {new Date(document.expiresAt).toLocaleTimeString()}.</p>}
        {selected.reviewReason && <p className="whitespace-pre-wrap text-sm text-text-muted">{selected.reviewReason}</p>}
        {selected.status === 'pending' && selected.userId !== actorId && <fieldset disabled={blocked} className="space-y-4"><legend className="mb-3 font-semibold">Independent review</legend>{([['registrationMatches', 'Legal name and registration number match the submitted evidence.'], ['registerChecked', 'I checked the registration against the official CAC register.'], ['authorityConfirmed', 'I established the representative’s authority to act for this organization.']] as const).map(([name, text]) => <label key={name} className="flex items-start gap-3 text-sm leading-6 text-text-secondary"><input type="checkbox" checked={checklist[name]} onChange={event => setChecklist(previous => ({ ...previous, [name]: event.target.checked }))} className="mt-1 size-5 shrink-0 accent-accent-primary" />{text}</label>)}<a className="inline-flex min-h-11 items-center text-xs text-accent-hover underline" href="https://search.cac.gov.ng/home" target="_blank" rel="noreferrer">Open official CAC public search</a>
          <label className="block text-sm">Decision<select className={field} value={decision} onChange={event => { const parsed = organizationReviewSchema.shape.decision.safeParse(event.target.value); if (parsed.success) setDecision(parsed.data) }}><option value="request_changes">Request changes</option><option value="reject">Reject application</option><option value="approve">Approve marketplace access</option></select></label><label className="block text-sm">Reason visible to the applicant (at least 15 characters)<textarea className={field + ' min-h-28'} minLength={15} maxLength={2000} required value={reason} onChange={event => setReason(event.target.value)} /></label>
          <button className={button + ' w-full bg-accent-primary text-text-inverse'} disabled={blocked || reason.trim().length < 15 || decision === 'approve' && (!opened || !Object.values(checklist).every(Boolean))}>{busy ? 'Saving decision…' : 'Record organization decision'}</button></fieldset>}
        {selected.userId === actorId && <p className="text-sm text-text-muted">Another administrator must review your organization. An owner override cannot approve this application.</p>}
      </form> : <div className={panel + ' text-sm leading-6 text-text-muted'}>Select an application to review its private evidence and registration details.</div>}</div>}
  </section>
}
