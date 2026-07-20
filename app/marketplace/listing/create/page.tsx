'use client'

import { CheckCircle2 } from 'lucide-react'
import { CategorySelector } from '@/components/listing/CategorySelector'
import { CaptureCanvas } from '@/components/listing/CaptureCanvas'
import { MetadataForm } from '@/components/listing/MetadataForm'
import { DocumentUploadZone } from '@/components/listing/DocumentUploadZone'
import { CheckoutPrompt } from '@/components/listing/CheckoutPrompt'
import { useRentralStore, WIZARD_STEPS } from '@/store/useRentralStore'

const STEP_LABELS: Record<(typeof WIZARD_STEPS)[number], string> = {
  category: 'Category',
  capture: 'Walkthrough',
  details: 'Details',
  documents: 'Documents',
  checkout: 'Activate',
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
      <h2 className="text-xl font-bold text-text-primary tracking-wide">Listing ready to publish</h2>
      <p className="max-w-sm text-sm text-text-secondary">
        Your walkthrough, details, and documents are captured. Spatial verification and payout
        wiring go live in the next build phase — nothing here has been saved yet.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-xl border border-glass-border-medium bg-glass-light px-6 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
      >
        Start Another Listing
      </button>
    </div>
  )
}

export default function CreateListingPage() {
  const step = useRentralStore((state) => state.step)

  return (
    <div className="min-h-screen bg-background-app px-4 py-10 sm:px-6">
      <WizardStepper />

      {step === 'category' && <CategorySelector />}
      {step === 'capture' && <CaptureCanvas />}
      {step === 'details' && <MetadataForm />}
      {step === 'documents' && <DocumentUploadZone />}
      {step === 'checkout' && <CheckoutPrompt />}
      {step === 'done' && <DoneScreen />}
    </div>
  )
}
