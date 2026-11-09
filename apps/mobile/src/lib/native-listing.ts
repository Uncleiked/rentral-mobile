export type ListingCategory = 'house' | 'car' | 'boat'
export type NativeCapture = { uri: string; lat: number; lng: number; accuracy: number; duration: number }
export type OwnerListing = { id: string; title: string; category: ListingCategory; status: string; price: string; pricePeriod: string; createdAt: string; hasVideo: boolean; hasDocument: boolean }
export type ListingForm = { address: string; basePrice: string; listingTitle: string; description: string; pricePeriod: 'year' | 'month' | 'day' | 'trip'; bedrooms: string; bathrooms: string; sizeSqm: string; amenities: string; transmission: 'automatic' | 'manual'; mileageKm: string; seats: string; fuelType: string; vesselType: string; capacityPersons: string; hasCaptain: boolean }
export const EMPTY_LISTING_FORM: ListingForm = { address: '', basePrice: '', listingTitle: '', description: '', pricePeriod: 'year', bedrooms: '', bathrooms: '', sizeSqm: '', amenities: '', transmission: 'automatic', mileageKm: '', seats: '', fuelType: '', vesselType: '', capacityPersons: '', hasCaptain: false }
export const MAX_NATIVE_VIDEO_BYTES = 200 * 1024 * 1024
export const MAX_NATIVE_DOCUMENT_BYTES = 10 * 1024 * 1024

export function listingFormError(category: ListingCategory, form: ListingForm): string | null {
  if (form.address.trim().length < 5 || form.address.length > 300) return 'Enter the complete listing address, between 5 and 300 characters.'
  if (!/^[1-9]\d{0,9}$/.test(form.basePrice)) return 'Enter a whole-naira price above zero, up to 10 digits.'
  const counts = category === 'house' ? [form.bedrooms, form.bathrooms, form.sizeSqm] : category === 'car' ? [form.mileageKm, form.seats] : [form.capacityPersons]
  if (counts.some(value => !/^\d{1,9}$/.test(value))) return 'Complete the asset details using whole numbers. Use 0 for a studio bedroom count.'
  if (category === 'car' && !form.fuelType.trim()) return 'Enter the vehicle fuel type.'
  if (category === 'boat' && !form.vesselType.trim()) return 'Enter the vessel type.'
  return null
}

export function nativeListingMetadata(category: ListingCategory, form: ListingForm): Record<string, string | boolean> {
  const shared = { listingTitle: form.listingTitle.trim(), description: form.description.trim(), pricePeriod: form.pricePeriod, rentalIntent: 'rent' }
  if (category === 'house') return { ...shared, bedrooms: form.bedrooms, bathrooms: form.bathrooms, sizeSqm: form.sizeSqm, amenities: form.amenities.trim() }
  if (category === 'car') return { ...shared, transmission: form.transmission, mileageKm: form.mileageKm, seats: form.seats, fuelType: form.fuelType.trim() }
  return { ...shared, vesselType: form.vesselType.trim(), capacityPersons: form.capacityPersons, hasCaptain: form.hasCaptain }
}
