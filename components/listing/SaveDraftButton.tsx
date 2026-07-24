'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { saveDraft } from '@/app/actions/listingActions'
import { removeUploads, resolveSessionAndUpload } from '@/lib/listing-upload'
import { useRentralStore } from '@/store/useRentralStore'

export function SaveDraftButton() {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const step = useRentralStore((state) => state.step)
  const category = useRentralStore((state) => state.category)

  // Nothing worth saving before a category is picked; done means it's posted.
  if (!category || step === 'done') return null

  const handleSave = async () => {
    setIsSaving(true)
    const store = useRentralStore.getState()
    if (!store.category) {
      setIsSaving(false)
      return
    }

    const resolved = await resolveSessionAndUpload(store.ensureMediaFolderId(), store)
    if (!resolved.ok) {
      toast.error(resolved.error)
      setIsSaving(false)
      return
    }
    const { supabase, media } = resolved

    const result = await saveDraft({
      draftId: store.draftListingId ?? undefined,
      category: store.category,
      wizardStep: store.step === 'done' ? 'checkout' : store.step,
      address: store.address || undefined,
      basePrice: store.basePrice || undefined,
      metadata: store.metadata[store.category],
      lat: store.coords?.lat,
      lng: store.coords?.lng,
      videoPath: media.videoPath ?? undefined,
      posterPath: media.posterPath ?? undefined,
      documentPath: media.documentPath ?? undefined,
    })

    if (!result.success) {
      await removeUploads(supabase, media.newUploads)
      toast.error(result.error)
      setIsSaving(false)
      return
    }

    toast.success('Draft saved — continue anytime from Your Listings.')
    store.reset()
    router.push('/marketplace/listing')
  }

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={isSaving}
      className="flex items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-2 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <Save className="h-4 w-4" />
      {isSaving ? 'Saving Draft...' : 'Save Draft & Exit'}
    </button>
  )
}
