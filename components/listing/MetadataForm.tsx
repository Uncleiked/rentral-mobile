'use client'

import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LISTING_FORM_SCHEMAS } from '@/lib/schemas'
import { ListingFields, type ListingFieldValues } from '@/components/listing/ListingFields'
import {
  useRentralStore,
  type BoatMetadata,
  type CarMetadata,
  type HouseMetadata,
} from '@/store/useRentralStore'

export function MetadataForm() {
  const category = useRentralStore((state) => state.category)
  const metadata = useRentralStore((state) => state.metadata)
  const address = useRentralStore((state) => state.address)
  const basePrice = useRentralStore((state) => state.basePrice)
  const updateHouseMetadata = useRentralStore((state) => state.updateHouseMetadata)
  const updateCarMetadata = useRentralStore((state) => state.updateCarMetadata)
  const updateBoatMetadata = useRentralStore((state) => state.updateBoatMetadata)
  const setAddress = useRentralStore((state) => state.setAddress)
  const setBasePrice = useRentralStore((state) => state.setBasePrice)
  const goNext = useRentralStore((state) => state.goNext)
  const goBack = useRentralStore((state) => state.goBack)

  // Hooks must run unconditionally — fall back to 'house' when category isn't set yet,
  // then bail out below before rendering anything category-specific.
  const safeCategory = category ?? 'house'
  const defaultValues: ListingFieldValues = { ...metadata[safeCategory], address, basePrice }

  const { register, handleSubmit, formState: { errors } } = useForm<ListingFieldValues>({
    resolver: zodResolver(LISTING_FORM_SCHEMAS[safeCategory]) as unknown as Resolver<ListingFieldValues>,
    defaultValues,
  })

  if (!category) return null

  const onSubmit = (data: ListingFieldValues) => {
    const { address: submittedAddress, basePrice: submittedBasePrice, ...rest } = data
    setAddress(String(submittedAddress))
    setBasePrice(String(submittedBasePrice))
    // The zod resolver already guaranteed the shape matches the category.
    if (category === 'house') updateHouseMetadata(rest as Partial<HouseMetadata>)
    if (category === 'car') updateCarMetadata(rest as Partial<CarMetadata>)
    if (category === 'boat') updateBoatMetadata(rest as Partial<BoatMetadata>)
    goNext()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-bold text-text-primary tracking-wide mb-2">
          Asset details
        </h2>
        <p className="text-sm text-text-secondary">
          Structural information and pricing for your listing.
        </p>
      </div>

      <ListingFields category={category} register={register} errors={errors} />

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={goBack}
          className="flex-1 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary transition-all active:scale-98"
        >
          Back
        </button>
        <button
          type="submit"
          className="flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg transition-all hover:bg-accent-hover active:scale-98"
        >
          Continue
        </button>
      </div>
    </form>
  )
}
