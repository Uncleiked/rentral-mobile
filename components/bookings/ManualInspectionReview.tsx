'use client'

import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { manualInspectionRequestSchema, manualInspectionSchema, type ManualInspection } from '@/lib/contracts/admin'
import { CaptureRequestError, listingRequest } from '@/lib/listings/capture-client'

const savedSchema = manualInspectionRequestSchema.extend({ actorId: z.uuid(), bookingId: z.uuid() }).strict()
const button = 'min-h-11 rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold disabled:opacity-50'

export function ManualInspectionReview({ actorId, bookingId }: { actorId: string; bookingId: string }) {
  const [data, setData] = useState<ManualInspection | null>(null)
  const [evidence, setEvidence] = useState('')
  const [pending, setPending] = useState<z.infer<typeof manualInspectionRequestSchema> | null>(null)
  const [retry, setRetry] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [recoveryError, setRecoveryError] = useState(false)
  const [message, setMessage] = useState('')
  const active = useRef(true)
  const sending = useRef(false)
  const endpoint = `/api/v1/bookings/${bookingId}/manual-inspection`
  const storageKey = `rentral.manual-inspection.${actorId}.${bookingId}`
  useEffect(() => {
    let current = true; active.current = true
    void Promise.resolve().then(async () => {
      if (!current) return
      try {
        const raw = window.sessionStorage.getItem(storageKey)
        if (raw) {
          if (raw.length > 10000) throw new Error('Invalid saved request')
          const saved = savedSchema.parse(JSON.parse(raw))
          if (saved.actorId !== actorId || saved.bookingId !== bookingId) throw new Error('Wrong request scope')
          setPending({ clientId: saved.clientId, evidence: saved.evidence })
        }
      } catch { setRecoveryError(true); setMessage('A saved inspection request needs review before another can be sent.') }
      try { const result = await listingRequest(actorId, endpoint, manualInspectionSchema); if (current) setData(result) }
      catch (error) { if (current) setMessage(error instanceof Error ? error.message : 'Inspection review details could not load.') }
      finally { if (current) setReady(true) }
    })
    return () => { current = false; active.current = false }
  }, [actorId, bookingId, endpoint, storageKey])
  async function run(task: () => Promise<void>): Promise<void> {
    if (sending.current) return
    sending.current = true; setBusy(true); setMessage('')
    try { await task() } catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : 'The result is unconfirmed. Check the original request before retrying.') }
    finally { sending.current = false; if (active.current) setBusy(false) }
  }
  function clear(clientId: string): void {
    const raw = window.sessionStorage.getItem(storageKey)
    if (raw && savedSchema.parse(JSON.parse(raw)).clientId !== clientId) throw new Error('The saved request changed. Reopen its status.')
    window.sessionStorage.removeItem(storageKey)
    if (active.current) { setPending(null); setRetry(false) }
  }
  async function send(body: z.infer<typeof manualInspectionRequestSchema>): Promise<void> {
    if (active.current) setRetry(false)
    try {
      const result = await listingRequest(actorId, endpoint, manualInspectionSchema, body)
      if (result.bookingId !== bookingId) throw new Error('The response belongs to another inspection.')
      clear(body.clientId)
      if (active.current) { setData(result); setEvidence(''); setMessage('Your evidence is awaiting an independent admin decision. No payout was sent.') }
    } catch (error) {
      if (error instanceof CaptureRequestError && error.status >= 400 && error.status < 500 && error.code !== 'INVALID_RESPONSE') clear(body.clientId)
      throw error
    }
  }
  async function submit(): Promise<void> {
    if (!ready || pending || recoveryError || !data?.eligible) return
    const body = manualInspectionRequestSchema.parse({ clientId: crypto.randomUUID(), evidence })
    window.sessionStorage.setItem(storageKey, JSON.stringify(savedSchema.parse({ ...body, actorId, bookingId })))
    setPending(body); setRetry(false)
    await send(body)
  }
  async function check(): Promise<void> {
    if (!pending) return
    try {
      const result = await listingRequest(actorId, `${endpoint}?clientId=${pending.clientId}`, manualInspectionSchema)
      if (result.bookingId !== bookingId) throw new Error('This recovered result belongs to another inspection.')
      clear(pending.clientId)
      if (active.current) { setData(result); setMessage('Your original evidence request was recorded. It was not sent again.') }
    } catch (error) {
      if (error instanceof CaptureRequestError && error.status === 404) { if (active.current) { setRetry(true); setMessage('No receipt exists for this request. You may explicitly resend the exact original evidence.') } return }
      throw error
    }
  }
  return <section className="min-w-0 space-y-4 border-t border-border-subtle pt-5" aria-label="Manual inspection review"><h3 className="font-semibold">Manual inspection review</h3><p className="text-sm leading-6 text-text-muted">This listing uses approved gallery media and has no recorded GPS lock. Describe the visit for an independent administrator to review. A manual decision does not create location proof or send a payout.</p>
    {!ready && <p role="status" className="text-sm text-text-muted">Loading inspection evidence…</p>}
    {data && <div className="text-sm leading-6 text-text-secondary"><p>Status: {data.status ?? 'not submitted'}</p>{data.evidence && <p className="mt-2 whitespace-pre-wrap break-words">{data.evidence}</p>}{data.reviewReason && <p className="mt-2 whitespace-pre-wrap break-words">Admin decision: {data.reviewReason}</p>}</div>}
    {pending ? <div className="space-y-3"><p className="text-xs text-text-muted">An original evidence request is still unconfirmed.</p><button className={button} disabled={busy} onClick={() => { void run(check) }}>Check original evidence request</button>{retry && <button className={button} disabled={busy} onClick={() => { void run(() => send(pending)) }}>Resend exact saved evidence</button>}</div>
      : data?.eligible && !recoveryError ? <form className="space-y-3 min-w-0 max-w-full" onSubmit={event => { event.preventDefault(); void run(submit) }}><label className="block text-xs text-text-muted min-w-0 max-w-full">What happened at the inspection?<textarea required minLength={30} maxLength={2000} rows={4} value={evidence} onChange={event => setEvidence(event.target.value)} disabled={busy} className="mt-2 w-full min-w-0 rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary min-h-11 max-w-full" /></label><button className={button} disabled={busy}>Submit inspection evidence</button></form>
        : ready && !data?.status && <p className="text-xs leading-5 text-text-muted">Evidence can be submitted around the time of a confirmed gallery inspection.</p>}
    <button className={button} disabled={busy} onClick={() => { void run(async () => { const result = await listingRequest(actorId, endpoint, manualInspectionSchema); if (active.current) setData(result) }) }}>Refresh review status</button>
    {message && <p role="status" className="whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{message}</p>}
  </section>
}
