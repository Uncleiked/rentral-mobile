'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { listingMutationResultSchema, ownerListingDetailSchema } from '@/lib/contracts/listings'
import { assertWizardCurrent, CaptureRequestError, executeWebListingCommand, listingRequest } from '@/lib/listings/capture-client'
import { isWizardCurrent, useRentralStore } from '@/store/useRentralStore'
import type { WizardIdentity } from '@/lib/listings/wizard-recovery'

export function ListingRequestRecovery({ actorId }: { actorId: string }) {
  const pending = useRentralStore(state => state.pendingCommand)
  const checked = useRentralStore(state => state.pendingChecked)
  const recoveryError = useRentralStore(state => state.recoveryError)
  const mutationBusy = useRentralStore(state => state.mutationBusy)
  const [busy, setBusy] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const active = useRef(true)
  const router = useRouter()
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  if (!pending && !recoveryError) return null

  async function acceptResult(identity: WizardIdentity, result: { id: string; status: string }): Promise<void> {
    const command = useRentralStore.getState().pendingCommand
    if (!command) return
    const saved = await listingRequest(actorId, `/api/v1/my-listings/${result.id}`, ownerListingDetailSchema)
    assertWizardCurrent(identity)
    if (saved.id !== result.id || command.listing.draftId && saved.id !== command.listing.draftId) throw new CaptureRequestError('The saved listing result belongs to another draft.', 200, 'INVALID_RESPONSE')
    const store = useRentralStore.getState()
    store.completeListingCommand(command.listing.clientId)
    store.setMutationBusy(false)
    if (saved.status === 'draft' && !saved.archivedAt && saved.actions.resume) {
      store.loadDraft({ ...saved, wizardStep: saved.wizardStep })
      router.replace(`/marketplace/listing/create?draft=${encodeURIComponent(saved.id)}`)
    } else store.setStep('done')
    toast.success('The original listing request is confirmed. No new request was created.')
  }
  async function recover(retry: boolean): Promise<void> {
    const store = useRentralStore.getState(), command = store.pendingCommand
    if (busy || store.mutationBusy || !command || store.actorId !== actorId || retry && !store.pendingChecked) return
    const identity = { actorId, generation: store.generation, isActive: () => active.current }
    setBusy(true); setMessage(null); store.setMutationBusy(true)
    try {
      const result = retry ? await executeWebListingCommand(identity, command, true)
        : await listingRequest(actorId, `/api/v1/my-listings/requests/${command.listing.clientId}?mode=${command.mode}`, listingMutationResultSchema)
      assertWizardCurrent(identity)
      await acceptResult(identity, result)
    } catch (reason) {
      if (active.current && isWizardCurrent(actorId, identity.generation)) {
        if (!retry && reason instanceof CaptureRequestError && reason.status === 404 && reason.code === 'REQUEST_NOT_FOUND') {
          store.markPendingChecked(command.listing.clientId)
          setMessage('No committed result was found. You may explicitly retry the original saved instructions and request identifier. Video binding is checked first.')
        } else setMessage(reason instanceof Error ? reason.message : 'The saved result remains unconfirmed. Keep this recovery and check again.')
      }
    } finally {
      if (active.current) setBusy(false)
      if (active.current && isWizardCurrent(actorId, identity.generation)) store.setMutationBusy(false)
    }
  }
  return <section aria-label="Saved listing request recovery" className="mx-auto mb-6 flex w-full max-w-md flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-card p-5">
    <h2 className="text-lg font-semibold text-text-primary">Confirm the saved listing request</h2>
    <p className="text-sm text-text-secondary">The original instructions are kept for this account across page reloads. Check their result before editing, recording again or sending a different request.</p>
    {pending ? <><p className="break-words text-xs text-text-muted">Request: {pending.listing.clientId}</p><p className="break-words text-sm text-text-secondary">{pending.mode === 'draft' ? 'Save draft' : 'Submit for review'} · {pending.listing.address || 'Address not entered'}</p>
      <button type="button" disabled={busy || mutationBusy} onClick={() => { void recover(false) }} className="min-h-11 rounded-xl bg-accent-primary px-4 py-3 text-sm font-semibold text-text-inverse disabled:opacity-40">Check original request result</button>
      {checked ? <button type="button" disabled={busy || mutationBusy} onClick={() => { void recover(true) }} className="min-h-11 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-sm text-text-primary disabled:opacity-40">Retry exact saved request</button> : null}</> : null}
    {recoveryError || message ? <p role="status" className="break-words text-sm text-trust-flagged">{recoveryError ?? message}</p> : null}
    <Link href="/marketplace/listing" target="_blank" rel="noopener" className="min-h-11 py-2 text-sm text-accent-primary underline">Review Your Listings in another tab</Link>
    <label className="flex items-start gap-3 text-xs text-text-muted"><input type="checkbox" checked={reviewed} disabled={busy || mutationBusy} onChange={event => setReviewed(event.target.checked)} className="mt-1" />I reviewed Your Listings and understand that clearing browser recovery does not cancel server requests or delete saved evidence.</label>
    <button type="button" disabled={!reviewed || busy || mutationBusy} onClick={() => { try { useRentralStore.getState().discardRecoveryAfterReview(); setReviewed(false); setMessage(null) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Recovery could not be cleared.') } }} className="min-h-11 rounded-xl border border-border-subtle px-4 py-3 text-xs text-text-secondary disabled:opacity-40">Clear reviewed browser recovery</button>
  </section>
}
