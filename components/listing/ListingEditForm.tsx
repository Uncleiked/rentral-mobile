'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { LISTING_FORM_SCHEMAS } from '@/lib/schemas'
import { updateListing } from '@/app/actions/listingActions'
import { ListingFields, type ListingFieldValues } from '@/components/listing/ListingFields'
import type { ListingCategory } from '@/store/useRentralStore'

export interface EditableListing {
  id: string
  category: ListingCategory
  address: string
  basePrice: string
  metadata: Record<string, unknown>
  mediaSource?: 'recorded' | 'approved_gallery'
}

export function ListingEditForm({ listing }: { listing: EditableListing }) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ListingFieldValues>({
    resolver: zodResolver(LISTING_FORM_SCHEMAS[listing.category]) as unknown as Resolver<ListingFieldValues>,
    defaultValues: {
      ...(listing.metadata as ListingFieldValues),
      address: listing.address,
      basePrice: listing.basePrice,
    },
  })

  const onSubmit = async (data: ListingFieldValues) => {
    setIsSaving(true)
    const { address, basePrice, ...metadata } = data
    try {
      const result = await updateListing({
        listingId: listing.id, address: String(address), basePrice: String(basePrice), metadata,
      })
      if (!result.success) { toast.error(result.error); return }
      toast.success('Listing updated.')
      router.push('/marketplace/listing')
    } catch {
      toast.error('The connection was interrupted. Check your listing and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-md mx-auto min-w-0">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2 break-words">Edit listing</h2>
        <p className="text-sm text-text-secondary">
          Update the details and pricing of your listing.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3">
        <Lock className="h-4 w-4 shrink-0 text-text-muted" />
        <p className="text-xs font-medium text-text-secondary">
          {listing.mediaSource === 'approved_gallery' ? 'Gallery media and authority documents are sealed to this listing. Its recording location is unverified; create a new listing if the media changes.' : 'The walkthrough video, GPS lock and authority documents are sealed to this listing. Create a new listing if those change.'}
        </p>
      </div>

      <p className="mb-5 text-xs leading-relaxed text-text-muted">Address corrections return the listing to review. Addresses cannot change once a booking has been confirmed.</p>
      <ListingFields category={listing.category} register={register} errors={errors} />

      <div className="mt-6 flex gap-3">
        <Link
          href="/marketplace/listing"
          className="flex flex-1 items-center justify-center rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98 min-h-11 max-w-full break-words"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98 disabled:cursor-not-allowed disabled:opacity-70 min-h-11 max-w-full whitespace-normal break-words"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
