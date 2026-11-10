import { z } from 'zod'
import { validOptionalListingFee } from '../listing-fees'

export const LISTING_CATEGORIES = ['house', 'car', 'boat'] as const
export const DRAFT_WIZARD_STEPS = ['category', 'capture', 'details', 'documents', 'checkout'] as const
export type ListingCategory = (typeof LISTING_CATEGORIES)[number]

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
  address: z.string().trim().min(5, "Address is required").max(300),
  basePrice: basePriceField,
})

const listingCategoryField = z.enum(LISTING_CATEGORIES)
export const listingMediaSourceSchema = z.enum(['recorded', 'approved_gallery'])
export type ListingMediaSource = z.infer<typeof listingMediaSourceSchema>
const galleryPhotosField = z.array(z.string().min(1).max(500)).max(10).refine(paths => new Set(paths.map(path => path.toLowerCase())).size === paths.length, 'Choose each photo only once.')

// Full payload for the saveListing server action (Item 06). Extends
// listingDetailsSchema (address + basePrice) so the field rules can't drift
// from the wizard form. `metadata` stays unknown here — the action re-parses
// it against the category schema above. Only a sealed recording identifier can
// supply location evidence; fresh mutable coordinates are never accepted here.
export const saveListingInputSchema = listingDetailsSchema.extend({
  clientId: z.string().uuid().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  category: listingCategoryField,
  draftId: z.string().uuid().optional(),
  mediaSource: listingMediaSourceSchema.optional(),
  galleryPhotos: galleryPhotosField.optional(),
  captureId: z.string().uuid().optional(),
  videoPath: z.string().min(1).max(500).optional(),
  posterPath: z.string().min(1).optional(),
  documentPath: z.string().min(1),
  metadata: z.unknown(),
}).strict().superRefine((value, context) => {
  if (value.mediaSource === 'approved_gallery') {
    if (value.captureId) context.addIssue({ code: 'custom', path: ['captureId'], message: 'Gallery media has no recording-location capture.' })
    if (!value.galleryPhotos?.length && !value.videoPath) context.addIssue({ code: 'custom', path: ['galleryPhotos'], message: 'Choose at least one photo or a video.' })
  } else {
    if (!value.captureId) context.addIssue({ code: 'custom', path: ['captureId'], message: 'Record a walkthrough with its location.' })
    if (!value.videoPath) context.addIssue({ code: 'custom', path: ['videoPath'], message: 'Upload the recorded walkthrough.' })
    if (value.galleryPhotos !== undefined) context.addIssue({ code: 'custom', path: ['galleryPhotos'], message: 'Gallery photos require explicit gallery permission.' })
  }
})

// Draft saves accept partial everything except the category — required fields
// are only enforced when the draft is finally posted.
export const saveDraftInputSchema = z.object({
  clientId: z.string().uuid().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  draftId: z.string().uuid().optional(),
  category: listingCategoryField,
  wizardStep: z.enum(DRAFT_WIZARD_STEPS),
  address: z.string().max(300).optional(),
  basePrice: z.string().max(20).optional(),
  metadata: z.unknown(),
  mediaSource: listingMediaSourceSchema.optional(),
  galleryPhotos: galleryPhotosField.optional(),
  captureId: z.string().uuid().optional(),
  videoPath: z.string().min(1).optional(),
  posterPath: z.string().min(1).optional(),
  documentPath: z.string().min(1).optional(),
}).strict().superRefine((value, context) => {
  if (value.mediaSource === 'approved_gallery' && value.captureId) context.addIssue({ code: 'custom', path: ['captureId'], message: 'Gallery media has no recording-location capture.' })
  if (value.mediaSource !== 'approved_gallery' && value.galleryPhotos !== undefined) context.addIssue({ code: 'custom', path: ['galleryPhotos'], message: 'Gallery photos require explicit gallery permission.' })
})

// Editing a posted listing: metadata/address/price only — category, video,
// GPS, and documents are the trust anchors and stay padlocked (Item 11).
export const updateListingInputSchema = listingDetailsSchema.extend({
  listingId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative().optional(),
  metadata: z.unknown(),
})

// Per-category form schema (metadata + address + price) shared by the wizard's
// details step and the standalone listing edit form.
export const LISTING_FORM_SCHEMAS = {
  house: houseMetadataSchema.merge(listingDetailsSchema),
  car: carMetadataSchema.merge(listingDetailsSchema),
  boat: boatMetadataSchema.merge(listingDetailsSchema),
} as const

export const LISTING_METADATA_SCHEMAS = { house: houseMetadataSchema, car: carMetadataSchema, boat: boatMetadataSchema } as const
const listingTimestamp = z.string().datetime({ offset: true })
export const ownerListingSummarySchema = z.object({ id: z.string().uuid(), category: z.enum(LISTING_CATEGORIES), title: z.string().max(200), status: z.string().min(1).max(80),
  price: z.string().max(100), pricePeriod: z.string().max(20), createdAt: listingTimestamp, hasVideo: z.boolean(), hasDocument: z.boolean(), archivedAt: listingTimestamp.nullable().optional().default(null),
  mediaSource: listingMediaSourceSchema.optional(), galleryPhotos: galleryPhotosField.optional(),
}).strict()
export const ownerListingPageSchema = z.object({ items: z.array(ownerListingSummarySchema).max(50), nextCursor: z.string().max(100).nullable(), limit: z.number().int().min(1).max(50) }).strict()
export const ownerVaultItemSchema = ownerListingSummarySchema.extend({ area: z.string().min(1).max(80) })
export const ownerVaultPageSchema = z.object({ items: z.array(ownerVaultItemSchema).max(50), nextCursor: z.string().max(100).nullable(), limit: z.number().int().min(1).max(50) }).strict()
export const ownerListingDetailSchema = z.object({ id: z.string().uuid(), revision: z.number().int().nonnegative(), category: z.enum(LISTING_CATEGORIES), status: z.string().min(1).max(80),
  address: z.string().max(300), basePrice: z.string().max(20), metadata: z.record(z.string().max(80), z.union([z.string().max(1500), z.boolean(), z.number().finite(), z.null()])),
  wizardStep: z.enum(DRAFT_WIZARD_STEPS).nullable(), videoPath: z.string().max(500).nullable(), posterPath: z.string().max(500).nullable(), documentPath: z.string().max(500).nullable(), documentName: z.string().max(300).nullable(),
  hasCoords: z.boolean(), captureId: z.string().uuid().nullable().optional().default(null), createdAt: listingTimestamp, updatedAt: listingTimestamp, archivedAt: listingTimestamp.nullable().optional().default(null),
  mediaSource: listingMediaSourceSchema.optional(), galleryPhotos: galleryPhotosField.optional(),
  actions: z.object({ edit: z.boolean(), resume: z.boolean(), archive: z.boolean(), restore: z.boolean() }).strict(),
}).strict()
export const listingMutationResultSchema = z.object({ id: z.string().uuid(), status: z.string().min(1).max(80) }).strict()
export const ownerDocumentSchema = z.object({ url: z.string().url(), expiresAt: listingTimestamp }).strict()
export const uploadedObjectInfoSchema = z.object({ path: z.string().min(1).max(500), size: z.number().int().positive().max(200 * 1024 * 1024), contentType: z.string().max(80) }).strict()
export type OwnerListingDetail = z.infer<typeof ownerListingDetailSchema>
export type OwnerListingSummary = z.infer<typeof ownerListingSummarySchema>
