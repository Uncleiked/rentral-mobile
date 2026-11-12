'use client'

import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { resolveSessionAndUpload } from '@/lib/listing-upload'
import { useRentralStore } from '@/store/useRentralStore'
import { assertWizardCurrent, executeWebListingCommand } from '@/lib/listings/capture-client'

type Phase = 'idle' | 'uploading' | 'saving'

export function CheckoutPrompt({ actorId }: { actorId: string }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const goBack = useRentralStore((state) => state.goBack)

  const handleConfirm = async () => {
    // Snapshot everything the earlier steps collected. Media is either an
    // in-memory blob from this session or a Storage path from a saved draft;
    // a mid-wizard refresh with no draft leaves gaps we must catch here.
    const store = useRentralStore.getState()
    if (store.actorId !== actorId || store.mutationBusy || store.pendingCommand || store.capturePending || store.recoveryError) return
    const identity = { actorId, generation: store.generation, isActive: () => active.current }
    setError(null)
    const { category, videoBlob, captureId, metadata, address, basePrice } = store

    const hasVideo = videoBlob !== null || store.remoteVideoPath !== null
    const hasGps = captureId !== null
    const hasDocument = store.documentFile !== null || store.remoteDocumentPath !== null
    if (!category || !hasVideo || !hasGps || !hasDocument) {
      setError('Your walkthrough or document was lost (page refresh?). Go back and redo that step.')
      return
    }

    setPhase('uploading')
    store.setMutationBusy(true)
    try {
      const resolved = await resolveSessionAndUpload(store.ensureMediaFolderId(), store, actorId, identity.generation)
      assertWizardCurrent(identity)
      if (!resolved.ok) { setError(resolved.error); return }
      const { media } = resolved
      store.rememberUploadedMedia(media)
      setPhase('saving')
      const command = store.prepareListingCommand({ mode: 'submit', listing: {
        clientId: crypto.randomUUID(),
        captureId,
        category,
        draftId: store.draftListingId ?? undefined,
        expectedRevision: store.draftRevision ?? undefined,
        metadata: metadata[category],
        address,
        basePrice,
        videoPath: media.videoPath,
        posterPath: media.posterPath ?? undefined,
        documentPath: media.documentPath,
      } })
      await executeWebListingCommand(identity, command)
      assertWizardCurrent(identity)
      store.completeListingCommand(command.listing.clientId)
      store.setMutationBusy(false)
      store.setStep('done')
    } catch (reason) {
      if (active.current && useRentralStore.getState().actorId === actorId && useRentralStore.getState().generation === identity.generation) setError(reason instanceof Error ? reason.message : 'We could not confirm submission. Check the saved request before submitting again.')
    } finally {
      if (active.current) setPhase('idle')
      if (active.current && useRentralStore.getState().actorId === actorId && useRentralStore.getState().generation === identity.generation) store.setMutationBusy(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2 break-words">
          Submit your listing
        </h2>
        <p className="text-sm text-text-secondary">
          Your listing will appear in the marketplace after verification is complete.
        </p>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-card px-6 py-6 min-w-0 max-w-full wrap-anywhere text-text-primary">
        <div className="flex items-center justify-between border-b border-border-subtle pb-4 min-w-0 flex-wrap gap-3">
          <span className="text-sm font-medium text-text-secondary">Publication status</span>
          <span className="text-sm font-semibold text-text-primary">Pending review</span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-glass-light">
            <ShieldCheck className="h-4 w-4 text-text-primary" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">Recording location checked</p>
            <p className="mt-1 text-xs text-text-muted">Submission rechecks your address against the locked video location. Document review and the publication fee remain separate.</p>
          </div>
        </div>

      </div>

      {error && <p className="mt-4 text-center text-xs font-semibold text-trust-flagged">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={phase !== 'idle'}
          className="flex-1 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 disabled:cursor-not-allowed disabled:opacity-70 min-h-11 max-w-full whitespace-normal break-words"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={phase !== 'idle'}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-70 min-h-11 max-w-full whitespace-normal break-words"
        >
          {phase === 'uploading' ? 'Uploading walkthrough...' : phase === 'saving' ? 'Saving listing...' : 'Submit for Review'}
        </button>
      </div>
    </div>
  )
}
