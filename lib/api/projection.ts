import type { DiscoveryListing, ListingDetails } from '@/lib/discovery'

export function publicListing(listing: DiscoveryListing) {
  return {
    id: listing.id, title: listing.title, category: listing.category, location: listing.location,
    price: listing.price, pricePeriod: listing.priceDenomination, intent: listing.intent,
    posterUrl: listing.posterUrl, videoUrl: listing.videoUrl, useMux: listing.useMux,
    mediaEndpoint: `/api/v1/listings/${encodeURIComponent(listing.id)}/media`,
    badges: listing.badges, saved: listing.saved, savingAvailable: listing.savingAvailable,
    holdUntil: listing.holdUntil ?? null,
    host: { username: listing.username, avatarUrl: listing.avatarUrl, identityVerified: listing.isVerified },
  }
}

export function publicListingDetails(listing: ListingDetails) {
  const metadataKeys = ['listingTitle', 'description', 'bedrooms', 'bathrooms', 'kitchens', 'sizeSqm', 'amenities', 'floors', 'state', 'neighborhood', 'propertyType', 'preferences', 'landlordPreferences', 'transmission', 'mileageKm', 'seats', 'fuelType', 'bodyType', 'engineType', 'insuranceStatus', 'insuranceDetails', 'vesselType', 'capacityPersons', 'hasCaptain', 'lifeJackets', 'safetyEquipment', 'rentalIntent', 'pricePeriod', 'hostCapacity', 'agencyFee', 'legalFee', 'cautionFee', 'serviceCharge']
  const metadata = Object.fromEntries(metadataKeys.flatMap(key => {
    const value = listing.metadata[key]
    return value !== undefined ? [[key, value]] : []
  }))
  return { ...publicListing(listing), status: listing.status, isOwner: listing.isOwner, metadata,
    host: { ...publicListing(listing).host, bio: listing.hostBio, memberSince: listing.hostSince, accountType: listing.hostAccountType },
    postedOn: listing.postedOn,
  }
}
