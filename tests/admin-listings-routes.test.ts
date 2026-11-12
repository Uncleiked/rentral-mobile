import { beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/http'
const state=vi.hoisted(()=>({identity:vi.fn(),search:vi.fn(),export:vi.fn()}))
vi.mock('@/lib/api/auth',()=>({requireApiIdentity:state.identity}))
vi.mock('@/lib/operations/admin-listings',()=>({searchAdminListings:state.search,exportAdminListings:state.export}))
import { GET as search } from '@/app/api/v1/admin/listings/route'
import { GET as download } from '@/app/api/v1/admin/listings/export/route'
const actor='11111111-1111-4111-8111-111111111111'
beforeEach(()=>{
 state.identity.mockReset().mockResolvedValue({userId:actor});state.search.mockReset().mockResolvedValue({items:[],nextCursor:null,hasMore:false,total:0})
 state.export.mockReset().mockResolvedValue({csv:'safe,csv\r\n',rows:1000,total:1200,truncated:true,generatedAt:'2026-11-12T12:00:00.000Z'})
})
it('passes validated staff search filters and disables caching',async()=>{
 const response=await search(new Request('http://localhost:3000/api/v1/admin/listings?query=host%40example.invalid&source=approved_gallery&limit=10'))
 expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toContain('no-store')
 expect(state.search).toHaveBeenCalledWith(actor,expect.objectContaining({query:'host@example.invalid',source:'approved_gallery',limit:10,status:'review'}))
 expect(state.identity).toHaveBeenCalledWith(expect.any(Request),{admission:false,platform:true})
})
it('rejects repeated/unknown/draft query parameters before listing search',async()=>{
 for(const query of ['query=one&query=two','status=draft','limit=500','query[$where]=anything']){
  const response=await search(new Request('http://localhost:3000/api/v1/admin/listings?'+query))
  expect(response.status).toBe(400)
 }
 expect(state.search).not.toHaveBeenCalled()
})
it('requires authentication before search or export',async()=>{
 state.identity.mockRejectedValue(new ApiError(401,'UNAUTHORIZED','Sign in first.'))
 expect((await search(new Request('http://localhost:3000/api/v1/admin/listings'))).status).toBe(401)
 expect((await download(new Request('http://localhost:3000/api/v1/admin/listings/export'))).status).toBe(401)
 expect(state.search).not.toHaveBeenCalled();expect(state.export).not.toHaveBeenCalled()
})
it('returns a private CSV attachment with explicit export scope/truncation metadata',async()=>{
 const response=await download(new Request('http://localhost:3000/api/v1/admin/listings/export?status=all&category=house'))
 expect(response.status).toBe(200);expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
 expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="rentral-listings.csv"')
 expect(response.headers.get('Cache-Control')).toContain('no-store')
 expect(response.headers.get('X-Rentral-Export-Rows')).toBe('1000');expect(response.headers.get('X-Rentral-Export-Matched')).toBe('1200')
 expect(response.headers.get('X-Rentral-Export-Truncated')).toBe('true')
 expect(await response.text()).toBe('safe,csv\r\n')
 expect(state.export).toHaveBeenCalledWith(actor,expect.objectContaining({status:'all',category:'house'}))
})
it('does not offer client-controlled export size/cursor/file names or leak a denied export',async()=>{
 for(const query of ['limit=100000','cursor=old','filename=private.csv'])expect((await download(new Request('http://localhost:3000/api/v1/admin/listings/export?'+query))).status).toBe(400)
 expect(state.export).not.toHaveBeenCalled()
 state.export.mockRejectedValue(new ApiError(403,'STAFF_REQUIRED','Listing review permission is required.'))
 const response=await download(new Request('http://localhost:3000/api/v1/admin/listings/export'))
 expect(response.status).toBe(403);expect(response.headers.get('Content-Disposition')).toBeNull()
})
