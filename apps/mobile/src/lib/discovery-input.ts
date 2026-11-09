import { z } from 'zod'
import { decodeDiscoveryCursor, discoveryHref, parseDiscoveryFilters, type DiscoveryCategory, type DiscoveryFilters, type DiscoverySearchParams } from '../../../../lib/discovery-policy'
import { publicListingSchema } from './member-contracts'
import { api, ApiError } from './api'

export { parseDiscoveryFilters }
export type { DiscoveryCategory, DiscoveryFilters }
export const emptyDiscoveryFilters = (): DiscoveryFilters => parseDiscoveryFilters({})
export const discoveryPageSchema = z.object({ items: z.array(publicListingSchema).max(18), pagination: z.object({ limit: z.literal(18), nextCursor: z.string().max(100).nullable().refine(value => value===null||decodeDiscoveryCursor(value)!==null) }) })
  .transform(page => ({ items:page.items, nextCursor:page.pagination.nextCursor, limit:page.pagination.limit }))
const pricePattern=/^\d{1,10}(?:\.\d{1,2})?$/
function filterKobo(value:string):bigint { const[whole,fraction='']=value.split('.');return BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0')) }
export function discoveryFilterError(filters: DiscoveryFilters): string | null {
  if ([filters.minPrice,filters.maxPrice].some(value=>value!==''&&!pricePattern.test(value))) return 'Enter budget amounts in naira, up to ten whole digits and two decimal places.'
  if (filters.minPrice&&filters.maxPrice&&filterKobo(filters.minPrice)>filterKobo(filters.maxPrice)) return 'The maximum budget must be at least the minimum budget.'
  for(const[key,max]of[['bedrooms',30],['bathrooms',30],['kitchens',20],['seats',100],['capacityPersons',200]]as const){const value=filters[key];if(value!==''&&(!/^\d{1,3}$/.test(value)||Number(value)>max))return `Use an exact ${key==='capacityPersons'?'guest capacity':key} count from 0 to ${max}.`}
  return null
}
export function discoveryCategoryChange(filters: DiscoveryFilters, category: DiscoveryCategory): DiscoveryFilters {
  return { ...filters,category,cursor:null,bedrooms:category==='house'?filters.bedrooms:'',bathrooms:category==='house'?filters.bathrooms:'',kitchens:category==='house'?filters.kitchens:'',transmission:category==='car'?filters.transmission:'',seats:category==='car'?filters.seats:'',capacityPersons:category==='boat'?filters.capacityPersons:'',captain:category==='boat'?filters.captain:'' }
}
export function normalizedDiscoveryFilters(params: DiscoverySearchParams): DiscoveryFilters {
  const parsed=parseDiscoveryFilters(params)
  return discoveryCategoryChange({...parsed,cursor:null},parsed.category)
}
export function discoveryRouteParams(filters: DiscoveryFilters): Record<string,string> {
  return Object.fromEntries(new URLSearchParams(discoveryHref({...filters,cursor:null}).split('?')[1]??''))
}
export function discoveryApiPath(filters: DiscoveryFilters): string {
  return discoveryHref({...filters,cursor:null}).replace(/^\/marketplace/,'/listings')
}
export function discoveryFilterCount(filters: DiscoveryFilters): number {
  return Object.entries(filters).filter(([key,value])=>!['view','cursor'].includes(key)&&(key==='category'?value!=='all':Boolean(value))).length
}
export function listingPriceLabel(value:string): string { const amount=value.replace(/^₦/,'');return /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(amount)?`₦${amount}`:'Price unavailable' }
/** Full-height pages have exact geometry; an off-screen footer never activates a player. */
export function visibleFeedIndex(offset: number, viewport: number, itemHeight: number, count: number): number | null {
  if (![offset, viewport, itemHeight].every(Number.isFinite) || offset < 0 || viewport <= 0 || itemHeight <= 0 || count <= 0) return null
  const index = Math.min(count - 1, Math.floor((offset + viewport / 2) / itemHeight))
  const visible = Math.min(offset + viewport, (index + 1) * itemHeight) - Math.max(offset, index * itemHeight)
  return visible >= itemHeight / 2 ? index : null
}
export function visibleFeedListing(path:string,visible:{path:string;id:string|null}|null,items:{id:string}[]):string|null{
  return visible?.path===path&&items.some(item=>item.id===visible.id)?visible.id:null
}
export async function saveDiscoveryListing(id:string,saved:boolean,actorId:string){
  const result=await api<unknown>(`/saved/${encodeURIComponent(id)}`,{method:saved?'PUT':'DELETE',expectedUserId:actorId})
  const parsed=z.object({saved:z.boolean()}).safeParse(result)
  if(!parsed.success||parsed.data.saved!==saved)throw new ApiError('This saved-listing change could not be confirmed. Refresh before continuing.','INVALID_RESPONSE',200)
  return parsed.data
}
