import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminListingSchema } from '@/lib/contracts/admin'
import { adminListingExportSearchSchema, adminListingSearchSchema } from '@/lib/contracts/admin-search'
const state = vi.hoisted(() => ({ permission: vi.fn(), ready: vi.fn(), aggregate: vi.fn(), rows: vi.fn(), views: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { listing: { aggregateRaw: state.aggregate, findMany: state.rows } } }))
vi.mock('@/lib/auth/roles', () => ({ hasStaffPermission: state.permission }))
vi.mock('@/lib/database/readiness', () => ({ assertOwnerAdminReady: state.ready }))
vi.mock('@/lib/payments/config', () => ({ paymentsEnabled: () => false }))
vi.mock('@/lib/operations/admin-console', () => ({ listingSelect: { id: true }, listingViews: state.views }))
import { adminCsvCell, adminListingPipeline, adminListingsCsv, escapeAdminSearch, exportAdminListings, searchAdminListings } from '@/lib/operations/admin-listings'

const actor = '11111111-1111-4111-8111-111111111111', host = '22222222-2222-4222-8222-222222222222'
const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const at = '2026-11-12T12:00:00.000Z'
function listing(id = first) {
 return adminListingSchema.parse({ id, revision: 0, category: 'house', title: 'Bright studio', address: 'Yaba, Lagos', status: 'pending_verification', source: 'approved_gallery', archived: false, createdAt: at,
  lister: { id: host, username: 'studio_host' }, document: { present: true, status: 'pending', approvalMatches: false }, media: { hasVideo: false, photoCount: 2, status: null }, locationStatus: 'exempt_gallery', fee: { waived: false, paid: false } })
}
beforeEach(() => {
 state.permission.mockReset().mockResolvedValue(true);state.ready.mockReset().mockResolvedValue(undefined)
 state.aggregate.mockReset().mockResolvedValue([{ items: [{id:first,at}], total: [{count:1}] }])
 state.rows.mockReset().mockResolvedValue([{id:first}]);state.views.mockReset().mockImplementation(async rows => rows.map((row:{id:string})=>listing(row.id)))
})
afterEach(()=>vi.restoreAllMocks())

describe('admin listing filters and literal search',()=>{
 it('defaults to the submitted review queue and strictly rejects draft/operator/unbounded requests',()=>{
  expect(adminListingSearchSchema.parse({})).toMatchObject({status:'review',archived:'exclude',limit:25})
  for(const invalid of [{status:'draft'},{limit:51},{query:['one','two']},{'$where':'private operator'},{sort:'random'},{category:'unknown'},{listerId:'not-a-uuid'}])expect(adminListingSearchSchema.safeParse(invalid).success).toBe(false)
  expect(adminListingExportSearchSchema.safeParse({cursor:'old'}).success).toBe(false)
 })
 it('searches JSON titles and host email/username without treating regex characters as operators',()=>{
  const query='studio.*[owner]$'
  expect(escapeAdminSearch(query)).toBe('studio\\.\\*\\[owner\\]\\$')
  const pipeline=adminListingPipeline(adminListingSearchSchema.parse({query}),25,null)
  expect(pipeline[0]).toEqual({$match:{listing_status:'pending_verification',publication_mode:{$ne:'trusted_publisher'},archived_at:null}})
  expect(pipeline[1]).toEqual({$lookup:{from:'User',let:{hostId:'$lister_id'},as:'__adminHost',pipeline:[{$match:{$expr:{$eq:['$_id','$$hostId']}}},{$project:{_id:0,username:1,email:1}}]}})
  const serialized=JSON.stringify(pipeline)
  expect(serialized).toContain('asset_metadata.listingTitle');expect(serialized).toContain('__adminHost.email');expect(serialized).toContain('__adminHost.username')
  expect(pipeline).toContainEqual({$match:{$or:expect.arrayContaining([{'asset_metadata.listingTitle':{$regex:escapeAdminSearch(query),$options:'i'}}])}})
  expect(serialized).not.toContain('$where')
 })
 it('accepts one leading @ for a host handle while keeping literal matching bounded and email search unchanged',()=>{
  const pipeline=adminListingPipeline(adminListingSearchSchema.parse({query:'@Studio.*[owner]'}),25,null)
  expect(pipeline).toContainEqual({$match:{$or:expect.arrayContaining([
   {'__adminHost.username':{$regex:'Studio\\.\\*\\[owner\\]',$options:'i'}},
   {'__adminHost.email':{$regex:'@Studio\\.\\*\\[owner\\]',$options:'i'}},
  ])}})
  for(const query of ['@','@@studio']){
   const expected=query==='@'?'@':'@studio'
   expect(adminListingPipeline(adminListingSearchSchema.parse({query}),25,null)).toContainEqual({$match:{$or:expect.arrayContaining([{'__adminHost.username':{$regex:expected,$options:'i'}}])}})
  }
 })
 it('keeps trusted pending submissions out of human review but available to explicit inventory searches',()=>{
  expect(adminListingPipeline(adminListingSearchSchema.parse({status:'pending_verification'}),25,null)[0]).toEqual({$match:{listing_status:'pending_verification',archived_at:null}})
  expect(adminListingPipeline(adminListingSearchSchema.parse({status:'all'}),25,null)[0]).toEqual({$match:{listing_status:{$ne:'draft'},archived_at:null}})
 })
 it('applies complete category/source/host/archive filters before pagination',()=>{
  const pipeline=adminListingPipeline(adminListingSearchSchema.parse({status:'all',category:'car',source:'approved_gallery',listerId:host,archived:'only',sort:'oldest'}),25,null)
  expect(pipeline[0]).toEqual({$match:{listing_status:{$ne:'draft'},category:'car',lister_id:host,media_source:'approved_gallery',archived_at:{$ne:null}}})
  expect(JSON.stringify(pipeline)).toContain('"$sort":{"createdAt":1,"_id":1}')
 })
 it('uses successful exact-fee payment evidence in the correct environment, or a separately recorded waiver',()=>{
  const paid=adminListingPipeline(adminListingSearchSchema.parse({fee:'paid'}),25,'test')
  expect(JSON.stringify(paid)).toContain('"from":"PaymentIntent"')
  expect(JSON.stringify(paid)).toContain('"status":"succeeded"')
  expect(JSON.stringify(paid)).toContain('"provider_environment":"test"')
  expect(JSON.stringify(paid)).toContain('"$eq":["$user_id","$$listerId"]')
  const unpaid=adminListingPipeline(adminListingSearchSchema.parse({fee:'unpaid'}),25,null)
  expect(unpaid).toContainEqual({$match:{__adminFeeWaived:false,'__adminPaidFee.0':{$exists:false}}})
 })
})

