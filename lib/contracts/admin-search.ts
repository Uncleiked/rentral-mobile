import { z } from 'zod'
import { adminListingSchema } from './admin'

export const ADMIN_LISTING_STATUSES = ['review', 'all', 'pending_verification', 'active', 'suspended', 'on_hold', 'rented'] as const
export const ADMIN_LISTING_PAGE_LIMIT = 50
export const ADMIN_LISTING_EXPORT_LIMIT = 1000
const filters = {
  query: z.string().trim().max(254).optional().default(''),
  status: z.enum(ADMIN_LISTING_STATUSES).optional().default('review'),
  category: z.enum(['all', 'house', 'car', 'boat']).optional().default('all'),
  source: z.enum(['all', 'recorded', 'approved_gallery']).optional().default('all'),
  fee: z.enum(['all', 'waived', 'paid', 'unpaid']).optional().default('all'),
  listerId: z.uuid().optional(),
  archived: z.enum(['exclude', 'include', 'only']).optional().default('exclude'),
  sort: z.enum(['newest', 'oldest']).optional().default('newest'),
}
export const adminListingSearchSchema = z.object({
  ...filters,
  cursor: z.string().min(1).max(600).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(ADMIN_LISTING_PAGE_LIMIT).optional().default(25),
}).strict()
export const adminListingExportSearchSchema = z.object(filters).strict()
export const adminListingPageSchema = z.object({
  items: z.array(adminListingSchema).max(ADMIN_LISTING_PAGE_LIMIT),
  nextCursor: z.string().max(600).nullable(),
  hasMore: z.boolean(),
  total: z.number().int().nonnegative().safe(),
}).strict()
export type AdminListingSearch = z.infer<typeof adminListingSearchSchema>
export type AdminListingExportSearch = z.infer<typeof adminListingExportSearchSchema>
export type AdminListingPage = z.infer<typeof adminListingPageSchema>
