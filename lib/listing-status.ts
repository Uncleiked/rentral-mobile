// Single source of truth for the listing lifecycle. The DB column is plain
// TEXT (no Prisma enum), so this module is the only anchor — always reference
// these instead of retyping the literals.
export const LISTING_STATUS = {
  DRAFT: 'draft',
  PENDING_VERIFICATION: 'pending_verification',
  ACTIVE: 'active',
} as const

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS]

// Statuses visible to anyone other than the owner (feed, visitor profiles).
// An `in` filter on these matches the (listing_status, createdAt) index;
// `not: 'draft'` would not.
export const PUBLIC_LISTING_STATUSES: ListingStatus[] = [
  LISTING_STATUS.PENDING_VERIFICATION,
  LISTING_STATUS.ACTIVE,
]
