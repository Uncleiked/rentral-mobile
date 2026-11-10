import { LISTING_FORM_SCHEMAS, LISTING_METADATA_SCHEMAS, type OwnerListingDetail } from '../../../../lib/contracts/listings'
export type ListingCategory = 'house' | 'car' | 'boat'
// Legacy GPS fields remain readable only so existing device recovery is not lost.
// New recordings send their readings directly to the backend and retain its id.
export type NativeCapture = { uri: string; duration: number; captureId?: string; lat?: number; lng?: number; accuracy?: number }
export type OwnerListing = { id: string; title: string; category: ListingCategory; status: string; price: string; pricePeriod: string; createdAt: string; hasVideo: boolean; hasDocument: boolean }
export type ListingForm = { address: string; basePrice: string; listingTitle: string; description: string; pricePeriod: 'year' | 'month' | 'day' | 'trip'; rentalIntent: 'rent' | 'buy' | 'squat' | 'shortlet'; hostCapacity: 'owner' | 'agent' | 'tenant' | 'organization'; state: string; neighborhood: string;
  agencyFee: string; legalFee: string; cautionFee: string; serviceCharge: string; bedrooms: string; bathrooms: string; sizeSqm: string; amenities: string;
  propertyType: 'apartment' | 'studio' | 'room' | 'bungalow' | 'duplex' | 'terrace' | 'detached' | 'semi-detached' | 'other' | ''; kitchens: string; floors: string; landlordPreferences: string;
  transmission: 'automatic' | 'manual'; mileageKm: string; seats: string; fuelType: string; bodyType: string; engineType: string; insuranceStatus: 'insured' | 'not-insured' | 'not-provided' | ''; insuranceDetails: string;
  vesselType: string; capacityPersons: string; hasCaptain: boolean; lifeJackets: boolean; safetyEquipment: string }
export const EMPTY_LISTING_FORM: ListingForm = { address: '', basePrice: '', listingTitle: '', description: '', pricePeriod: 'year', rentalIntent: 'rent', hostCapacity: 'owner', state: '', neighborhood: '', agencyFee: '', legalFee: '', cautionFee: '', serviceCharge: '',
  bedrooms: '', bathrooms: '', sizeSqm: '', amenities: '', propertyType: '', kitchens: '', floors: '', landlordPreferences: '', transmission: 'automatic', mileageKm: '', seats: '', fuelType: '', bodyType: '', engineType: '', insuranceStatus: '', insuranceDetails: '', vesselType: '', capacityPersons: '', hasCaptain: false, lifeJackets: false, safetyEquipment: '' }
export const MAX_NATIVE_VIDEO_BYTES = 200 * 1024 * 1024
export const MAX_NATIVE_DOCUMENT_BYTES = 10 * 1024 * 1024

export function listingFormError(category: ListingCategory, form: ListingForm): string | null {
  if (form.address.trim().length < 5 || form.address.length > 300) return 'Enter the complete listing address, between 5 and 300 characters.'
  if (!/^[1-9]\d{0,9}$/.test(form.basePrice)) return 'Enter a whole-naira price above zero, up to 10 digits.'
  const counts = category === 'house' ? [form.bedrooms, form.bathrooms, form.sizeSqm] : category === 'car' ? [form.mileageKm, form.seats] : [form.capacityPersons]
  if (counts.some(value => !/^\d{1,9}$/.test(value))) return 'Complete the asset details using whole numbers. Use 0 for a studio bedroom count.'
  if (category === 'car' && !form.fuelType.trim()) return 'Enter the vehicle fuel type.'
  if (category === 'boat' && !form.vesselType.trim()) return 'Enter the vessel type.'
  const checked = LISTING_FORM_SCHEMAS[category].safeParse({ ...nativeListingMetadata(category, form), address: form.address.trim(), basePrice: form.basePrice })
  if (!checked.success) return checked.error.issues[0]?.message ?? 'Check the listing details and optional fees.'
  return null
}

export function nativeListingMetadata(category: ListingCategory, form: ListingForm): Record<string, string | boolean> {
  const shared = { listingTitle: form.listingTitle.trim(), description: form.description.trim(), pricePeriod: form.pricePeriod, rentalIntent: form.rentalIntent, hostCapacity: form.hostCapacity, state: form.state.trim(), neighborhood: form.neighborhood.trim(), agencyFee: form.agencyFee.trim(), legalFee: form.legalFee.trim(), cautionFee: form.cautionFee.trim(), serviceCharge: form.serviceCharge.trim() }
  if (category === 'house') return { ...shared, bedrooms: form.bedrooms, bathrooms: form.bathrooms, sizeSqm: form.sizeSqm, amenities: form.amenities.trim(), propertyType: form.propertyType, kitchens: form.kitchens, floors: form.floors, landlordPreferences: form.landlordPreferences.trim() }
  if (category === 'car') return { ...shared, transmission: form.transmission, mileageKm: form.mileageKm, seats: form.seats, fuelType: form.fuelType.trim(), bodyType: form.bodyType.trim(), engineType: form.engineType.trim(), insuranceStatus: form.insuranceStatus, insuranceDetails: form.insuranceDetails.trim() }
  return { ...shared, vesselType: form.vesselType.trim(), capacityPersons: form.capacityPersons, hasCaptain: form.hasCaptain, lifeJackets: form.lifeJackets, safetyEquipment: form.safetyEquipment.trim() }
}

export function formFromOwnerListing(listing: OwnerListingDetail): ListingForm {
  const result = { ...EMPTY_LISTING_FORM, address: listing.address, basePrice: listing.basePrice, pricePeriod: listing.category === 'house' ? 'year' : listing.category === 'boat' ? 'trip' : 'day' } as ListingForm
  const fields = LISTING_METADATA_SCHEMAS[listing.category].shape
  for (const [key, value] of Object.entries(listing.metadata)) {
    if (!(key in result) || !(key in fields)) continue
    const validator = fields[key as keyof typeof fields]
    if (!validator.safeParse(value).success || (value === '' && ['rentalIntent', 'hostCapacity', 'pricePeriod', 'transmission'].includes(key))) continue
    if (typeof value === typeof result[key as keyof ListingForm]) Object.assign(result, { [key]: value })
  }
  return result
}
