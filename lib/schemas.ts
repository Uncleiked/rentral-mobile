import { z } from 'zod'
import { DRAFT_WIZARD_STEPS, LISTING_CATEGORIES } from '@/store/useRentralStore'
import { validOptionalListingFee } from '@/lib/listing-fees'

// Validate phone formatting; output escaping remains the renderer's responsibility.
const phoneRegex = /^\+?[0-9]+$/

export const individualProfileSchema = z.object({
  full_name: z.string().min(2, "Full name is required"),
  date_of_birth: z.string().min(10, "Date of birth is required"),
  country: z.string().min(2, "Country is required"),
  state: z.string().min(2, "State is required"),
  address: z.string().min(5, "Address is required"),
  phone_number: z.string().regex(phoneRegex, "Phone number must contain only numbers and an optional + prefix"),
})

export const organizationProfileSchema = z.object({
  country: z.string().min(2, "Country is required"),
  address: z.string().min(5, "Address is required"),
  phone_number: z.string().regex(phoneRegex, "Phone number must contain only numbers and an optional + prefix"),
})

const usernameRegex = /^[a-z0-9_]{3,24}$/

export function profileFormSchema(accountType: 'individual' | 'organization') {
  return organizationProfileSchema.extend({
    full_name: accountType === 'individual' ? individualProfileSchema.shape.full_name : z.string(),
    date_of_birth: accountType === 'individual' ? individualProfileSchema.shape.date_of_birth : z.string(),
    state: accountType === 'individual' ? individualProfileSchema.shape.state : z.string(),
  })
}

export const usernameBioSchema = z.object({
  username: z.string().regex(
    usernameRegex,
    "Usernames must be 3-24 characters and use only lowercase letters, numbers, or underscores."
  ),
  bio: z.string().max(280, "Bio must be 280 characters or fewer."),
})

export const emailChangeSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
})

// Listing capture — category-specific structural metadata (build-plan.md Phase 2, Item 05)
const digits = (label: string) =>
  z.string()
    .min(1, `${label} is required`)
    .regex(/^[0-9]+$/, `${label} must contain only digits`)
    .max(9, `${label} is too long`)

// No leading zero: prices are whole naira amounts above zero. Max 10 digits
// so the value always fits the DB's DECIMAL(12,2) column.
const basePriceField = z.string()
  .min(1, "Base price is required")
  .regex(/^[1-9][0-9]*$/, "Base price must be a whole number above zero")
  .max(10, "Base price is too large")

const optionalDigits = (label: string) => digits(label).or(z.literal('')).optional()
const optionalFee = z.string().trim().max(13).refine(validOptionalListingFee, {
  message: 'Enter a non-negative NGN amount with up to 2 decimal places within the platform fee limit.',
}).optional()

const sharedListingMetadata = {
  listingTitle: z.string().trim().max(100, 'Title must be 100 characters or fewer.').optional(),
  description: z.string().trim().max(1500, 'Description must be 1,500 characters or fewer.').optional(),
  rentalIntent: z.enum(['rent', 'buy', 'squat', 'shortlet', '']).optional(),
  hostCapacity: z.enum(['owner', 'agent', 'tenant', 'organization', '']).optional(),
  pricePeriod: z.enum(['year', 'month', 'day', 'trip', '']).optional(),
  state: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  agencyFee: optionalFee,
  legalFee: optionalFee,
  cautionFee: optionalFee,
  serviceCharge: optionalFee,
}

export const houseMetadataSchema = z.object({
  ...sharedListingMetadata,
  bedrooms: digits("Bedrooms"),
  bathrooms: digits("Bathrooms"),
  sizeSqm: digits("Size"),
  amenities: z.string().max(280, "Amenities must be 280 characters or fewer."),
  propertyType: z.enum(['apartment', 'studio', 'room', 'bungalow', 'duplex', 'terrace', 'detached', 'semi-detached', 'other', '']).optional(),
  kitchens: optionalDigits('Kitchens'),
  floors: optionalDigits('Floors'),
  landlordPreferences: z.string().trim().max(800, 'Preferences must be 800 characters or fewer.').optional(),
})

export const carMetadataSchema = z.object({
  ...sharedListingMetadata,
  transmission: z.enum(['automatic', 'manual'], { message: "Select a transmission type" }),
  mileageKm: digits("Mileage"),
  seats: digits("Seat count"),
  fuelType: z.string().min(1, "Fuel type is required"),
  bodyType: z.string().trim().max(60).optional(),
  engineType: z.string().trim().max(80).optional(),
  insuranceStatus: z.enum(['insured', 'not-insured', 'not-provided', '']).optional(),
  insuranceDetails: z.string().trim().max(300).optional(),
})

export const boatMetadataSchema = z.object({
  ...sharedListingMetadata,
  vesselType: z.string().min(1, "Vessel type is required"),
  capacityPersons: digits("Capacity"),
  hasCaptain: z.boolean(),
  lifeJackets: z.boolean().optional(),
  safetyEquipment: z.string().trim().max(300).optional(),
})

export const listingDetailsSchema = z.object({
  address: z.string().min(5, "Address is required"),
  basePrice: basePriceField,
})

const listingCategoryField = z.enum(LISTING_CATEGORIES)

// Full payload for the saveListing server action (Item 06). Extends
// listingDetailsSchema (address + basePrice) so the field rules can't drift
// from the wizard form. `metadata` stays unknown here — the action re-parses
// it against the category schema above. Coordinates are optional only when
// posting a draft whose coordinates were already stored server-side.
export const saveListingInputSchema = listingDetailsSchema.extend({
  category: listingCategoryField,
  draftId: z.string().uuid().optional(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
  accuracy: z.number().nonnegative().optional(),
  videoPath: z.string().min(1),
  posterPath: z.string().min(1).optional(),
  documentPath: z.string().min(1),
  metadata: z.unknown(),
})

// Draft saves accept partial everything except the category — required fields
// are only enforced when the draft is finally posted.
export const saveDraftInputSchema = z.object({
  draftId: z.string().uuid().optional(),
  category: listingCategoryField,
  wizardStep: z.enum(DRAFT_WIZARD_STEPS),
  address: z.string().max(300).optional(),
  basePrice: z.string().max(20).optional(),
  metadata: z.unknown(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
  videoPath: z.string().min(1).optional(),
  posterPath: z.string().min(1).optional(),
  documentPath: z.string().min(1).optional(),
})

// Editing a posted listing: metadata/address/price only — category, video,
// GPS, and documents are the trust anchors and stay padlocked (Item 11).
export const updateListingInputSchema = listingDetailsSchema.extend({
  listingId: z.string().uuid(),
  metadata: z.unknown(),
})

// Per-category form schema (metadata + address + price) shared by the wizard's
// details step and the standalone listing edit form.
export const LISTING_FORM_SCHEMAS = {
  house: houseMetadataSchema.merge(listingDetailsSchema),
  car: carMetadataSchema.merge(listingDetailsSchema),
  boat: boatMetadataSchema.merge(listingDetailsSchema),
} as const
