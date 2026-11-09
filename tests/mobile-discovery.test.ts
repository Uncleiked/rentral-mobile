import{beforeEach,expect,it,vi}from'vitest'
const fixture=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('../apps/mobile/src/lib/api',()=>({api:fixture.request,ApiError:class ApiError extends Error{constructor(message:string,public readonly code:string,public readonly status:number){super(message)}}}))
import{ApiError}from'../apps/mobile/src/lib/api'
import{discoveryApiPath,discoveryCategoryChange,discoveryFilterError,discoveryPageSchema,discoveryRouteParams,emptyDiscoveryFilters,listingPriceLabel,normalizedDiscoveryFilters,saveDiscoveryListing,visibleFeedIndex,visibleFeedListing}from'../apps/mobile/src/lib/discovery-input'
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const date='2030-01-01T10:00:00.000Z'
const listing={id,title:'Fixture home',category:'house',location:'Yaba, Lagos',price:'500,000',pricePeriod:'year',intent:'rent',posterUrl:null,videoUrl:null,useMux:false,badges:['2 beds'],saved:false,savingAvailable:true,holdUntil:null,host:{username:'fixture_host',avatarUrl:null,identityVerified:false}}
beforeEach(()=>{fixture.request.mockReset()})
it('activates only the actually visible full-height feed page across scroll, footer and invalid layouts',()=>{
 expect(visibleFeedIndex(0,698,698,2)).toBe(0)
 expect(visibleFeedIndex(767,698,698,2)).toBe(1)
 expect(visibleFeedIndex(1396,698,698,2)).toBeNull()
 expect(visibleFeedIndex(0,698,698,0)).toBeNull()
 expect(visibleFeedIndex(0,0,698,2)).toBeNull()
 expect(visibleFeedIndex(Number.NaN,698,698,2)).toBeNull()
})
it('serializes documented filters through the shared marketplace policy and encodes free text safely',()=>{
 const filters=normalizedDiscoveryFilters({category:'house',q:'Yaba & Lekki',state:'Lagos',intent:'shortlet',bedrooms:'0',bathrooms:'2',kitchens:'1',minPrice:'1000.01',maxPrice:'500000'})
 const url=new URL(discoveryApiPath(filters),'https://rentral.invalid')
 expect(url.pathname).toBe('/listings');expect(url.searchParams.get('q')).toBe('Yaba & Lekki');expect(url.searchParams.get('bedrooms')).toBe('0');expect(url.searchParams.get('intent')).toBe('shortlet')
 expect(discoveryRouteParams(filters)).toMatchObject({q:'Yaba & Lekki',category:'house',state:'Lagos',minPrice:'1000.01',maxPrice:'500000'})
 expect(url.searchParams.has('latitude')).toBe(false);expect(url.searchParams.has('longitude')).toBe(false)
})
it('clears incompatible category filters and old cursors before a new discovery request',()=>{
 const filters={...emptyDiscoveryFilters(),category:'house' as const,bedrooms:'2',bathrooms:'1',kitchens:'1',transmission:'manual' as const,seats:'4',capacityPersons:'8',captain:'yes' as const,cursor:{id,createdAt:date}}
 const next=discoveryCategoryChange(filters,'car')
 expect(next).toMatchObject({category:'car',bedrooms:'',bathrooms:'',kitchens:'',transmission:'manual',seats:'4',capacityPersons:'',captain:'',cursor:null})
 expect(discoveryApiPath(next)).not.toMatch(/bedrooms|bathrooms|kitchens|captain|capacityPersons|cursor/)
})
it('does not silently broaden a reversed budget or accept decimal counts',()=>{
 expect(discoveryFilterError({...emptyDiscoveryFilters(),minPrice:'900719.92',maxPrice:'900719.91'})).toContain('maximum budget')
 expect(discoveryFilterError({...emptyDiscoveryFilters(),bedrooms:'1.5'})).toContain('exact bedrooms')
 expect(discoveryFilterError({...emptyDiscoveryFilters(),capacityPersons:'201'})).toContain('200')
})
it.each(['-1','1,000','1e9','1.234','10000000000'])('rejects unsupported filter amount%s rather than letting the server drop it',value=>{
 expect(discoveryFilterError({...emptyDiscoveryFilters(),minPrice:value})).toBeTruthy()
})
it('accepts a zero minimum and exact decimal boundary without floating-point rounding',()=>{
 expect(discoveryFilterError({...emptyDiscoveryFilters(),minPrice:'0',maxPrice:'9999999999.99'})).toBeNull()
})
it('validates listing archives and timestamp-tie cursors before rendering or appending',()=>{
 const result=discoveryPageSchema.parse({items:[listing],pagination:{limit:18,nextCursor:`${date}~${id}`}})
 expect(result.nextCursor).toBe(`${date}~${id}`);expect(result.items[0].host.username).toBe('fixture_host')
 expect(discoveryPageSchema.safeParse({items:[listing],pagination:{limit:18,nextCursor:'invalid-cursor'}}).success).toBe(false)
 expect(discoveryPageSchema.safeParse({items:[{...listing,id:'not-a-uuid'}],pagination:{limit:18,nextCursor:null}}).success).toBe(false)
})
it('uses one actually visible item and never falls back to an off-screen first item',()=>{
 const items=[{id},{id:other}],path='/listings?category=house'
 expect(visibleFeedListing(path,null,items)).toBeNull()
 expect(visibleFeedListing(path,{path,id:null},items)).toBeNull()
 expect(visibleFeedListing(path,{path,id:other},items)).toBe(other)
 expect(visibleFeedListing('/listings?category=car',{path,id},items)).toBeNull()
 expect(visibleFeedListing(path,{path,id:other},[{id}])).toBeNull()
})
it('saves only the chosen listing for the captured account and validates the resulting state',async()=>{
 fixture.request.mockResolvedValueOnce({saved:true}).mockResolvedValueOnce({saved:false})
 expect(await saveDiscoveryListing(id,true,other)).toEqual({saved:true})
 expect(fixture.request).toHaveBeenLastCalledWith(`/saved/${id}`,{method:'PUT',expectedUserId:other})
 await expect(saveDiscoveryListing(id,true,other)).rejects.toMatchObject({code:'INVALID_RESPONSE'})
})
it('never automatically retries an ambiguous save state change',async()=>{
 fixture.request.mockRejectedValue(new ApiError('Unknown save result','NETWORK_ERROR',0))
 await expect(saveDiscoveryListing(id,true,other)).rejects.toMatchObject({status:0})
 expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('labels actual formatted naira prices and does not invent an amount from invalid display text',()=>{
 expect(listingPriceLabel('500,000')).toBe('₦500,000');expect(listingPriceLabel('₦1,500')).toBe('₦1,500')
 for(const value of['—','NaN','₦fake','1,,000'])expect(listingPriceLabel(value)).toBe('Price unavailable')
})
