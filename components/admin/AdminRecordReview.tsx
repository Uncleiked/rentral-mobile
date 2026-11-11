'use client'

import { Check, Circle, FileText, ShieldAlert, X } from 'lucide-react'
import { AdminToggle } from './AdminToggle'
import { decisionsFor, type AdminSelection } from './admin-view'

const field = 'mt-2 block w-full min-w-0 rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-50'

type Props = {
  selection: AdminSelection; actorId: string; owner: boolean; permissions: readonly string[]; blocked: boolean; busy: boolean
  operation: string; setOperation: (value: string) => void; role: string; setRole: (value: string) => void
  reason: string; setReason: (value: string) => void; override: boolean; setOverride: (value: boolean) => void
  galleryAllowed: boolean; setGalleryAllowed: (value: boolean) => void
  privateDocument: { id: string; url: string; expiresAt: string } | null; openedDocument: string | null
  onPrepareDocument: () => void; onOpenDocument: () => void; onSubmit: () => void; onClose: () => void
}

export function AdminRecordReview(props: Props) {
  const { selection, actorId, owner, permissions, blocked, busy, operation, setOperation, role, setRole, reason, setReason,
    override, setOverride, galleryAllowed, setGalleryAllowed, privateDocument, openedDocument, onPrepareDocument, onOpenDocument, onSubmit, onClose } = props
  const actions = decisionsFor(selection, permissions, actorId, owner)
  const selfListing = selection.kind === 'listing' && selection.value.lister.id === actorId
  const selfGallery = selection.kind === 'user' && selection.value.id === actorId && operation === 'set_gallery_permission'
  const needsOverride = selfListing || selfGallery
  const minReason = needsOverride || operation === 'transfer_ownership' || selection.kind === 'inspection' ? 30 : 15
  const destructive = ['suspend_listing', 'reject_document', 'suspend_user', 'transfer_ownership'].includes(operation) || operation === 'set_gallery_permission' && !galleryAllowed
  const noGalleryChange = selection.kind === 'user' && operation === 'set_gallery_permission' && galleryAllowed === selection.value.galleryAllowed
  const ready = actions.some(action => action.value === operation) && reason.trim().length >= minReason && (!needsOverride || owner && override) && !noGalleryChange &&
    !(selection.kind === 'listing' && operation === 'approve_document' && openedDocument !== selection.value.id)
  const title = selection.kind === 'listing' ? selection.value.title : selection.kind === 'user' ? selection.value.email : 'Manual inspection review'
  const checks = selection.kind === 'listing' ? [
    { label: 'Authority document', detail: selection.value.document.approvalMatches ? 'Current file approved' : selection.value.document.status.replaceAll('_', ' '), passed: selection.value.document.approvalMatches },
    { label: 'Media', detail: `${selection.value.media.photoCount} photos${selection.value.media.hasVideo ? ` / video ${selection.value.media.status ?? 'not processed'}` : ''}`, passed: selection.value.source === 'approved_gallery' ? selection.value.media.photoCount > 0 && (!selection.value.media.hasVideo || selection.value.media.status === 'ready') : selection.value.media.status === 'ready' },
    { label: 'Recording location', detail: selection.value.source === 'approved_gallery' ? 'Unverified - approved gallery exception' : selection.value.locationStatus ?? 'Not verified', passed: selection.value.source !== 'approved_gallery' && selection.value.locationStatus === 'matched' },
    { label: 'Publication fee', detail: selection.value.fee.waived ? 'Waived by admin' : selection.value.fee.paid ? 'Verified payment' : 'Not paid', passed: selection.value.fee.waived || selection.value.fee.paid },
  ] : []

  return <section id="admin-selected-record" tabIndex={-1} className="min-w-0 scroll-mt-6 rounded-2xl border border-border-subtle bg-surface-card p-5 focus:outline-none sm:p-6" aria-label="Selected record">
    <header className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-widest text-accent-hover">{selection.kind === 'user' ? 'Member access' : selection.kind === 'listing' ? 'Listing review' : 'Independent evidence review'}</p><h2 className="mt-2 break-words text-lg font-semibold text-text-primary">{title}</h2><p className="mt-2 break-all text-xs text-text-muted">{selection.value.id}</p></div><button type="button" aria-label="Close record" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle text-text-muted hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50" disabled={busy} onClick={onClose}><X className="size-4" /></button></header>
    {selection.kind === 'listing' && <>
      <p className="mt-4 break-words text-sm leading-6 text-text-secondary">{selection.value.address || 'No address supplied'}</p>
      <dl className="mt-5 divide-y divide-border-subtle rounded-xl border border-border-subtle bg-background-app px-4">{checks.map(check => <div key={check.label} className="flex gap-3 py-3">{check.passed ? <Check className="mt-1 size-4 shrink-0 text-accent-hover" /> : <Circle className="mt-1 size-4 shrink-0 text-text-muted" />}<div className="min-w-0"><dt className="text-xs text-text-muted">{check.label}</dt><dd className="mt-1 break-words text-sm text-text-secondary">{check.detail}</dd></div></div>)}</dl>
      {selection.value.document.present && <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className={button} disabled={blocked} onClick={onPrepareDocument}><FileText className="mr-2 size-4" />Prepare private document</button>{privateDocument?.id === selection.value.id && <a className={button} href={privateDocument.url} target="_blank" rel="noreferrer" onClick={onOpenDocument}>Open current document ↗</a>}</div>}
      {operation === 'approve_document' && openedDocument !== selection.value.id && <p className="mt-3 text-xs leading-5 text-text-muted">Prepare and open the current private document before approving it.</p>}
      <p className="mt-3 text-xs leading-5 text-text-muted">Human review remains required. Gallery media has no recording GPS proof. A fee waiver changes no payment history.</p>
    </>}
    {selection.kind === 'user' && <>
      <dl className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-border-subtle bg-background-app p-4"><div><dt className="text-xs text-text-muted">Current role</dt><dd className="mt-1 text-sm capitalize text-text-secondary">{selection.value.role}</dd></div><div><dt className="text-xs text-text-muted">Account</dt><dd className="mt-1 text-sm text-text-secondary">{selection.value.closed ? 'Closed' : selection.value.suspended ? 'Suspended' : 'Active'}</dd></div><div className="col-span-2"><dt className="text-xs text-text-muted">Saved gallery permission</dt><dd className="mt-1 text-sm text-text-secondary">{selection.value.galleryAllowed ? 'Allowed' : 'Not allowed'} / revision {selection.value.galleryPermissionRevision}</dd></div></dl>
      {selection.value.role === 'owner' && selection.value.id !== actorId && <p className="mt-4 text-sm leading-6 text-text-muted">The platform owner is protected from ordinary account and role changes.</p>}
      {selection.value.closed && <p className="mt-4 text-sm leading-6 text-text-muted">Closed accounts cannot receive new administrative privileges.</p>}
    </>}
    {selection.kind === 'inspection' && <><p className="mt-5 whitespace-pre-wrap break-words rounded-xl border border-border-subtle bg-background-app p-4 text-sm leading-6 text-text-secondary">{selection.value.evidence}</p><p className="mt-3 text-xs leading-5 text-text-muted">This records independently reviewed evidence, not GPS presence or a payout. Neither participant may approve their own inspection.</p></>}
    {!actions.length ? <p className="mt-5 rounded-xl border border-border-subtle p-4 text-sm leading-6 text-text-muted">No decisions are available for this account with your current permissions.</p> : <form className="mt-6 border-t border-border-subtle pt-5" onSubmit={event => { event.preventDefault(); if (ready && !blocked) onSubmit() }}>
      <fieldset disabled={blocked} className="min-w-0 space-y-4"><legend className="mb-4 text-sm font-semibold text-text-primary">Record a decision</legend>
        <label className="block text-xs font-medium text-text-muted">Decision<select className={field} value={operation} onChange={event => setOperation(event.target.value)}>{actions.map(action => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
        {selection.kind === 'user' && operation === 'set_gallery_permission' && <>
          <AdminToggle label="Allow gallery uploads" checked={galleryAllowed} disabled={blocked} onChange={setGalleryAllowed} description="Allow this member to create listings from selected photos and videos. This does not verify their recording location." />
          <p className="text-xs leading-5 text-text-muted">{noGalleryChange ? 'Change the switch, add a reason, then save. The switch alone does not change permission.' : galleryAllowed ? 'Pending decision: allow gallery uploads. Save below to apply it.' : 'Pending decision: revoke gallery uploads. Existing gallery listings will leave discovery pending review.'}</p>
        </>}
        {selection.kind === 'user' && operation === 'change_role' && <label className="block text-xs font-medium text-text-muted">Staff role<select value={role} onChange={event => setRole(event.target.value)} className={field}>{['member', 'moderator', 'finance', 'analyst', 'admin'].map(value => <option value={value} key={value}>{value}</option>)}</select></label>}
        {needsOverride && owner && <label className="flex items-start gap-3 rounded-xl border border-glass-border-warning bg-glass-warning p-4 text-sm leading-6 text-text-secondary"><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)} className="mt-1 size-5 shrink-0 accent-accent-primary" /><span>{selfGallery ? 'I am deciding my own gallery-upload exception as the platform owner. This will be recorded.' : 'I am using an owner override to review my own listing. This will be recorded.'}<span className="mt-1 block text-xs text-text-muted">A detailed reason of at least 30 characters is required.</span></span></label>}
        {needsOverride && !owner && <p className="text-sm leading-6 text-text-muted">Another eligible administrator must review your own record.</p>}
        {destructive && <p className="flex gap-2 rounded-xl border border-glass-border-warning bg-glass-warning p-3 text-xs leading-5 text-text-secondary"><ShieldAlert className="mt-0.5 size-4 shrink-0" />{operation === 'transfer_ownership' ? 'This transfers platform ownership to the selected account and changes your role to admin. Review the account carefully.' : 'This decision can remove access or public visibility. Review the selected record and reason before saving.'}</p>}
        <label className="block text-xs font-medium text-text-muted">Reason for this decision<textarea required minLength={minReason} maxLength={2000} rows={4} className={field} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the evidence and why you are making this change." /></label>
        <p className="flex flex-wrap justify-between gap-2 text-xs text-text-muted"><span>At least {minReason} characters. Saved to the audit trail.</span><span>{reason.trim().length}/2000</span></p>
        <button className={`${button} w-full bg-accent-primary text-text-inverse hover:bg-accent-hover sm:w-auto`} disabled={blocked || !ready}>{busy ? 'Saving decision…' : 'Record decision'}</button>
      </fieldset>
    </form>}
  </section>
}