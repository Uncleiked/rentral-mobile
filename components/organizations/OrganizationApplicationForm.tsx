'use client'

import Link from 'next/link'
import { accountField, accountPrimaryAction, accountSecondaryAction } from '@/components/ui/account-styles'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { CaptureRequestError, listingRequest } from '@/lib/listings/capture-client'
import { organizationMineSchema, organizationReceiptSchema, organizationSubmissionSchema, organizationUploadSchema, type OrganizationView } from '@/lib/contracts/organizations'
import { clearOrganizationPending, readOrganizationPending, saveOrganizationPending, type OrganizationPending } from '@/lib/organizations/recovery'

const field = accountField + ' mt-2'
const fileField = accountField + ' file:mr-3 file:rounded-lg file:border-0 file:bg-glass-light file:px-3 file:py-2 file:text-sm file:font-semibold file:text-text-primary'
const button = accountSecondaryAction
const card = 'min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 text-text-primary sm:p-6'
type FormState = { legalName: string; registrationType: 'company' | 'business_name' | 'llp' | 'incorporated_trustees'; registrationNumber: string; representativeName: string; representativeRole: string; documentKind: 'cac_certificate' | 'cac_status_report'; supportingKind: '' | 'authority_letter' | 'professional_licence' | 'office_address' }
const initial: FormState = { legalName: '', registrationType: 'company', registrationNumber: '', representativeName: '', representativeRole: '', documentKind: 'cac_certificate', supportingKind: '' }
type UploadRecovery = { path: string; kind: 'registration' | 'supporting' }
const uploadRecoverySchema = z.object({ path: z.string().max(500), kind: z.enum(['registration', 'supporting']) }).strict()
export function OrganizationApplicationForm({ actorId }: { actorId: string }) {
  const [application, setApplication] = useState<OrganizationView | null>(null)
  const [form, setForm] = useState<FormState>(initial)
  const [registration, setRegistration] = useState<File | null>(null)
  const [supporting, setSupporting] = useState<File | null>(null)
  const [declaration, setDeclaration] = useState(false)
  const [pending, setPending] = useState<OrganizationPending | null>(null)
  const [pendingUpload, setPendingUpload] = useState<UploadRecovery | null>(null)
  const [paths, setPaths] = useState<{ registration?: string; supporting?: string }>({})
  const [canRetry, setCanRetry] = useState(false)
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState(false)
  const mounted = useRef(true), sending = useRef(false)
  const uploadKey = 'rentral.organization.upload.' + actorId
  const load = useCallback(async () => {
    const result = await listingRequest(actorId, '/api/v1/organizations/me', organizationMineSchema)
    if (!mounted.current) return
    setApplication(result.application)
    if (result.application) setForm({ legalName: result.application.legalName, registrationType: z.enum(['company', 'business_name', 'llp', 'incorporated_trustees']).parse(result.application.registrationType),
      registrationNumber: result.application.registrationNumber, representativeName: result.application.representativeName,
      representativeRole: result.application.representativeRole, documentKind: result.application.documentKind, supportingKind: '' })
    setReady(true)
  }, [actorId])
  useEffect(() => {
    mounted.current = true
    void Promise.resolve().then(load).catch(error => { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Registration is unavailable.') })
    let current = true
    void Promise.resolve().then(() => {
      if (!current) return
      try {
        const saved = readOrganizationPending(actorId, 'submit'); setPending(saved)
        const upload = window.sessionStorage.getItem(uploadKey); if (upload) setPendingUpload(uploadRecoverySchema.parse(JSON.parse(upload)))
      } catch { setRecoveryError(true); setMessage('A saved registration instruction could not be read. Contact support before clearing browser data.') }
    })
    return () => { current = false; mounted.current = false }
  }, [actorId, load, uploadKey])
  async function run(work: () => Promise<void>): Promise<void> {
    if (sending.current) return
    sending.current = true; setBusy(true); setMessage('')
    try { await work() } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'The request could not be confirmed.') }
    finally { sending.current = false; if (mounted.current) setBusy(false) }
  }
  async function upload(file: File, kind: UploadRecovery['kind']): Promise<string> {
    const types: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
    if (!types[file.type] || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Choose a PDF, JPEG or PNG document no larger than 10 MB.')
    const saved = { kind, path: actorId + '/' + crypto.randomUUID() + '/' + kind + '.' + types[file.type] }
    window.sessionStorage.setItem(uploadKey, JSON.stringify(saved)); setPendingUpload(saved)
    let response: Response
    try { response = await fetch('/api/v1/organizations/me/documents', { method: 'POST', credentials: 'same-origin', headers: { 'X-Rentral-Account': actorId, 'X-Upload-Path': saved.path, 'Content-Type': file.type }, body: file, signal: AbortSignal.timeout(60000) }) }
    catch { throw new Error('The document upload could not be confirmed. Check the original upload before choosing another file.') }
    const envelope: unknown = await response.json()
    const success = z.object({ success: z.literal(true), data: organizationUploadSchema }).safeParse(envelope)
    if (!response.ok || !success.success || success.data.data.path !== saved.path) {
      const failure = z.object({ error: z.string().max(1000) }).safeParse(envelope)
      if (response.status >= 400 && response.status < 500) { window.sessionStorage.removeItem(uploadKey); setPendingUpload(null) }
      throw new Error(failure.success ? failure.data.error : 'The upload could not be confirmed. Check the original upload.')
    }
    window.sessionStorage.removeItem(uploadKey); setPendingUpload(null)
    setPaths(previous => ({ ...previous, [kind]: saved.path }))
    return saved.path
  }
  async function send(instruction: OrganizationPending): Promise<void> {
    if (instruction.scope !== 'submit') return
    setCanRetry(false)
    try {
      const receipt = await listingRequest(actorId, '/api/v1/organizations/me', organizationReceiptSchema, instruction.command)
      if (receipt.clientId !== instruction.command.clientId) throw new Error('The registration receipt did not match the original request.')
      clearOrganizationPending(actorId, 'submit', receipt.clientId); setPending(null)
      await load(); setMessage('Registration submitted. An administrator will review your evidence.')
    } catch (error) {
      if (error instanceof CaptureRequestError && error.status >= 400 && error.status < 500 && error.code !== 'INVALID_RESPONSE') {
        clearOrganizationPending(actorId, 'submit', instruction.command.clientId); setPending(null)
      }
      throw error
    }
  }
  async function submit(): Promise<void> {
    if (pending || pendingUpload || recoveryError || !ready) return
    if (!registration && !paths.registration) throw new Error('Choose your registration certificate or official status report.')
    if (supporting && !form.supportingKind) throw new Error('Choose a supporting document type.')
    const documentPath = paths.registration ?? await upload(registration!, 'registration')
    const supportingPath = paths.supporting ?? (supporting ? await upload(supporting, 'supporting') : undefined)
    const command = organizationSubmissionSchema.parse({ ...form, supportingKind: form.supportingKind || undefined, supportingPath,
      documentPath, declaration, clientId: crypto.randomUUID(), ...(application ? { expectedRevision: application.revision } : {}) })
    const instruction = saveOrganizationPending({ actorId, scope: 'submit', command }); setPending(instruction)
    await send(instruction)
  }
  async function check(): Promise<void> {
    if (!pending) return
    try {
      const receipt = await listingRequest(actorId, '/api/v1/organizations/me/receipts/' + pending.command.clientId, organizationReceiptSchema)
      if (receipt.clientId !== pending.command.clientId) throw new Error('The receipt did not match.')
      clearOrganizationPending(actorId, 'submit', receipt.clientId); setPending(null); setCanRetry(false); await load(); setMessage('The original registration was confirmed without sending it again.')
    } catch (error) { if (error instanceof CaptureRequestError && error.status === 404) { setCanRetry(true); setMessage('No committed receipt exists. You may resend the exact saved registration.'); return } throw error }
  }
  async function checkUpload(): Promise<void> {
    if (!pendingUpload) return
    try {
      const result = await listingRequest(actorId, '/api/v1/organizations/me/documents?path=' + encodeURIComponent(pendingUpload.path), organizationUploadSchema)
      if (result.path !== pendingUpload.path) throw new Error('The original upload could not be matched.')
      setPaths(previous => ({ ...previous, [pendingUpload.kind]: result.path })); window.sessionStorage.removeItem(uploadKey); setPendingUpload(null); setMessage('The original document upload was confirmed. Continue your registration.')
    } catch (error) {
      if (error instanceof CaptureRequestError && error.status === 404) {
        window.sessionStorage.removeItem(uploadKey); setPendingUpload(null); setMessage('No document upload was recorded. Select the original document and submit again.'); return
      }
      throw error
    }
  }
  const editable = ready && (!application || ['changes_requested', 'rejected'].includes(application.status))
  const blocked = busy || Boolean(pending) || Boolean(pendingUpload) || recoveryError
  return <div className="min-w-0 space-y-5">
    {message && <p role="status" className={card + ' break-words text-sm leading-6 text-text-secondary'}>{message}</p>}
    {!ready && <section className={card}><p className="text-sm leading-6 text-text-secondary">Loading your organization registration status.</p><button type="button" className={button + ' mt-4 w-full sm:w-auto'} disabled={busy} onClick={() => { void run(load) }}>Retry registration status</button></section>}
    {application && <section className={card}>
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-hover">{application.status.replaceAll('_', ' ')}</p>
      <h2 className="mt-2 break-words text-xl font-semibold text-text-primary">{application.legalName}</h2>
      {application.reviewReason && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{application.reviewReason}</p>}
      {application.status === 'pending' && <p className="mt-3 text-sm leading-6 text-text-secondary">Your evidence is awaiting independent review.</p>}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {application.status === 'approved' && <Link className={accountPrimaryAction + ' sm:w-auto'} href="/marketplace">Enter marketplace</Link>}
        <button type="button" className={button} disabled={busy} onClick={() => { void run(load) }}>Refresh review status</button>
      </div>
    </section>}
    {pendingUpload && <section className={card}>
      <h2 className="font-semibold text-text-primary">Confirm your original document upload</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">Your original filename is retained. This status check does not upload another copy.</p>
      <button type="button" className={button + ' mt-4 w-full sm:w-auto'} disabled={busy} onClick={() => { void run(checkUpload) }}>Check original upload</button>
    </section>}
    {pending && <section className={card}>
      <h2 className="font-semibold text-text-primary">Confirm your original registration</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">New submissions are paused until its outcome is confirmed.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button type="button" className={button} disabled={busy} onClick={() => { void run(check) }}>Check original registration</button>
        {canRetry && <button type="button" className={button} disabled={busy} onClick={() => { void run(() => send(pending)) }}>Resend exact saved registration</button>}
      </div>
    </section>}
    {editable && <form className={card} aria-busy={busy} onSubmit={event => { event.preventDefault(); void run(submit) }}>
      <fieldset disabled={blocked} className="min-w-0 space-y-6 disabled:opacity-60">
        <legend className="mb-5 text-base font-semibold text-text-primary">Registration details</legend>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          {(['legalName', 'registrationNumber', 'representativeName', 'representativeRole'] as const).map(name => <label key={name} className="block min-w-0 text-sm font-medium text-text-secondary">
            {({ legalName: 'Registered legal name', registrationNumber: 'CAC registration number', representativeName: 'Representative full name', representativeRole: 'Representative role or title' })[name]}
            <input className={field} required minLength={2} maxLength={name === 'legalName' ? 160 : name === 'registrationNumber' ? 80 : name === 'representativeRole' ? 100 : 120} value={form[name]} onChange={event => setForm(previous => ({ ...previous, [name]: event.target.value }))} />
          </label>)}
        </div>
        <label className="block min-w-0 text-sm font-medium text-text-secondary">Registration type
          <select className={field} value={form.registrationType} onChange={event => setForm(previous => ({ ...previous, registrationType: z.enum(['company', 'business_name', 'llp', 'incorporated_trustees']).parse(event.target.value) }))}>
            <option value="company">Company</option><option value="business_name">Business name</option><option value="llp">Limited liability partnership</option><option value="incorporated_trustees">Incorporated trustees</option>
          </select>
        </label>
        <div className="min-w-0 space-y-4 border-t border-border-subtle pt-6">
          <div><h2 className="font-semibold text-text-primary">Registration documents</h2><p id="registration-help" className="mt-2 text-xs leading-5 text-text-muted">One registration proof is required. PDF, JPEG or PNG; maximum 10 MB. Registration approval does not verify ownership of individual assets.</p></div>
          <label className="block min-w-0 text-sm font-medium text-text-secondary" htmlFor="document-kind">Required registration evidence</label>
          <select id="document-kind" className={accountField} value={form.documentKind} onChange={event => setForm(previous => ({ ...previous, documentKind: z.enum(['cac_certificate', 'cac_status_report']).parse(event.target.value) }))}>
            <option value="cac_certificate">CAC certificate</option><option value="cac_status_report">Official CAC status report</option>
          </select>
          <label className="block min-w-0 text-sm font-medium text-text-secondary" htmlFor="registration-document">Upload registration document</label>
          <input id="registration-document" aria-label="Registration document" aria-describedby="registration-help" className={fileField} type="file" accept="application/pdf,image/jpeg,image/png" required={!paths.registration} onChange={event => { setRegistration(event.target.files?.[0] ?? null); setPaths(previous => ({ ...previous, registration: undefined })) }} />
        </div>
        <div className="min-w-0 space-y-4 border-t border-border-subtle pt-6">
          <label className="block min-w-0 text-sm font-medium text-text-secondary" htmlFor="supporting-kind">Supporting evidence (optional)</label>
          <select id="supporting-kind" className={accountField} value={form.supportingKind} onChange={event => setForm(previous => ({ ...previous, supportingKind: z.enum(['', 'authority_letter', 'professional_licence', 'office_address']).parse(event.target.value) }))}>
            <option value="">No supporting document</option><option value="authority_letter">Representative authorization letter</option><option value="professional_licence">Relevant professional licence</option><option value="office_address">Office-address proof</option>
          </select>
          <label className="block min-w-0 text-sm font-medium text-text-secondary" htmlFor="supporting-document">Upload supporting document</label>
          <input id="supporting-document" aria-label="Supporting document" className={fileField} type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => { setSupporting(event.target.files?.[0] ?? null); setPaths(previous => ({ ...previous, supporting: undefined })) }} />
        </div>
        <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border-subtle bg-background-app p-4 text-sm leading-6 text-text-secondary">
          <input type="checkbox" checked={declaration} onChange={event => setDeclaration(event.target.checked)} required className="mt-1 size-5 shrink-0 accent-accent-primary" />
          <span className="min-w-0">I am authorized to represent this organization and confirm these registration details and documents are accurate.</span>
        </label>
        <button type="submit" className={accountPrimaryAction} disabled={blocked || !declaration}>{busy ? 'Saving registration...' : 'Submit for administrator review'}</button>
      </fieldset>
    </form>}
  </div>
}
