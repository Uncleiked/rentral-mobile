'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { CategorySelector } from '@/components/listing/CategorySelector'
import { CaptureCanvas } from '@/components/listing/CaptureCanvas'
import { MetadataForm } from '@/components/listing/MetadataForm'
import { DocumentUploadZone } from '@/components/listing/DocumentUploadZone'
import { CheckoutPrompt } from '@/components/listing/CheckoutPrompt'
import { SaveDraftButton } from '@/components/listing/SaveDraftButton'
import { ListingRequestRecovery } from '@/components/listing/ListingRequestRecovery'
import { useRentralStore, WIZARD_STEPS, type DraftPayload } from '@/store/useRentralStore'

const STEP_LABELS: Record<(typeof WIZARD_STEPS)[number], string> = {
  category: 'Category',
  capture: 'Walkthrough',
  details: 'Details',
  documents: 'Documents',
  checkout: 'Review',
  done: 'Done',
}

function WizardStepper() {
  const step = useRentralStore((state) => state.step)
  const visibleSteps = WIZARD_STEPS.filter((s) => s !== 'done')
  const currentIndex = step === 'done' ? visibleSteps.length : visibleSteps.indexOf(step)

  return (
    <div className="mx-auto mb-10 grid w-full max-w-md grid-cols-5 gap-1">
      {visibleSteps.map((s, index) => (
        <div key={s} className="relative flex min-w-0 justify-center">
          <div className="flex min-w-0 max-w-full flex-col items-center gap-1.5">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                index <= currentIndex
                  ? 'bg-accent-primary text-text-inverse'
                  : 'bg-glass-light text-text-muted'
              }`}
            >
              {index + 1}
            </span>
            <span className="min-h-6 w-full wrap-anywhere text-center text-[9px] leading-tight font-medium uppercase tracking-normal text-text-muted sm:text-[10px]">
              {STEP_LABELS[s]}
            </span>
          </div>
          {index < visibleSteps.length - 1 && (
            <span
              className={`absolute top-3.5 left-[calc(50%+16px)] h-px w-[calc(100%-32px)] ${index < currentIndex ? 'bg-accent-primary' : 'bg-border-subtle'}`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function DoneScreen() {
  const reset = useRentralStore((state) => state.reset)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-muted">
        <CheckCircle2 className="h-8 w-8 text-accent-hover" />
      </span>
      <h2 className="text-xl font-bold text-text-primary tracking-wide break-words">Listing saved</h2>
      <p className="max-w-sm text-sm text-text-secondary">
        Your walkthrough, details, and documents are saved under Your Listings.
        Your listing will appear in the marketplace once verification and publication are complete.
      </p>
      <Link
        href="/marketplace/listing"
        onClick={reset}
        className="mt-2 rounded-xl bg-accent-primary px-6 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 min-h-11 max-w-full break-words inline-flex items-center"
      >
        View Your Listings
      </Link>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl border border-glass-border-medium bg-glass-light px-6 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 min-h-11 max-w-full whitespace-normal break-words"
      >
        Start Another Listing
      </button>
    </div>
  )
}

export function CreateListingWizard({ draft, actorId, directPublishAllowed = false, freePostingAllowed = false }: { draft: DraftPayload | null; actorId: string; directPublishAllowed?: boolean; freePostingAllowed?: boolean }) {
  const step = useRentralStore((state) => state.step)
  const category = useRentralStore(state => state.category)
  const capture = useRentralStore(state => state.capture)
  const storedActor = useRentralStore((state) => state.actorId)
  const generation = useRentralStore(state => state.generation)
  const mutationBusy = useRentralStore((state) => state.mutationBusy)
  const pendingCommand = useRentralStore(state => state.pendingCommand)
  const capturePending = useRentralStore(state => state.capturePending)
  const recoveryError = useRentralStore(state => state.recoveryError)
  const loadDraft = useRentralStore((state) => state.loadDraft)
  const reset = useRentralStore((state) => state.reset)

  // Hydrate exactly once per mount: resume the requested draft, or clear a
  // stale draft session left in the store from earlier navigation.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    useRentralStore.getState().setActorId(actorId)
    useRentralStore.getState().advanceGeneration()
    const current = useRentralStore.getState()
    if (current.pendingCommand || current.capturePending || current.recoveryError) return
    if (draft) {
      loadDraft(draft)
    } else if (useRentralStore.getState().draftListingId) {
      reset()
    }
  }, [draft, loadDraft, reset, actorId])

  if (storedActor !== actorId) return <p role="status" className="px-4 py-10 text-sm text-text-muted">Opening your listing draft…</p>

  return (
    <div className="min-h-screen bg-background-app px-4 py-10 sm:px-6">
      <div className="mx-auto mb-7 w-full max-w-md"><Link href="/marketplace/vault" aria-disabled={mutationBusy || Boolean(pendingCommand || capturePending)} onClick={event => { if (mutationBusy || pendingCommand || capturePending) event.preventDefault() }} className="inline-flex min-h-11 items-center gap-2 text-xs text-text-muted transition-colors hover:text-text-primary max-w-full break-words"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Your Media Vault</Link></div>
      <WizardStepper />
      <ListingRequestRecovery actorId={actorId} />

      <fieldset disabled={mutationBusy || Boolean(pendingCommand || recoveryError)} aria-busy={mutationBusy}>
      {step !== 'done' && (
        <div className="mx-auto mb-6 flex w-full max-w-md flex-col gap-2 rounded-2xl border border-border-subtle bg-surface-card p-4">
          <p className="text-xs leading-5 text-text-secondary">{!category ? 'Choose an asset type to enable saving. Incomplete listings can be saved at every step.' : capture.isRecording || (capture.hasStarted && !capture.isComplete) ? 'Finish or stop your current recording before saving. Your other details are kept.' : 'You can save now and add missing media, details or documents later. Drafts stay private.'}</p>
          <SaveDraftButton actorId={actorId} />
        </div>
      )}

      {step === 'category' && <CategorySelector />}
      {step === 'capture' && <CaptureCanvas actorId={actorId} />}
      {step === 'details' && <MetadataForm key={`${actorId}:${generation}`} actorId={actorId} />}
      {step === 'documents' && <DocumentUploadZone />}
      {step === 'checkout' && <CheckoutPrompt actorId={actorId} directPublishAllowed={directPublishAllowed} freePostingAllowed={freePostingAllowed} />}
      {step === 'done' && <DoneScreen />}
      </fieldset>
    </div>
  )
}
