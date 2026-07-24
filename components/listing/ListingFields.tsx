'use client'

import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import type { ListingCategory } from '@/store/useRentralStore'

// Shared by MetadataForm (wizard details step) and ListingEditForm — one
// source of truth for the category fieldsets and their styling.

export type ListingFieldValues = Record<string, string | boolean>

export const listingInputClass =
  'rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-all focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary'
export const listingLabelClass = 'text-xs font-medium uppercase tracking-wider text-text-muted'
export const listingErrorClass = 'text-xs text-trust-flagged'

type TextFieldSpec = {
  kind: 'text'
  name: string
  label: string
  placeholder: string
  numeric?: boolean
  span2?: boolean
}
type FieldSpec = TextFieldSpec | { kind: 'transmission' } | { kind: 'captain' }

const CATEGORY_FIELDS: Record<ListingCategory, FieldSpec[]> = {
  house: [
    { kind: 'text', name: 'bedrooms', label: 'Bedrooms', placeholder: 'e.g. 3', numeric: true },
    { kind: 'text', name: 'bathrooms', label: 'Bathrooms', placeholder: 'e.g. 2', numeric: true },
    { kind: 'text', name: 'sizeSqm', label: 'Size (sqm)', placeholder: 'e.g. 120', numeric: true },
    { kind: 'text', name: 'amenities', label: 'Amenities', placeholder: 'Generator, POP ceiling, water heater...', span2: true },
  ],
  car: [
    { kind: 'transmission' },
    { kind: 'text', name: 'mileageKm', label: 'Mileage (km)', placeholder: 'e.g. 42000', numeric: true },
    { kind: 'text', name: 'seats', label: 'Seats', placeholder: 'e.g. 5', numeric: true },
    { kind: 'text', name: 'fuelType', label: 'Fuel Type', placeholder: 'Petrol, Diesel...' },
  ],
  boat: [
    { kind: 'text', name: 'vesselType', label: 'Vessel Type', placeholder: 'Speedboat, Yacht...' },
    { kind: 'text', name: 'capacityPersons', label: 'Capacity (persons)', placeholder: 'e.g. 10', numeric: true },
    { kind: 'captain' },
  ],
}

interface ListingFieldsProps {
  category: ListingCategory
  register: UseFormRegister<ListingFieldValues>
  errors: FieldErrors<ListingFieldValues>
}

function FieldError({ errors, name }: { errors: FieldErrors<ListingFieldValues>; name: string }) {
  const message = errors[name]?.message
  if (!message) return null
  return <span className={listingErrorClass}>{String(message)}</span>
}

export function ListingFields({ category, register, errors }: ListingFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        {CATEGORY_FIELDS[category].map((field) => {
          if (field.kind === 'transmission') {
            return (
              <div key="transmission" className="flex flex-col gap-1.5">
                <label className={listingLabelClass}>Transmission</label>
                <select {...register('transmission')} className={listingInputClass}>
                  <option value="">Select...</option>
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                </select>
                <FieldError errors={errors} name="transmission" />
              </div>
            )
          }
          if (field.kind === 'captain') {
            return (
              <div key="captain" className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register('hasCaptain')}
                  id="hasCaptain"
                  className="h-4 w-4 rounded border-border-subtle accent-accent-primary"
                />
                <label htmlFor="hasCaptain" className="text-sm font-medium text-text-secondary">
                  Captain included
                </label>
              </div>
            )
          }
          return (
            <div key={field.name} className={`flex flex-col gap-1.5 ${field.span2 ? 'col-span-2' : ''}`}>
              <label className={listingLabelClass}>{field.label}</label>
              <input
                {...register(field.name)}
                {...(field.numeric ? { inputMode: 'numeric' as const, pattern: '[0-9]*' } : {})}
                placeholder={field.placeholder}
                className={listingInputClass}
              />
              <FieldError errors={errors} name={field.name} />
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={listingLabelClass}>Address</label>
        <input {...register('address')} placeholder="Street, area, city" className={listingInputClass} />
        <FieldError errors={errors} name="address" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={listingLabelClass}>Base Price (₦)</label>
        <input
          {...register('basePrice')}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="e.g. 850000"
          className={listingInputClass}
        />
        <FieldError errors={errors} name="basePrice" />
      </div>
    </div>
  )
}
