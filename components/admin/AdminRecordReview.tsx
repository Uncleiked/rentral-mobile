'use client'

import { Check, Circle, FileText, ShieldAlert, X } from 'lucide-react'
import { AdminToggle } from './AdminToggle'
import { AdminMediaPreview } from './AdminMediaPreview'
import { decisionsFor, type AdminSelection } from './admin-view'

const field = 'mt-2 block w-full min-w-0 rounded-xl border border-border-subtle bg-background-app p-3 text-base text-text-primary sm:text-sm focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold transition-colors hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:cursor-not-allowed disabled:opacity-50'

type Props = {
  selection: AdminSelection; actorId: string; owner: boolean; permissions: readonly string[]; blocked: boolean; busy: boolean
  operation: string; setOperation: (value: string) => void; role: string; setRole: (value: string) => void
  reason: string; setReason: (value: string) => void; override: boolean; setOverride: (value: boolean) => void
  galleryAllowed: boolean; setGalleryAllowed: (value: boolean) => void
  freePostingAllowed: boolean; setFreePostingAllowed: (value: boolean) => void
  directPublishAllowed: boolean; setDirectPublishAllowed: (value: boolean) => void
  onViewListings?: () => void
  privateDocument: { id: string; url: string; expiresAt: string } | null; openedDocument: string | null
  onPrepareDocument: () => void; onOpenDocument: () => void; onSubmit: () => void; onClose: () => void
}

