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
