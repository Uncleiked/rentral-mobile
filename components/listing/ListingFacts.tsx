import type { ListingCategory } from '@/lib/contracts/listings'
import type { ListingMetadataJson } from '@/lib/profile-data'

type Props = { category: ListingCategory; metadata: ListingMetadataJson }
type Fact = readonly [key: string, label: string]
const sharedFacts: readonly Fact[] = [['rentalIntent', 'Listing type'], ['hostCapacity', 'Listed as'], ['state', 'State']]
const facts: Record<ListingCategory, readonly Fact[]> = {
  house: [['propertyType', 'Property type'], ['bedrooms', 'Bedrooms'], ['bathrooms', 'Bathrooms'], ['kitchens', 'Kitchens'], ['floors', 'Floors'], ['sizeSqm', 'Floor area (sq m)']],
  car: [['bodyType', 'Body type'], ['transmission', 'Transmission'], ['engineType', 'Engine'], ['fuelType', 'Fuel type'], ['mileageKm', 'Mileage (km)'], ['seats', 'Seats']],
  boat: [['vesselType', 'Vessel type'], ['capacityPersons', 'Guest capacity']],
}
const valueLabels: Record<string, Record<string, string>> = {
  rentalIntent: { rent: 'Rent', buy: 'For sale', squat: 'Shared living', shortlet: 'Shortlet' },
  hostCapacity: { owner: 'Owner', agent: 'Agent', tenant: 'Current tenant', organization: 'Organization' },
  propertyType: { apartment: 'Apartment / flat', studio: 'Studio', room: 'Room', bungalow: 'Bungalow', duplex: 'Duplex', terrace: 'Terrace', detached: 'Detached house', 'semi-detached': 'Semi-detached house', other: 'Other' },
  transmission: { automatic: 'Automatic', manual: 'Manual' },
}
function text(metadata: ListingMetadataJson, key: string): string {
  const value = metadata[key]
  return typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}
function declaration(value: unknown, yes: string, no: string): string { return value === true ? yes : value === false ? no : 'Not provided' }
const prose = 'whitespace-pre-line break-words text-sm leading-7 text-text-secondary wrap-anywhere'

/** Public, allowlisted presentation only. Never render arbitrary metadata or imply verification. */
export function ListingFacts({ category, metadata }: Props) {
  const description = text(metadata, 'description')
  const rows = [...sharedFacts, ...facts[category]].flatMap(([key, label]) => {
    const value = text(metadata, key)
    return value ? [{ key, label, value: valueLabels[key]?.[value] ?? value }] : []
  })
  const amenities = category === 'house' ? [...new Set(text(metadata, 'amenities').split(/[,\n]/).map(value => value.trim()).filter(Boolean))].slice(0, 30) : []
  return <div className="min-w-0" aria-label="Listing information">
    <section className="min-w-0 border-t border-border-subtle py-7" aria-label="About this listing">
      <h2 className="mb-4 text-lg font-semibold">About this listing</h2>
      <p className={description ? prose : 'text-sm leading-7 text-text-muted'}>{description || 'The host has not added a description.'}</p>
    </section>
    <section className="min-w-0 border-t border-border-subtle py-7" aria-label="Asset details">
      <h2 className="mb-5 text-lg font-semibold">The details that matter</h2>
      {rows.length ? <dl className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{rows.map(row => <div key={row.key} className="min-w-0"><dt className="text-xs text-text-muted">{row.label}</dt><dd className="mt-1.5 break-words text-sm font-medium text-text-primary wrap-anywhere">{row.value}</dd></div>)}</dl> : <p className="text-sm text-text-muted">Asset details have not been provided.</p>}
      {amenities.length > 0 && <div className="mt-7"><h3 className="mb-3 text-sm font-medium">Amenities</h3><ul className="flex min-w-0 flex-wrap gap-2">{amenities.map(amenity => <li key={amenity} className="min-w-0 rounded-full border border-border-subtle px-3 py-2 text-xs text-text-secondary wrap-anywhere">{amenity}</li>)}</ul></div>}
    </section>
    <section className="min-w-0 border-t border-border-subtle py-7" aria-label="Host-declared terms">
      {category === 'house' ? <><h2 className="mb-4 text-lg font-semibold">House rules and landlord preferences</h2><p className={prose}>{text(metadata, 'landlordPreferences') || 'House rules and occupancy requirements have not been provided. Confirm them with the host before committing.'}</p></> : category === 'car' ? <>
        <h2 className="mb-4 text-lg font-semibold">Insurance and driver requirements</h2>
        <dl><div><dt className="text-xs text-text-muted">Insurance declared by host</dt><dd className="mt-1.5 text-sm font-medium">{metadata.insuranceStatus === 'insured' ? 'Host states insured' : metadata.insuranceStatus === 'not-insured' ? 'Host states not insured' : 'Not provided'}</dd></div></dl>
        <p className={prose + ' mt-4'}>{text(metadata, 'insuranceDetails') || 'Cover, exclusions and driver requirements have not been provided.'}</p>
        <p className="mt-3 text-xs leading-6 text-text-muted">Confirm the current insurance policy, permitted drivers and any excess with the host. This declaration is not an insurance verification.</p>
      </> : <>
        <h2 className="mb-4 text-lg font-semibold">Safety and boarding requirements</h2>
        <dl className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2"><div><dt className="text-xs text-text-muted">Captain declared by host</dt><dd className="mt-1.5 text-sm font-medium">{declaration(metadata.hasCaptain, 'Included', 'Not included')}</dd></div><div><dt className="text-xs text-text-muted">Life jackets declared by host</dt><dd className="mt-1.5 text-sm font-medium">{declaration(metadata.lifeJackets, 'Available', 'Not available')}</dd></div></dl>
        <p className={prose + ' mt-4'}>{text(metadata, 'safetyEquipment') || 'Other safety equipment and boarding requirements have not been provided.'}</p>
        <p className="mt-3 text-xs leading-6 text-text-muted">Confirm capacity, a suitable life jacket for every passenger and the operating arrangements before boarding. These are the host&apos;s declarations.</p>
      </>}
    </section>
  </div>
}
