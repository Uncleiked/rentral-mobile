'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { saveListing } from '@/app/actions/listingActions'
import { removeUploads, resolveSessionAndUpload } from '@/lib/listing-upload'
import { useRentralStore } from '@/store/useRentralStore'

type Phase = 'idle' | 'uploading' | 'saving'

export function CheckoutPrompt() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
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
        if (result.uncertain) setUncertain(true)
        else await removeUploads(supabase, media.newUploads)
        setError(result.error)
        return
      }

      goNext()
    } catch {
      // The server may have committed before the connection failed.
      setUncertain(true)
      setError('We could not confirm submission. Check Your Listings before submitting again.')
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2">
          Submit your listing
        </h2>
        <p className="text-sm text-text-secondary">
          Your listing will appear in the marketplace after verification is complete.
        </p>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-surface-card px-6 py-6">
        <div className="flex items-center justify-between border-b border-border-subtle pb-4">
          <span className="text-sm font-medium text-text-secondary">Publication status</span>
          <span className="text-sm font-semibold text-text-primary">Pending review</span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-glass-light">
            <ShieldCheck className="h-4 w-4 text-text-primary" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">No payment collected</p>
            <p className="mt-1 text-xs text-text-muted">Payments are not available yet.</p>
          </div>
        </div>

      </div>

      {error && <p className="mt-4 text-center text-xs font-semibold text-trust-flagged">{error}</p>}
      {uncertain && <Link href="/marketplace/listing" className="mt-3 block text-center text-sm text-accent-primary underline">Check Your Listings</Link>}

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
          disabled={phase !== 'idle' || uncertain}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {phase === 'uploading' ? 'Uploading walkthrough...' : phase === 'saving' ? 'Saving listing...' : 'Submit for Review'}
        </button>
      </div>
    </div>
  )
}
