export type Listing = {
  id: string; title: string; category: 'house' | 'car' | 'boat'; location: string; price: string; pricePeriod: string
  intent: string; posterUrl: string | null; videoUrl: string | null; useMux: boolean
  badges: string[]; saved: boolean; savingAvailable: boolean; holdUntil: string | null
  host: { username: string; avatarUrl: string | null; identityVerified: boolean }
}
export type ListingDetails = Listing & {
  status: string; isOwner: boolean; metadata: Record<string, string | number | boolean | null>; postedOn: string
  host: Listing['host'] & { bio: string | null; memberSince: string; accountType: string }
}
export type ListingPage = { items: Listing[]; pagination: { limit: number; nextCursor: string | null } }
export type Booking = {
  id: string; kind: 'inspection' | 'rental' | 'hold'; status: string; startsAt: string; endsAt: string
  amountKobo: string; holdCreditKobo: string; payableKobo: string; currency: string; createdAt: string
  role: 'renter' | 'host'; listing: { id: string; category: string; location: string }
  renter: { username: string | null }; host: { username: string | null }; settlementStatus: string
}
export type Conversation = { id: string; listingId: string; updatedAt: string; otherName: string; lastMessage: string | null; unread?: boolean }
export type Message = { id: string; senderId: string; body: string; sentAt: string; sharedListing: { id: string; category: string } | null }
export type Thread = { id: string; userId: string; listingId: string; otherName: string; otherReadAt: string | null; hasMore: boolean; messages: Message[] }
export type Profile = { id: string; email: string; username: string | null; bio: string | null; avatarUrl: string | null; accountType: string | null; memberSince: string }
