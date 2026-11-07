export const DISCOVERY_PAGE_SIZE = 18
export type DiscoveryCategory = 'all' | 'house' | 'car' | 'boat'
export type DiscoveryCursor = { id: string; createdAt: string }
export type DiscoveryFilters = {
  category: DiscoveryCategory
  q: string
  minPrice: string
  maxPrice: string
  intent: '' | 'rent' | 'buy' | 'squat' | 'shortlet'
  state: string
  bedrooms: string
  bathrooms: string
  kitchens: string
  transmission: '' | 'automatic' | 'manual'
  seats: string
  capacityPersons: string
  captain: '' | 'yes' | 'no'
  view: 'grid' | 'feed'
  cursor: DiscoveryCursor | null
}
export type DiscoverySearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function price(value: string): string {
  return /^\d{1,10}(\.\d{1,2})?$/.test(value) && Number(value) >= 0 ? value : ''
}

function count(value: string, maximum: number): string {
  return /^\d{1,3}$/.test(value) && Number(value) <= maximum ? String(Number(value)) : ''
}

export function decodeDiscoveryCursor(value: string): DiscoveryCursor | null {
  const [createdAt, id, ...rest] = value.split('~')
  if (rest.length || !id || !createdAt || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const parsed = new Date(createdAt)
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== createdAt ? null : { id, createdAt }
}

export function encodeDiscoveryCursor(cursor: DiscoveryCursor): string {
  return `${cursor.createdAt}~${cursor.id}`
}

export function parseDiscoveryFilters(params: DiscoverySearchParams): DiscoveryFilters {
  const category = first(params.category)
  const minPrice = price(first(params.minPrice))
  const maxPrice = price(first(params.maxPrice))
  const intent = first(params.intent)
  const transmission = first(params.transmission)
  const captain = first(params.captain)
  return {
    category: category === 'house' || category === 'car' || category === 'boat' ? category : 'all',
    q: first(params.q).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 100),
    minPrice,
    maxPrice: minPrice && maxPrice && Number(minPrice) > Number(maxPrice) ? '' : maxPrice,
    intent: intent === 'rent' || intent === 'buy' || intent === 'squat' || intent === 'shortlet' ? intent : '',
    state: first(params.state).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 50),
    bedrooms: count(first(params.bedrooms), 30),
    bathrooms: count(first(params.bathrooms), 30),
    kitchens: count(first(params.kitchens), 20),
    transmission: transmission === 'automatic' || transmission === 'manual' ? transmission : '',
    seats: count(first(params.seats), 100),
    capacityPersons: count(first(params.capacityPersons), 200),
    captain: captain === 'yes' || captain === 'no' ? captain : '',
    view: first(params.view) === 'feed' ? 'feed' : 'grid',
    cursor: decodeDiscoveryCursor(first(params.cursor)),
  }
}

export function discoveryHref(filters: DiscoveryFilters, changes: Partial<DiscoveryFilters> = {}): string {
  const next = { ...filters, ...changes }
  const params = new URLSearchParams()
  if (next.category !== 'all') params.set('category', next.category)
  if (next.q) params.set('q', next.q)
  if (next.minPrice) params.set('minPrice', next.minPrice)
  if (next.maxPrice) params.set('maxPrice', next.maxPrice)
  for (const key of ['intent', 'state', 'bedrooms', 'bathrooms', 'kitchens', 'transmission', 'seats', 'capacityPersons', 'captain'] satisfies (keyof DiscoveryFilters)[]) {
    const value = next[key]
    if (typeof value === 'string' && value) params.set(key, value)
  }
  if (next.view === 'feed') params.set('view', next.view)
  if (next.cursor) params.set('cursor', encodeDiscoveryCursor(next.cursor))
  return `/marketplace${params.size ? `?${params.toString()}` : ''}`
}

export function discoveryHasFilters(filters: DiscoveryFilters): boolean {
  return filters.category !== 'all' || Boolean(filters.q || filters.minPrice || filters.maxPrice || filters.intent || filters.state || filters.bedrooms || filters.bathrooms || filters.kitchens || filters.transmission || filters.seats || filters.capacityPersons || filters.captain)
}

// Public discovery names a neighborhood, never the recorded address or GPS point.
export function discoveryLocation(address: string | null): string {
  if (!address) return 'Lagos, Nigeria'
  const neighborhoods = ['Victoria Island', 'Lekki', 'Ikoyi', 'Yaba', 'Ikeja', 'Surulere', 'Ajah', 'Gbagada', 'Maryland', 'Ilashe', 'Epe', 'Sangotedo', 'Banana Island', 'Magodo', 'Festac', 'Ikorodu']
  const normalized = address.toLowerCase()
  const neighborhood = neighborhoods.find(name => normalized.includes(name.toLowerCase()))
  return neighborhood ? `${neighborhood}, Lagos` : 'Lagos, Nigeria'
}
