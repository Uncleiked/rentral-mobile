'use client'

import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { ListingMetadataField, type ListingMetadataFieldSpec } from '@/components/listing/ListingMetadataField'
import { optionalFeeLimitNgn } from '@/lib/listing-fees'
import type { ListingFieldValues } from '@/lib/listing-form'
import type { ListingCategory } from '@/store/useRentralStore'

export { listingInputClass, listingLabelClass, listingErrorClass, type ListingFieldValues } from '@/lib/listing-form'

const commonFields: ListingMetadataFieldSpec[] = [
  { kind: 'text', name: 'listingTitle', label: 'Listing title', placeholder: 'Give your listing a useful, clear title', span2: true, maxLength: 100 },
  { kind: 'select', name: 'rentalIntent', label: 'Listing purpose', options: [{ value: 'rent', label: 'Rent' }, { value: 'buy', label: 'Buy / for sale' }, { value: 'squat', label: 'Squat / shared living' }, { value: 'shortlet', label: 'Shortlet' }] },
  { kind: 'select', name: 'hostCapacity', label: 'I am listing as', options: [{ value: 'owner', label: 'Owner' }, { value: 'agent', label: 'Agent' }, { value: 'tenant', label: 'Current tenant' }, { value: 'organization', label: 'Organization' }] },
  { kind: 'textarea', name: 'description', label: 'Description', placeholder: 'What should someone know before they enquire?', span2: true, maxLength: 1500 },
]

const categoryFields: Record<ListingCategory, ListingMetadataFieldSpec[]> = {
  house: [
    { kind: 'select', name: 'propertyType', label: 'Property type', span2: true, options: [{ value: 'apartment', label: 'Apartment / flat' }, { value: 'studio', label: 'Studio' }, { value: 'room', label: 'Room' }, { value: 'bungalow', label: 'Bungalow' }, { value: 'duplex', label: 'Duplex' }, { value: 'terrace', label: 'Terrace' }, { value: 'detached', label: 'Detached house' }, { value: 'semi-detached', label: 'Semi-detached house' }, { value: 'other', label: 'Other' }] },
    { kind: 'text', name: 'bedrooms', label: 'Bedrooms', placeholder: '0 for a studio', inputMode: 'numeric' },
    { kind: 'text', name: 'bathrooms', label: 'Bathrooms', placeholder: 'e.g. 2', inputMode: 'numeric' },
    { kind: 'text', name: 'kitchens', label: 'Kitchens', placeholder: 'e.g. 1', inputMode: 'numeric' },
    { kind: 'text', name: 'floors', label: 'Floors', placeholder: 'e.g. 2', inputMode: 'numeric' },
    { kind: 'text', name: 'sizeSqm', label: 'Size (sqm)', placeholder: 'e.g. 120', inputMode: 'numeric', span2: true },
    { kind: 'textarea', name: 'amenities', label: 'Amenities', placeholder: 'Power supply, parking, water, accessibility…', span2: true, maxLength: 280 },
    { kind: 'textarea', name: 'landlordPreferences', label: 'House rules and landlord preferences', placeholder: 'Lease terms, occupancy limits, pets, smoking and shared-space expectations', span2: true, maxLength: 800 },
  ],
  car: [
    { kind: 'text', name: 'bodyType', label: 'Body type', placeholder: 'SUV, sedan, hatchback…' },
    { kind: 'select', name: 'transmission', label: 'Transmission', options: [{ value: 'automatic', label: 'Automatic' }, { value: 'manual', label: 'Manual' }] },
    { kind: 'text', name: 'mileageKm', label: 'Mileage (km)', placeholder: 'e.g. 42000', inputMode: 'numeric' },
    { kind: 'text', name: 'seats', label: 'Seats', placeholder: 'e.g. 5', inputMode: 'numeric' },
    { kind: 'text', name: 'engineType', label: 'Engine', placeholder: 'e.g. 2.0L hybrid' },
    { kind: 'text', name: 'fuelType', label: 'Fuel type', placeholder: 'Petrol, diesel, electric…' },
    { kind: 'select', name: 'insuranceStatus', label: 'Insurance status', span2: true, options: [{ value: 'insured', label: 'Insured' }, { value: 'not-insured', label: 'Not insured' }, { value: 'not-provided', label: 'Not provided' }] },
    { kind: 'textarea', name: 'insuranceDetails', label: 'Insurance and driver requirements', placeholder: 'Coverage, exclusions, excess and any driver requirements', span2: true, maxLength: 300 },
  ],
  boat: [
    { kind: 'text', name: 'vesselType', label: 'Vessel type', placeholder: 'Speedboat, yacht…' },
    { kind: 'text', name: 'capacityPersons', label: 'Capacity (people)', placeholder: 'e.g. 10', inputMode: 'numeric' },
    { kind: 'checkbox', name: 'hasCaptain', label: 'Captain included', span2: true },
    { kind: 'checkbox', name: 'lifeJackets', label: 'Life jackets available for every passenger', span2: true },
    { kind: 'textarea', name: 'safetyEquipment', label: 'Safety equipment and boarding requirements', placeholder: 'Life jackets, first aid, emergency equipment and boarding rules', span2: true, maxLength: 300 },
  ],
}