export function AdminRecordReview(props: Props) {
  const { selection, actorId, owner, permissions, blocked, busy, operation, setOperation, role, setRole, reason, setReason,
    override, setOverride, galleryAllowed, setGalleryAllowed, freePostingAllowed, setFreePostingAllowed, directPublishAllowed, setDirectPublishAllowed, onViewListings, privateDocument, openedDocument, onPrepareDocument, onOpenDocument, onSubmit, onClose } = props
  const actions = decisionsFor(selection, permissions, actorId, owner)
  const selfListing = selection.kind === 'listing' && selection.value.lister.id === actorId
  const permissionDecision = ['set_gallery_permission', 'set_free_posting_permission', 'set_direct_publish_permission'].includes(operation)
  const selfPermission = selection.kind === 'user' && selection.value.id === actorId && permissionDecision
  const needsOverride = selfListing || selfPermission
  const minReason = needsOverride || operation === 'transfer_ownership' || selection.kind === 'inspection' ? 30 : 15
  const destructive = ['suspend_listing', 'reject_document', 'suspend_user', 'transfer_ownership'].includes(operation) || operation === 'set_gallery_permission' && !galleryAllowed || operation === 'set_free_posting_permission' && !freePostingAllowed || operation === 'set_direct_publish_permission' && !directPublishAllowed
  const noPermissionChange = selection.kind === 'user' && (operation === 'set_gallery_permission' && galleryAllowed === selection.value.galleryAllowed || operation === 'set_free_posting_permission' && freePostingAllowed === selection.value.freePostingAllowed || operation === 'set_direct_publish_permission' && directPublishAllowed === selection.value.directPublishAllowed)
  const publicationIssues = selection.kind === 'listing' ? [
    ...(!['pending_verification', 'suspended'].includes(selection.value.status) || selection.value.archived ? ['Choose a submitted, unarchived listing.'] : []),
    ...(!selection.value.document.present ? ['An ownership or listing-authority document is required.'] : !selection.value.document.approvalMatches ? ['Review and approve the exact current authority document.'] : []),
    ...(!(selection.value.media.hasVideo || selection.value.media.photoCount > 0) ? ['The listing needs available photos or a video.'] : []),
    ...(selection.value.media.hasVideo && selection.value.media.status !== 'ready' ? ['The current video must finish processing.'] : []),
    ...(selection.value.source === 'recorded' && selection.value.locationStatus !== 'matched' ? ['The recorded walkthrough location must match the listing.'] : []),
    ...(!selection.value.fee.waived && !selection.value.fee.paid ? ['Confirm payment or waive this listing fee.'] : []),
  ] : []
  const ready = actions.some(action => action.value === operation) && reason.trim().length >= minReason && (!needsOverride || owner && override) && !noPermissionChange &&
    !(selection.kind === 'listing' && operation === 'publish' && publicationIssues.length > 0) &&
    !(selection.kind === 'listing' && operation === 'approve_document' && openedDocument !== selection.value.id)
  const title = selection.kind === 'listing' ? selection.value.title : selection.kind === 'user' ? selection.value.email : 'Manual inspection review'
  const checks = selection.kind === 'listing' ? [
    { label: 'Authority document', detail: selection.value.document.approvalMatches ? 'Current file approved' : selection.value.document.status.replaceAll('_', ' '), passed: selection.value.document.approvalMatches },
    { label: 'Media', detail: `${selection.value.media.photoCount} photos${selection.value.media.hasVideo ? ` / video ${selection.value.media.status ?? 'not processed'}` : ''}`, passed: selection.value.source === 'approved_gallery' ? (selection.value.media.photoCount > 0 || selection.value.media.hasVideo) && (!selection.value.media.hasVideo || selection.value.media.status === 'ready') : selection.value.media.status === 'ready' },
    { label: 'Recording location', detail: selection.value.source === 'approved_gallery' ? 'Unverified - approved gallery exception' : selection.value.locationStatus ?? 'Not verified', passed: selection.value.source !== 'approved_gallery' && selection.value.locationStatus === 'matched' },
    { label: 'Publication fee', detail: selection.value.fee.waived ? 'Waived by admin' : selection.value.fee.paid ? 'Verified payment' : 'Not paid', passed: selection.value.fee.waived || selection.value.fee.paid },
  ] : []

  return <section id="admin-selected-record" tabIndex={-1} className="min-w-0 scroll-mt-6 rounded-2xl border border-border-subtle bg-surface-card p-5 focus:outline-none sm:p-6 max-w-full wrap-anywhere text-text-primary" aria-label="Selected record">
    <header className="flex items-start justify-between gap-3 min-w-0 flex-wrap"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-widest text-accent-hover">{selection.kind === 'user' ? 'Member access' : selection.kind === 'listing' ? 'Listing review' : 'Independent evidence review'}</p><h2 className="mt-2 break-words text-lg font-semibold text-text-primary">{title}</h2><p className="mt-2 break-all text-xs text-text-muted">{selection.value.id}</p></div><button type="button" aria-label="Close record" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle text-text-muted hover:bg-glass-light focus-visible:outline-2 focus-visible:outline-accent-primary disabled:opacity-50 min-h-11 max-w-full whitespace-normal break-words" disabled={busy} onClick={onClose}><X className="size-4" /></button></header>
    {selection.kind === 'listing' && <>
      <p className="mt-4 break-words text-sm leading-6 text-text-secondary">{selection.value.address || 'No address supplied'}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-border-subtle px-3 py-1.5">{selection.value.status.replaceAll('_', ' ')}</span><span className="rounded-full border border-border-subtle px-3 py-1.5">{selection.value.publicationMode === 'trusted_publisher' ? selection.value.status === 'active' ? 'Direct publication permission used' : 'Direct publisher - awaiting completion' : 'Manual review workflow'}</span></div>
      <dl className="mt-5 divide-y divide-border-subtle rounded-xl border border-border-subtle bg-background-app px-4">{checks.map(check => <div key={check.label} className="flex gap-3 py-3">{check.passed ? <Check className="mt-1 size-4 shrink-0 text-accent-hover" /> : <Circle className="mt-1 size-4 shrink-0 text-text-muted" />}<div className="min-w-0"><dt className="text-xs text-text-muted">{check.label}</dt><dd className="mt-1 break-words text-sm text-text-secondary">{check.detail}</dd></div></div>)}</dl>
      <AdminMediaPreview key={selection.value.id} actorId={actorId} listingId={selection.value.id} title={selection.value.title} disabled={blocked} />
      {selection.value.document.present && <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className={button} disabled={blocked} onClick={onPrepareDocument}><FileText className="mr-2 size-4" />Prepare private document</button>{privateDocument?.id === selection.value.id && <a className={button} href={privateDocument.url} target="_blank" rel="noreferrer" onClick={onOpenDocument}>Open current document ↗</a>}</div>}
      {operation === 'approve_document' && openedDocument !== selection.value.id && <p className="mt-3 text-xs leading-5 text-text-muted">Prepare and open the current private document before approving it.</p>}
      <p className="mt-3 text-xs leading-5 text-text-muted">Manual review is the default. Direct-posting permission is a separate exception and does not independently verify documents. Gallery media has no recording GPS proof. A fee waiver changes no payment history.</p>
    </>}
    {selection.kind === 'user' && <>
      <dl className="mt-5 grid min-w-0 gap-4 rounded-xl border border-border-subtle bg-background-app p-4 sm:grid-cols-2">
        <div><dt className="text-xs text-text-muted">Current role</dt><dd className="mt-1 text-sm capitalize text-text-secondary">{selection.value.role}</dd></div>
        <div><dt className="text-xs text-text-muted">Account</dt><dd className="mt-1 text-sm text-text-secondary">{selection.value.closed ? 'Closed' : selection.value.suspended ? 'Suspended' : 'Active'}</dd></div>
        <div><dt className="text-xs text-text-muted">Gallery uploads</dt><dd className="mt-1 text-sm text-text-secondary">{selection.value.galleryAllowed ? 'Allowed' : 'Not allowed'}</dd></div>
        <div><dt className="text-xs text-text-muted">Free listing posts</dt><dd className="mt-1 text-sm text-text-secondary">{selection.value.freePostingAllowed ? 'Allowed' : 'Normal publication fee'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-text-muted">Direct publication</dt><dd className="mt-1 text-sm text-text-secondary">{selection.value.directPublishAllowed ? 'Allowed for complete submissions' : 'Administrator review required'}</dd></div>
      </dl>
      {onViewListings && <button type="button" className={button + ' mt-4 w-full sm:w-auto'} disabled={blocked} onClick={onViewListings}>View this member&apos;s listings</button>}
      <p className="mt-3 text-xs leading-5 text-text-muted">These permissions are independent. Gallery access does not waive fees or skip publication review. Direct publication does not mark an authority document as independently verified.</p>
      {selection.value.role === 'owner' && selection.value.id !== actorId && <p className="mt-4 text-sm leading-6 text-text-muted">The platform owner is protected from ordinary account and role changes.</p>}
      {selection.value.closed && <p className="mt-4 text-sm leading-6 text-text-muted">Closed accounts cannot receive new administrative privileges.</p>}
    </>}
    {selection.kind === 'inspection' && <><p className="mt-5 whitespace-pre-wrap break-words rounded-xl border border-border-subtle bg-background-app p-4 text-sm leading-6 text-text-secondary">{selection.value.evidence}</p><p className="mt-3 text-xs leading-5 text-text-muted">This records independently reviewed evidence, not GPS presence or a payout. Neither participant may approve their own inspection.</p></>}
    {!actions.length ? <p className="mt-5 rounded-xl border border-border-subtle p-4 text-sm leading-6 text-text-muted">No decisions are available for this account with your current permissions.</p> : <form className="mt-6 border-t border-border-subtle pt-5 min-w-0 max-w-full" onSubmit={event => { event.preventDefault(); if (ready && !blocked) onSubmit() }}>
      <fieldset disabled={blocked} className="min-w-0 space-y-4 max-w-full"><legend className="mb-4 text-sm font-semibold text-text-primary">Record a decision</legend>
        {selection.kind === 'listing' && <div className="space-y-3"><p className="text-xs leading-5 text-text-muted">Prepare a next step, then add your reason and record the decision below.</p><div className="flex flex-wrap gap-2">
          {actions.some(action => action.value === 'approve_document') && selection.value.document.present && <button type="button" className={button} aria-pressed={operation === 'approve_document'} onClick={() => setOperation('approve_document')}>Review document approval</button>}
          {actions.some(action => action.value === 'waive_fee') && !selection.value.fee.waived && !selection.value.fee.paid && <button type="button" className={button} aria-pressed={operation === 'waive_fee'} onClick={() => setOperation('waive_fee')}>Waive this listing fee</button>}
          {actions.some(action => action.value === 'publish') && <button type="button" className={button} aria-pressed={operation === 'publish'} onClick={() => setOperation('publish')}>Prepare publication</button>}
        </div></div>}
        {selection.kind === 'user' && actions.some(action => ['set_gallery_permission', 'set_free_posting_permission', 'set_direct_publish_permission'].includes(action.value)) && <div className="grid min-w-0 gap-2 sm:grid-cols-3" aria-label="Posting permission decisions">
          {actions.filter(action => ['set_gallery_permission', 'set_free_posting_permission', 'set_direct_publish_permission'].includes(action.value)).map(action => <button key={action.value} type="button" aria-pressed={operation === action.value} className={button + ' ' + (operation === action.value ? 'border-accent-primary bg-accent-muted' : '')} onClick={() => setOperation(action.value)}>{action.value === 'set_gallery_permission' ? 'Gallery uploads' : action.value === 'set_free_posting_permission' ? 'Free posting' : 'Direct publication'}</button>)}
        </div>}
        <label className="block text-xs font-medium text-text-muted min-w-0 max-w-full">Decision<select className={field} value={operation} onChange={event => setOperation(event.target.value)}>{actions.map(action => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
        {selection.kind === 'user' && operation === 'set_gallery_permission' && <>
          <AdminToggle label="Allow gallery uploads" checked={galleryAllowed} disabled={blocked} onChange={setGalleryAllowed} description="Allow this member to create listings from selected photos and videos. This does not verify their recording location." />
          <p className="text-xs leading-5 text-text-muted">{noPermissionChange ? 'Change the switch, add a reason, then save. The switch alone does not change permission.' : galleryAllowed ? 'Pending decision: allow gallery uploads. Save below to apply it.' : 'Pending decision: revoke gallery uploads. Existing gallery listings will leave discovery pending review.'}</p>
        </>}
        {selection.kind === 'user' && operation === 'set_free_posting_permission' && <>
          <AdminToggle label="Allow free listing posts" checked={freePostingAllowed} disabled={blocked} onChange={setFreePostingAllowed} description="Waive the publication fee for new submissions from this account. This does not mark any payment as paid." />
          <p className="text-xs leading-5 text-text-muted">{noPermissionChange ? 'Change the switch, add a reason, then record the decision.' : freePostingAllowed ? 'Pending decision: allow new listings without a publication fee.' : 'Pending decision: require the normal publication fee for new listings.'} Existing listing waivers retain their own audit record.</p>
        </>}
        {selection.kind === 'user' && operation === 'set_direct_publish_permission' && <>
          <AdminToggle label="Allow direct publication" checked={directPublishAllowed} disabled={blocked} onChange={setDirectPublishAllowed} description="Skip manual publication review for complete listings. Ownership-document presence, media, account and payment requirements still apply." />
          <p className="text-xs leading-5 text-text-muted">{noPermissionChange ? 'Change the switch, add a reason, then record the decision.' : directPublishAllowed ? 'Pending decision: allow this account to publish complete submissions directly.' : 'Pending decision: require administrator review for future submissions.'} This is separate from gallery uploads and free posting.</p>
        </>}
        {selection.kind === 'listing' && operation === 'waive_fee' && <p className="rounded-xl border border-glass-border-success bg-accent-muted p-4 text-sm leading-6 text-text-secondary">This makes this listing eligible for publication without a publication payment. It does not refund an existing payment or change the host&apos;s other listings.</p>}
        {selection.kind === 'listing' && operation === 'publish' && <div className="rounded-xl border border-border-subtle bg-background-app p-4"><h3 className="text-sm font-semibold">{publicationIssues.length ? 'Complete these checks before publication' : 'Visible publication checks are complete'}</h3>{publicationIssues.length ? <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-text-secondary">{publicationIssues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p className="mt-2 text-xs leading-5 text-text-muted">The server checks the latest permissions, evidence, availability and payment state again when you record this decision.</p>}</div>}
        {selection.kind === 'user' && operation === 'change_role' && <label className="block text-xs font-medium text-text-muted min-w-0 max-w-full">Staff role<select value={role} onChange={event => setRole(event.target.value)} className={field}>{['member', 'moderator', 'finance', 'analyst', 'admin'].map(value => <option value={value} key={value}>{value}</option>)}</select></label>}
        {needsOverride && owner && <label className="flex items-start gap-3 rounded-xl border border-glass-border-warning bg-glass-warning p-4 text-sm leading-6 text-text-secondary min-w-0 max-w-full"><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)} className="mt-1 size-5 shrink-0 accent-accent-primary" /><span>{selfPermission ? 'I am deciding my own posting permission as the platform owner. This will be recorded.' : 'I am using an owner override to review my own listing. This will be recorded.'}<span className="mt-1 block text-xs text-text-muted">A detailed reason of at least 30 characters is required.</span></span></label>}
        {needsOverride && !owner && <p className="text-sm leading-6 text-text-muted">Another eligible administrator must review your own record.</p>}
        {destructive && <p className="flex gap-2 rounded-xl border border-glass-border-warning bg-glass-warning p-3 text-xs leading-5 text-text-secondary"><ShieldAlert className="mt-0.5 size-4 shrink-0" />{operation === 'transfer_ownership' ? 'This transfers platform ownership to the selected account and changes your role to admin. Review the account carefully.' : 'This decision can remove access or public visibility. Review the selected record and reason before saving.'}</p>}
        <label className="block text-xs font-medium text-text-muted min-w-0 max-w-full">Reason for this decision<textarea required minLength={minReason} maxLength={2000} rows={4} className={field} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain what you checked and why this decision is appropriate." /></label>
        <p className="flex flex-wrap justify-between gap-2 text-xs text-text-muted min-w-0"><span>At least {minReason} characters. Saved to the audit trail.</span><span>{reason.trim().length}/2000</span></p>
        <button className={`${button} w-full bg-accent-primary text-text-inverse hover:bg-accent-hover sm:w-auto`} disabled={blocked || !ready}>{busy ? 'Saving decision…' : 'Record decision'}</button>
      </fieldset>
    </form>}
  </section>
}