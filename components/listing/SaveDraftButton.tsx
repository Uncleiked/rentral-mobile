'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { resolveSessionAndUpload } from '@/lib/listing-upload'
import { useRentralStore } from '@/store/useRentralStore'
import { assertWizardCurrent, executeWebListingCommand } from '@/lib/listings/capture-client'

export function SaveDraftButton({ actorId }: { actorId: string }) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const step = useRentralStore((state) => state.step)
  const category = useRentralStore((state) => state.category)
  const capture = useRentralStore((state) => state.capture)

  // Nothing worth saving before a category is picked; done means it's posted.
  if (!category || step === 'done') return null

  const handleSave = async () => {
    const store = useRentralStore.getState()
    if (store.actorId !== actorId || store.mutationBusy || store.pendingCommand || store.capturePending || store.recoveryError || store.capture.isRecording || store.capture.hasStarted && !store.capture.isComplete) return
    const identity = { actorId, generation: store.generation, isActive: () => active.current }
    setIsSaving(true)
    store.setMutationBusy(true)
    if (!store.category) {
      setIsSaving(false)
      store.setMutationBusy(false)
      return
    }

    try {
      const resolved = await resolveSessionAndUpload(store.ensureMediaFolderId(), store, actorId, identity.generation)
      assertWizardCurrent(identity)
      if (!resolved.ok) { toast.error(resolved.error); return }
      const { media } = resolved
      store.rememberUploadedMedia(media)
      const command = store.prepareListingCommand({ mode: 'draft', listing: {
        clientId: crypto.randomUUID(), captureId: store.captureId ?? undefined,
        draftId: store.draftListingId ?? undefined,
        expectedRevision: store.draftRevision ?? undefined,
        category: store.category,
        wizardStep: store.step === 'done' ? 'checkout' : store.step,
        address: store.address || undefined,
        basePrice: store.basePrice || undefined,
        metadata: store.metadata[store.category],
        videoPath: media.videoPath ?? undefined,
        posterPath: media.posterPath ?? undefined,
        documentPath: media.documentPath ?? undefined,
      } })
      await executeWebListingCommand(identity, command)
      assertWizardCurrent(identity)
      store.completeListingCommand(command.listing.clientId)

      const hasSavedWalkthrough = Boolean(media.videoPath)
      toast.success(hasSavedWalkthrough ? 'Walkthrough saved to your Media Vault.' : 'Draft saved — continue anytime from Your Listings.')
      store.reset()
      router.push(hasSavedWalkthrough ? '/marketplace/vault' : '/marketplace/listing')
    } catch (reason) {
      if (active.current && useRentralStore.getState().actorId === actorId && useRentralStore.getState().generation === identity.generation) toast.error(reason instanceof Error ? reason.message : 'Could not confirm the save. Check the original saved request before saving again.')
    } finally {
      if (active.current) setIsSaving(false)
      if (active.current && useRentralStore.getState().actorId === actorId && useRentralStore.getState().generation === identity.generation) store.setMutationBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={isSaving || capture.isRecording || (capture.hasStarted && !capture.isComplete)}
      className="flex items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-2 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 disabled:cursor-not-allowed disabled:opacity-70 min-h-11 max-w-full whitespace-normal break-words"
    >
      <Save className="h-4 w-4" />
      {isSaving ? 'Saving Draft...' : 'Save Draft & Exit'}
    </button>
  )
}
