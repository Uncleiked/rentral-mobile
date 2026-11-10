import { notFound, redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { requireUserId } from '@/lib/action-helpers'
import { LISTING_STATUS } from '@/lib/listing-status'
import { ListingEditForm } from '@/components/listing/ListingEditForm'
import { LISTING_CATEGORIES, type ListingCategory } from '@/store/useRentralStore'

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const userId = await requireUserId()
  if (!userId) redirect('/sign-in')

  // Ownership is part of the lookup — someone else's listing id 404s rather
  // than revealing it exists.
  const listing = await prisma.listing.findFirst({
    where: { id, lister_id: userId },
    select: {
      id: true,
      category: true,
      text_address: true,
      base_rent_amount: true,
      asset_metadata: true,
      listing_status: true,
      media_source: true,
    },
  })
  if (!listing || !LISTING_CATEGORIES.includes(listing.category as ListingCategory)) notFound()
  if (listing.listing_status === LISTING_STATUS.DRAFT) redirect(`/marketplace/listing/create?draft=${listing.id}`)

  return (
    <div className="min-h-screen bg-background-app px-4 py-10 sm:px-6">
      <ListingEditForm
        listing={{
          id: listing.id,
          category: listing.category as ListingCategory,
          address: listing.text_address ?? '',
          basePrice: listing.base_rent_amount ? String(Number(listing.base_rent_amount)) : '',
          metadata: (listing.asset_metadata ?? {}) as Record<string, unknown>,
          mediaSource: listing.media_source === 'approved_gallery' ? 'approved_gallery' : 'recorded',
        }}
      />
    </div>
  )
}
