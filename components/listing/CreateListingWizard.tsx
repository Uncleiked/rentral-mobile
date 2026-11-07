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
    <div className="mx-auto mb-10 flex w-full max-w-md items-center justify-between">
      {visibleSteps.map((s, index) => (
        <div key={s} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-1.5">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                index <= currentIndex
                  ? 'bg-accent-primary text-text-inverse'
                  : 'bg-glass-light text-text-muted'
              }`}
            >
              {index + 1}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {STEP_LABELS[s]}
            </span>
          </div>
          {index < visibleSteps.length - 1 && (
            <span
              className={`mx-2 h-px flex-1 ${index < currentIndex ? 'bg-accent-primary' : 'bg-border-subtle'}`}
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
      <h2 className="text-xl font-bold text-text-primary tracking-wide">Listing saved</h2>
      <p className="max-w-sm text-sm text-text-secondary">
        Your walkthrough, details, and documents are saved under Your Listings.
        Your listing will appear in the marketplace once verification and publication are complete.
      </p>
      <Link
        href="/marketplace/listing"
        onClick={reset}
        className="mt-2 rounded-xl bg-accent-primary px-6 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98"
      >
        View Your Listings
      </Link>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl border border-glass-border-medium bg-glass-light px-6 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
      >
        Start Another Listing
      </button>
    </div>
  )
}

export function CreateListingWizard({ draft }: { draft: DraftPayload | null }) {
  const step = useRentralStore((state) => state.step)
  const loadDraft = useRentralStore((state) => state.loadDraft)
  const reset = useRentralStore((state) => state.reset)

  // Hydrate exactly once per mount: resume the requested draft, or clear a
  // stale draft session left in the store from earlier navigation.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    if (draft) {
      loadDraft(draft)
    } else if (useRentralStore.getState().draftListingId) {
      reset()
    }
  }, [draft, loadDraft, reset])

  return (
    <div className="min-h-screen bg-background-app px-4 py-10 sm:px-6">
      <div className="mx-auto mb-7 w-full max-w-md"><Link href="/marketplace/vault" className="inline-flex min-h-11 items-center gap-2 text-xs text-text-muted transition-colors hover:text-text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Your Media Vault</Link></div>
      <WizardStepper />

      {step !== 'done' && (
        <div className="mx-auto mb-6 flex w-full max-w-md justify-end">
          <SaveDraftButton />
        </div>
      )}

      {step === 'category' && <CategorySelector />}
      {step === 'capture' && <CaptureCanvas />}
      {step === 'details' && <MetadataForm />}
      {step === 'documents' && <DocumentUploadZone />}
      {step === 'checkout' && <CheckoutPrompt />}
      {step === 'done' && <DoneScreen />}
    </div>
  )
}
