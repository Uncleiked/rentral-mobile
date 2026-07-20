'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  boatMetadataSchema,
  carMetadataSchema,
  houseMetadataSchema,
  listingDetailsSchema,
} from '@/lib/schemas'
import { useRentralStore } from '@/store/useRentralStore'

const CATEGORY_SCHEMAS = {
  house: houseMetadataSchema.merge(listingDetailsSchema),
  car: carMetadataSchema.merge(listingDetailsSchema),
  boat: boatMetadataSchema.merge(listingDetailsSchema),
}

const inputClass =
  'rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
const labelClass = 'text-xs font-medium uppercase tracking-wider text-text-muted'
const errorClass = 'text-xs text-trust-flagged'

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
  const defaultValues = { ...metadata[safeCategory], address, basePrice }

  const { register, handleSubmit, formState: { errors } } = useForm<any>({
    resolver: zodResolver(CATEGORY_SCHEMAS[safeCategory] as any) as any,
    defaultValues,
  })

  if (!category) return null

  const onSubmit = (data: any) => {
    const { address: submittedAddress, basePrice: submittedBasePrice, ...rest } = data
    setAddress(submittedAddress)
    setBasePrice(submittedBasePrice)
    if (category === 'house') updateHouseMetadata(rest)
    if (category === 'car') updateCarMetadata(rest)
    if (category === 'boat') updateBoatMetadata(rest)
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

      <div className="flex flex-col gap-4">
        {category === 'house' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Bedrooms</label>
              <input {...register('bedrooms')} placeholder="e.g. 3" className={inputClass} />
              {errors.bedrooms && <span className={errorClass}>{errors.bedrooms.message as string}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Bathrooms</label>
              <input {...register('bathrooms')} placeholder="e.g. 2" className={inputClass} />
              {errors.bathrooms && <span className={errorClass}>{errors.bathrooms.message as string}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Size (sqm)</label>
              <input {...register('sizeSqm')} placeholder="e.g. 120" className={inputClass} />
              {errors.sizeSqm && <span className={errorClass}>{errors.sizeSqm.message as string}</span>}
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className={labelClass}>Amenities</label>
              <input {...register('amenities')} placeholder="Generator, POP ceiling, water heater..." className={inputClass} />
              {errors.amenities && <span className={errorClass}>{errors.amenities.message as string}</span>}
            </div>
          </div>
        )}

        {category === 'car' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Transmission</label>
              <select {...register('transmission')} className={inputClass}>
                <option value="">Select...</option>
                <option value="automatic">Automatic</option>
                <option value="manual">Manual</option>
              </select>
              {errors.transmission && <span className={errorClass}>{errors.transmission.message as string}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Mileage (km)</label>
              <input {...register('mileageKm')} placeholder="e.g. 42000" className={inputClass} />
              {errors.mileageKm && <span className={errorClass}>{errors.mileageKm.message as string}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Seats</label>
              <input {...register('seats')} placeholder="e.g. 5" className={inputClass} />
              {errors.seats && <span className={errorClass}>{errors.seats.message as string}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Fuel Type</label>
              <input {...register('fuelType')} placeholder="Petrol, Diesel..." className={inputClass} />
              {errors.fuelType && <span className={errorClass}>{errors.fuelType.message as string}</span>}
            </div>
          </div>
        )}

        {category === 'boat' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Vessel Type</label>
              <input {...register('vesselType')} placeholder="Speedboat, Yacht..." className={inputClass} />
              {errors.vesselType && <span className={errorClass}>{errors.vesselType.message as string}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Capacity (persons)</label>
              <input {...register('capacityPersons')} placeholder="e.g. 10" className={inputClass} />
              {errors.capacityPersons && <span className={errorClass}>{errors.capacityPersons.message as string}</span>}
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" {...register('hasCaptain')} id="hasCaptain" className="h-4 w-4 rounded border-border-subtle accent-accent-primary" />
              <label htmlFor="hasCaptain" className="text-sm font-medium text-text-secondary">Captain included</label>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Address</label>
          <input {...register('address')} placeholder="Street, area, city" className={inputClass} />
          {errors.address && <span className={errorClass}>{errors.address.message as string}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Base Price (₦)</label>
          <input {...register('basePrice')} placeholder="e.g. 850000" className={inputClass} />
          {errors.basePrice && <span className={errorClass}>{errors.basePrice.message as string}</span>}
        </div>
      </div>

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
