import { z } from 'zod'
import { sessionStorage } from './session-storage'
import { discoveryFilterError, discoveryRouteParams, normalizedDiscoveryFilters, type DiscoveryFilters } from './discovery-input'

const searchSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(60), params: z.record(z.string(), z.string()), createdAt: z.string().datetime({ offset: true }) }).strict()
const savedSchema = z.object({ version: z.literal(1), actorId: z.string().uuid(), items: z.array(searchSchema).max(20) }).strict()
export type DeviceSavedSearch = z.infer<typeof searchSchema>
export function deviceSearchDescription(params: Record<string, string>): string {
  const value = normalizedDiscoveryFilters(params)
  const labels = [value.category === 'house' ? 'Homes' : value.category === 'car' ? 'Cars' : value.category === 'boat' ? 'Boats' : 'All assets']
  if (value.q) labels.push(value.q)
  if (value.state) labels.push(value.state)
  if (value.intent) labels.push(({ rent: 'For rent', buy: 'For sale', squat: 'Shared home', shortlet: 'Short let' } as Record<string, string>)[value.intent] ?? value.intent)
  if (value.minPrice || value.maxPrice) labels.push(value.minPrice && value.maxPrice ? `₦${value.minPrice}–₦${value.maxPrice}` : value.minPrice ? `From ₦${value.minPrice}` : `Up to ₦${value.maxPrice}`)
  for (const [key, label] of [['bedrooms', 'bedrooms'], ['bathrooms', 'bathrooms'], ['kitchens', 'kitchens'], ['seats', 'seats'], ['capacityPersons', 'guests']] as const) if (value[key] !== '') labels.push(`${value[key]} ${label}`)
  if (value.transmission) labels.push(value.transmission === 'manual' ? 'Manual transmission' : 'Automatic transmission')
  if (value.captain) labels.push(value.captain === 'yes' ? 'Captain included' : 'No captain')
  if (value.view === 'feed') labels.push('Walkthrough feed')
  return labels.join(' · ')
}
const key = (actorId: string): string => `rentral.searches.${z.string().uuid().parse(actorId)}`
const queues = new Map<string, Promise<unknown>>()
function serialized<T>(actorId: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(actorId) ?? Promise.resolve()).catch(() => undefined).then(run)
  queues.set(actorId, next)
  void next.finally(() => { if (queues.get(actorId) === next) queues.delete(actorId) }).catch(() => undefined)
  return next
}
function safeSearch(value: DeviceSavedSearch): DeviceSavedSearch {
  const filters = normalizedDiscoveryFilters(value.params)
  const error = discoveryFilterError(filters)
  const params = discoveryRouteParams(filters)
  if (error || Object.keys(params).length !== Object.keys(value.params).length || Object.entries(params).some(([key, item]) => item !== value.params[key])) throw new Error('A saved search could not be confirmed. Clear this device’s saved searches before saving new ones.')
  return { ...value, params }
}
async function read(actorId: string): Promise<DeviceSavedSearch[]> {
  const value = await sessionStorage.getItem(key(actorId))
  if (value === null) return []
  let json: unknown
  try { json = JSON.parse(value) } catch { throw new Error('Saved searches could not be read on this device.') }
  const saved = savedSchema.safeParse(json)
  if (!saved.success || saved.data.actorId !== actorId) throw new Error('Saved searches could not be confirmed for your account.')
  return saved.data.items.map(safeSearch)
}
export function loadDeviceSavedSearches(actorId: string): Promise<DeviceSavedSearch[]> { return serialized(actorId, () => read(actorId)) }
export function saveDeviceSearch(actorId: string, input: { id: string; name: string; filters: DiscoveryFilters }): Promise<DeviceSavedSearch[]> {
  return serialized(actorId, async () => {
    const invalid = discoveryFilterError(input.filters)
    if (invalid) throw new Error(invalid)
    const filters = normalizedDiscoveryFilters(discoveryRouteParams(input.filters))
    const error = discoveryFilterError(filters)
    if (error) throw new Error(error)
    const parsed = searchSchema.safeParse({ id: input.id, name: input.name, params: discoveryRouteParams(filters), createdAt: new Date().toISOString() })
    if (!parsed.success) throw new Error('Name this search using one to sixty characters.')
    const item = parsed.data
    const previous = await read(actorId)
    if (previous.some(search => search.id !== item.id && search.name.toLocaleLowerCase() === item.name.toLocaleLowerCase())) throw new Error('Use a different name for this saved search.')
    const items = [item, ...previous.filter(search => search.id !== item.id)]
    if (items.length > 20) throw new Error('You can keep twenty searches on this device. Remove one before saving another.')
    await sessionStorage.setItem(key(actorId), JSON.stringify(savedSchema.parse({ version: 1, actorId, items })))
    return items
  })
}
export function removeDeviceSavedSearch(actorId: string, searchId: string): Promise<DeviceSavedSearch[]> {
  return serialized(actorId, async () => {
    const items = (await read(actorId)).filter(search => search.id !== searchId)
    await sessionStorage.setItem(key(actorId), JSON.stringify({ version: 1, actorId, items }))
    return items
  })
}
export function clearDeviceSavedSearches(actorId: string): Promise<void> { return serialized(actorId, () => sessionStorage.removeItem(key(actorId))) }