const locationFields: ListingMetadataFieldSpec[] = [
  { kind: 'text', name: 'state', label: 'State', placeholder: 'e.g. Lagos', maxLength: 80 },
  { kind: 'text', name: 'neighborhood', label: 'Area / neighbourhood', placeholder: 'e.g. Lekki Phase 1', maxLength: 80 },
  { kind: 'text', name: 'address', label: 'Address', placeholder: 'Street, area, city', span2: true, maxLength: 300 },
]

const priceFields: ListingMetadataFieldSpec[] = [
  { kind: 'text', name: 'basePrice', label: 'Base price (NGN)', placeholder: 'e.g. 850000', inputMode: 'numeric', maxLength: 10 },
  { kind: 'select', name: 'pricePeriod', label: 'Price period', options: [{ value: 'year', label: 'Per year' }, { value: 'month', label: 'Per month' }, { value: 'day', label: 'Per day' }, { value: 'trip', label: 'Per trip' }] },
]

const feeFields: ListingMetadataFieldSpec[] = [
  { kind: 'text', name: 'agencyFee', label: 'Agency fee (NGN)', placeholder: 'Optional', inputMode: 'decimal', maxLength: 13 },
  { kind: 'text', name: 'legalFee', label: 'Legal fee (NGN)', placeholder: 'Optional', inputMode: 'decimal', maxLength: 13 },
  { kind: 'text', name: 'cautionFee', label: 'Caution deposit (NGN)', placeholder: 'Optional', inputMode: 'decimal', maxLength: 13 },
  { kind: 'text', name: 'serviceCharge', label: 'Service charge (NGN)', placeholder: 'Optional', inputMode: 'decimal', maxLength: 13 },
]

type ListingFieldsProps = { category: ListingCategory; register: UseFormRegister<ListingFieldValues>; errors: FieldErrors<ListingFieldValues> }

export function ListingFields({ category, register, errors }: ListingFieldsProps): React.JSX.Element {
  const sections = [{ title: 'Your listing', fields: commonFields }, { title: 'Asset details', fields: categoryFields[category] }, { title: 'Location', fields: locationFields }, { title: 'Pricing', fields: priceFields }, { title: 'Additional fees', fields: feeFields }]
  return (
    <div className="flex flex-col gap-7">
      <p className="rounded-xl border border-glass-border-light bg-glass-light px-4 py-3 text-xs leading-relaxed text-text-secondary">One Rentral account works for every role. Choose your capacity for this listing; it does not change your account or imply professional licensing.</p>
      {sections.map((section) => <fieldset key={section.title} className="min-w-0 max-w-full"><legend className="mb-4 text-sm font-semibold text-text-primary">{section.title}</legend><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{section.fields.map((field) => <ListingMetadataField key={field.name} field={field} category={category} register={register} errors={errors} />)}</div>{section.title === 'Additional fees' && <p className="mt-3 text-xs leading-relaxed text-text-muted">Disclose every fee before a renter commits. Leave non-applicable fees blank or enter 0. Each amount must be within the configured platform limit of NGN {optionalFeeLimitNgn()}. This limit is a product rule and does not determine the legality of a fee.</p>}</fieldset>)}
    </div>
  )
}
