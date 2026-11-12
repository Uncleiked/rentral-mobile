import type { ListingSummary } from '@/lib/profile-data'

export const OWNER_LISTING_FILTERS = [
  { value: 'all', label: 'All listings' },
  { value: 'draft', label: 'Drafts' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'active', label: 'Live' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'archived', label: 'Archived' },
] as const
export type OwnerListingFilter = typeof OWNER_LISTING_FILTERS[number]['value']

export function ownerListingFilter(value: unknown): OwnerListingFilter {
  return OWNER_LISTING_FILTERS.some(filter => filter.value === value) ? value as OwnerListingFilter : 'all'
}

export function ownerListingGroup(listing: Pick<ListingSummary, 'status' | 'archivedAt'>): Exclude<OwnerListingFilter, 'all'> {
  if (listing.archivedAt) return 'archived'
  if (listing.status === 'draft') return 'draft'
  if (listing.status === 'pending_verification') return 'submitted'
  if (listing.status === 'active') return 'active'
  return 'attention'
}

export function ownerListingStatus(listing: Pick<ListingSummary, 'status' | 'archivedAt'>): string {
  return OWNER_LISTING_FILTERS.find(filter => filter.value === ownerListingGroup(listing))!.label.replace('Drafts', 'Draft')
}

export function filterOwnerListings(listings: ListingSummary[], filter: OwnerListingFilter, search: string): ListingSummary[] {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return listings.filter(listing => (filter === 'all' || ownerListingGroup(listing) === filter)
    && terms.every(term => [listing.title, listing.id, ...listing.badges].join(' ').toLocaleLowerCase().includes(term)))
}

export function ownerListingHref(listing: Pick<ListingSummary, 'id' | 'status' | 'mediaSource' | 'archivedAt'>): string {
  if (listing.status === 'draft' && !listing.archivedAt) {
    return `/marketplace/listing/create?draft=${encodeURIComponent(listing.id)}${listing.mediaSource === 'approved_gallery' ? '&gallery=1' : ''}`
  }
  return `/marketplace/listing/${encodeURIComponent(listing.id)}`
}
