'use client'

import { useState } from 'react'
import { Copy, Landmark } from 'lucide-react'
import { saveListing } from '@/app/actions/listingActions'
import { removeUploads, resolveSessionAndUpload } from '@/lib/listing-upload'
import { useRentralStore } from '@/store/useRentralStore'

// The ₦1,000 fee flow is still simulated (no OPay keys yet) — "I've Paid" is
// where the wizard leaves the browser: media goes to Storage, then the
// saveListing server action persists the row.
const MOCK_ACCOUNT_NUMBER = '9019283746'
const MOCK_BANK_NAME = 'OPay (Paycom)'

type Phase = 'idle' | 'uploading' | 'saving'

export function CheckoutPrompt() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const goNext = useRentralStore((state) => state.goNext)
  const goBack = useRentralStore((state) => state.goBack)

  const handleConfirm = async () => {
    setError(null)

    // Snapshot everything the earlier steps collected. Media is either an
    // in-memory blob from this session or a Storage path from a saved draft;
    // a mid-wizard refresh with no draft leaves gaps we must catch here.
    const store = useRentralStore.getState()
    const { category, videoBlob, coords, metadata, address, basePrice } = store

    const hasVideo = videoBlob !== null || store.remoteVideoPath !== null
    const hasGps = coords !== null || store.hasRemoteCoords
    const hasDocument = store.documentFile !== null || store.remoteDocumentPath !== null
    if (!category || !hasVideo || !hasGps || !hasDocument) {
      setError('Your walkthrough or document was lost (page refresh?). Go back and redo that step.')
      return
    }

    setPhase('uploading')
    // Local session read is enough for path construction — the storage RLS
    // policies and saveListing's ownership check are the real gatekeepers.
    const resolved = await resolveSessionAndUpload(store.ensureMediaFolderId(), store)
    if (!resolved.ok) {
      setError(resolved.error)
      setPhase('idle')
      return
    }
    const { supabase, media } = resolved

    try {
      setPhase('saving')
      const result = await saveListing({
        category,
        draftId: store.draftListingId ?? undefined,
        metadata: metadata[category],
        address,
        basePrice,
        lat: coords?.lat,
        lng: coords?.lng,
        accuracy: coords?.accuracy,
        videoPath: media.videoPath,
        posterPath: media.posterPath ?? undefined,
        documentPath: media.documentPath,
      })

      if (!result.success) {
        await removeUploads(supabase, media.newUploads)
        setError(result.error)
        return
      }

      goNext()
    } catch {
      await removeUploads(supabase, media.newUploads)
      setError('Something went wrong while saving your listing. Please try again.')
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2">
          Activate your listing
        </h2>
        <p className="text-sm text-text-secondary">
          A small anti-spam fee keeps ghost listings off Rentral.
        </p>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-card px-6 py-6">
        <div className="flex items-center justify-between border-b border-border-subtle pb-4">
          <span className="text-sm font-medium text-text-secondary">Listing Fee</span>
          <span className="text-xl font-extrabold text-accent-hover">₦1,000</span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-glass-light">
            <Landmark className="h-4 w-4 text-text-primary" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{MOCK_BANK_NAME}</p>
            <p className="text-sm font-semibold text-text-primary">Dynamic Virtual Account</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-border-subtle bg-background-app px-4 py-3">
          <span className="text-lg font-bold tracking-widest text-text-primary">{MOCK_ACCOUNT_NUMBER}</span>
          <Copy className="h-4 w-4 text-text-muted" />
        </div>

        <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
          Expires in 30:00
        </p>
      </div>

      {error && <p className="mt-4 text-center text-xs font-semibold text-trust-flagged">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={phase !== 'idle'}
          className="flex-1 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={phase !== 'idle'}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {phase === 'uploading' ? 'Uploading walkthrough...' : phase === 'saving' ? 'Saving listing...' : "I've Paid"}
        </button>
      </div>
    </div>
  )
}
