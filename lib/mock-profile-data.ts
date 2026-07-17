// Mock fixtures for the marketplace profile page.
//
// The `profiles` table (real, via lib/profile-data.ts) only carries identity
// fields today. Listings, transactions, escrow, and trust-score tables are
// Phase 3-5 of build-plan.md and don't exist yet, so every stat below is
// mocked but deterministically seeded per-username so the same profile
// always renders the same numbers instead of reshuffling on every request.

function seedFromUsername(username: string): number {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0
  }
  return hash
}

export type MockTrustProfile = {
  trustScore: string
  ghostListings: number
  avgResponseMinutes: number
  showUpRatePercent: number
  verifiedSinceYear: number
  listingsCount: number
  followersCount: number
  handshakesCount: number
  rentalsCompleted: number
  onTimePayments: number
  verifiedInspections: number
  topPercentLabel: string
}

export function getMockTrustProfile(username: string): MockTrustProfile {
  const seed = seedFromUsername(username)

  return {
    trustScore: (4.4 + (seed % 60) / 100).toFixed(2),
    ghostListings: 0,
    avgResponseMinutes: 8 + (seed % 20),
    showUpRatePercent: 92 + (seed % 8),
    verifiedSinceYear: 2025,
    listingsCount: 6 + (seed % 24),
    followersCount: 200 + (seed % 1800),
    handshakesCount: 40 + (seed % 200),
    rentalsCompleted: 1 + (seed % 6),
    onTimePayments: 10 + (seed % 30),
    verifiedInspections: 2 + (seed % 10),
    topPercentLabel: `Top ${5 + (seed % 20)}%`,
  }
}

export type MockListing = {
  id: string
  title: string
  price: string
  priceDenomination: string
  posterUrl: string
  badges: string[]
}

export const MOCK_LISTINGS: MockListing[] = [
  {
    id: '1',
    title: 'Luxury 3-Bed Villa with Pool',
    price: '4,500,000',
    priceDenomination: 'YEAR',
    posterUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
    badges: ['3 Beds', '4 Baths', 'Ikoyi'],
  },
  {
    id: '2',
    title: '2-Bed Apartment, Ocean View',
    price: '2,800,000',
    priceDenomination: 'YEAR',
    posterUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
    badges: ['2 Beds', 'Lekki Ph 1'],
  },
  {
    id: '3',
    title: 'Shortlet Studio, Victoria Island',
    price: '85,000',
    priceDenomination: 'NIGHT',
    posterUrl: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
    badges: ['Studio', 'VI'],
  },
  {
    id: '4',
    title: '4-Bed Semi-Detached Duplex',
    price: '6,200,000',
    priceDenomination: 'YEAR',
    posterUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
    badges: ['4 Beds', 'Chevron'],
  },
  {
    id: '5',
    title: '3-Bed Terrace, Gated Estate',
    price: '3,600,000',
    priceDenomination: 'YEAR',
    posterUrl: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80',
    badges: ['3 Beds', 'Ikate'],
  },
  {
    id: '6',
    title: 'Penthouse Shortlet, Oniru',
    price: '150,000',
    priceDenomination: 'NIGHT',
    posterUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
    badges: ['2 Beds', 'Oniru'],
  },
]

export type MockEscrowActivity = {
  id: string
  label: string
  amountLabel: string
  direction: 'in' | 'out' | 'held'
}

export const MOCK_ESCROW_WALLET = {
  balanceNgn: '185,000.00',
  activity: [
    { id: '1', label: 'Inspection fee · Lekki Ph 1', amountLabel: '-₦5,000 held', direction: 'held' },
    { id: '2', label: 'Handshake refund · Surulere', amountLabel: '+₦5,000', direction: 'in' },
    { id: '3', label: 'Wallet top-up · OPay', amountLabel: '+₦150,000', direction: 'in' },
  ] satisfies MockEscrowActivity[],
}

export const MOCK_ACTIVE_LEASE = {
  title: '2-Bed Apartment',
  address: 'Herbert Macaulay Way, Yaba',
  rentNgn: '2,400,000',
  status: 'In good standing',
  monthsPaid: 7,
  monthsTotal: 12,
  renewsOn: '01 Mar 2027',
  nextPaymentNgn: '200,000',
  nextPaymentDue: '01 Aug',
}

export const MOCK_CREDIT_TRUST = {
  score: 85,
  headline: 'Strong payment history',
  detail: '24 on-time rent payments logged. Your rent is building a verifiable credit profile.',
}

export type MockInspection = {
  id: string
  title: string
  subtitle: string
  day: string
  month: string
  statusLabel: string
  statusTone: 'pending' | 'settled'
}

export const MOCK_INSPECTIONS: MockInspection[] = [
  {
    id: '1',
    title: '1-Bed · Admiralty Way, Lekki Phase 1',
    subtitle: 'Sat 10:00 · GPS handshake settles within 20m',
    day: '18',
    month: 'JUL',
    statusLabel: 'Escrow funded',
    statusTone: 'pending',
  },
  {
    id: '2',
    title: 'Studio shortlet · Bode Thomas, Surulere',
    subtitle: 'Both devices verified on-site · fee released to lister',
    day: '02',
    month: 'JUL',
    statusLabel: 'Settled',
    statusTone: 'settled',
  },
]

export type MockSavedSearch = {
  id: string
  label: string
  detail: string
  alertsOn: boolean
}

export const MOCK_SAVED_SEARCHES: MockSavedSearch[] = [
  { id: '1', label: '1-Bed · Yaba · ≤₦1.5M/yr', detail: '12 new this week', alertsOn: true },
  { id: '2', label: 'Co-living · Surulere', detail: '3 new this week', alertsOn: true },
  { id: '3', label: 'SUV · weekend · ≤₦60k/day', detail: 'Alerts off', alertsOn: false },
]

export const MOCK_SECURITY = {
  twoFactorEnabled: true,
  passwordChangedLabel: 'Changed 2 mo ago',
  activeDevices: 2,
  payoutBankLabel: 'GTBank ••4821',
}

export const MOCK_REVIEWS_COUNT_FALLBACK = 96