describe('current-role server pagination',()=>{
 it('denies access before any listing query',async()=>{
  state.permission.mockResolvedValue(false)
  await expect(searchAdminListings(actor,{})).rejects.toMatchObject({status:403,code:'STAFF_REQUIRED'})
  expect(state.aggregate).not.toHaveBeenCalled();expect(state.rows).not.toHaveBeenCalled()
 })
 it('returns a bounded page and a filter-bound cursor without skipping equal timestamps',async()=>{
  state.aggregate.mockResolvedValue([{items:[{id:first,at},{id:second,at}],total:[{count:3}]}])
  const page=await searchAdminListings(actor,{limit:1,query:'Host'})
  expect(page.items).toHaveLength(1);expect(page.total).toBe(3);expect(page.hasMore).toBe(true);expect(page.nextCursor).toBeTypeOf('string')
  state.aggregate.mockResolvedValue([{items:[{id:second,at}],total:[{count:3}]}]);state.rows.mockResolvedValue([{id:second}])
  const next=await searchAdminListings(actor,{limit:1,query:'host',cursor:page.nextCursor})
  expect(next.items[0].id).toBe(second);expect(next.nextCursor).toBeNull()
  const query=state.aggregate.mock.calls[1][0]
  expect(JSON.stringify(query)).toContain('"$lt":["$_id","'+first+'"]')
  expect(state.rows).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({listing_status:{not:'draft'}})}))
 })
 it('rejects malformed or reused cursors when search/filter scope changes',async()=>{
  await expect(searchAdminListings(actor,{cursor:'not_json'})).rejects.toMatchObject({code:'INVALID_CURSOR'})
  expect(state.aggregate).not.toHaveBeenCalled()
  state.aggregate.mockResolvedValue([{items:[{id:first,at},{id:second,at}],total:[{count:2}]}])
  const page=await searchAdminListings(actor,{limit:1})
  const calls=state.aggregate.mock.calls.length
  await expect(searchAdminListings(actor,{limit:1,status:'all',cursor:page.nextCursor})).rejects.toMatchObject({code:'INVALID_CURSOR'})
  expect(state.aggregate).toHaveBeenCalledTimes(calls)
 })
 it('checks permissions again before releasing a search or export assembled during a revocation',async()=>{
  state.permission.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  await expect(searchAdminListings(actor,{})).rejects.toMatchObject({code:'STAFF_REQUIRED'})
  expect(state.views).toHaveBeenCalled()
 })
 it('returns an empty queue without a hydration lookup',async()=>{
  state.aggregate.mockResolvedValue([{items:[],total:[]}])
  expect(await searchAdminListings(actor,{})).toEqual({items:[],total:0,nextCursor:null,hasMore:false})
  expect(state.rows).not.toHaveBeenCalled()
 })
})

describe('bounded and safe CSV export',()=>{
 it('quotes commas, newlines and quotes and neutralizes formula operators even after controls/whitespace',()=>{
  expect(adminCsvCell('one,"two"\nthree')).toBe('"one,""two""\nthree"')
  for(const input of ['=HYPERLINK("private")',' +sum(1,2)','\t@lookup','\r-1+1'])expect(adminCsvCell(input)).toMatch(/^"'\s*[=+@-]/)
 })
 it('exports only allowlisted listing/business fields',()=>{
  const row={...listing(),title:'=IMPORTDATA("example")',secret:'private-password',documentPath:'private-authority.pdf',bankAccount:'bank-private'}
  const csv=adminListingsCsv([row])
  expect(csv).toContain("'=IMPORTDATA")
  expect(csv).toContain('Listing ID');expect(csv).toContain('studio_host')
  for(const value of ['private-password','private-authority.pdf','bank-private',host])expect(csv).not.toContain(value)
 })
 it('limits a scoped export to1000 rows and explicitly reports a larger matching set',async()=>{
  const hits=Array.from({length:1001},(_,i)=>({id:'00000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),at}))
  state.aggregate.mockResolvedValue([{items:hits,total:[{count:1042}]}])
  state.rows.mockResolvedValue(hits.slice(0,1000))
  const result=await exportAdminListings(actor,{status:'all',category:'boat',listerId:host})
  expect(result.rows).toBe(1000);expect(result.total).toBe(1042);expect(result.truncated).toBe(true)
  expect(state.rows.mock.calls[0][0].where.id.in).toHaveLength(1000)
  expect(JSON.stringify(state.aggregate.mock.calls[0][0].pipeline)).toContain('"$limit":1001')
  expect(result.csv.split('\r\n')).toHaveLength(1002)
 })
})
