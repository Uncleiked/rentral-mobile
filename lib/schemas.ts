import { z } from 'zod'

// Strict regex validations to prevent script injection
const phoneRegex = /^\+?[0-9]+$/
const lettersOnlyRegex = /^[a-zA-Z\s]+$/

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
export const houseMetadataSchema = z.object({
  bedrooms: z.string().min(1, "Bedrooms is required"),
  bathrooms: z.string().min(1, "Bathrooms is required"),
  sizeSqm: z.string().min(1, "Size is required"),
  amenities: z.string().max(280, "Amenities must be 280 characters or fewer."),
})

export const carMetadataSchema = z.object({
  transmission: z.enum(['automatic', 'manual'], { message: "Select a transmission type" }),
  mileageKm: z.string().min(1, "Mileage is required"),
  seats: z.string().min(1, "Seat count is required"),
  fuelType: z.string().min(1, "Fuel type is required"),
})

export const boatMetadataSchema = z.object({
  vesselType: z.string().min(1, "Vessel type is required"),
  capacityPersons: z.string().min(1, "Capacity is required"),
  hasCaptain: z.boolean(),
})

export const listingDetailsSchema = z.object({
  address: z.string().min(5, "Address is required"),
  basePrice: z.string().min(1, "Base price is required"),
})
