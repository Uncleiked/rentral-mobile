import { z } from 'zod'

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

export { houseMetadataSchema, carMetadataSchema, boatMetadataSchema, listingDetailsSchema, saveListingInputSchema, saveDraftInputSchema, updateListingInputSchema, LISTING_FORM_SCHEMAS } from './contracts/listings'
