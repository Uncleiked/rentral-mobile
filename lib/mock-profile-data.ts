// Mock fixtures for the marketplace profile page.
//
// The `profiles` table (real, via lib/profile-data.ts) only carries identity
// fields today. Trust stats and listings are now computed for real via
// getTrustSummary() / getListingsForProfile() in lib/profile-data.ts.
// Transactions and escrow tables are Phase 3-5 of build-plan.md and don't
// exist yet, so everything below is still mocked but deterministically
// seeded per-username so the same profile always renders the same numbers
// instead of reshuffling on every request.

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
