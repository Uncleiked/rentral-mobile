import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ identity: vi.fn(), find: vi.fn(), many: vi.fn(), storageRecord: vi.fn(), info: vi.fn(), sign: vi.fn(), edit: vi.fn(), archive: vi.fn(), ready: vi.fn() }))
vi.mock('@/lib/api/auth', () => ({ requireApiIdentity: fixture.identity }))
vi.mock('@/lib/db', () => ({ default: { listing: { findFirst: fixture.find, findMany: fixture.many }, storageObject: { findFirst: fixture.storageRecord } } }))
vi.mock('@/lib/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: fixture.sign }) } }) }))
vi.mock('@/lib/listings/service', () => ({ updateListingForUser: fixture.edit, setListingArchivedForUser: fixture.archive }))
vi.mock('@/lib/local-storage/core', () => ({ defaultStorageDirectory: () => 'ignored-fixture-directory', createLocalStorage: () => ({ info: fixture.info }) }))
vi.mock('@/lib/storage-claims/service', () => ({ storageObjectId: (bucket: string, path: string) => `${bucket}:${path}` }))
vi.mock('@/lib/database/readiness', () => ({ assertStorageClaimsReady: fixture.ready }))

import { GET as read, PATCH as edit } from '@/app/api/v1/my-listings/[id]/route'
import { GET as document } from '@/app/api/v1/my-listings/[id]/document/route'
import { GET as vault } from '@/app/api/v1/vault/route'
import { GET as uploadInfo } from '@/app/api/v1/uploads/[bucket]/info/route'
import { ApiError } from '@/lib/api/http'
import { ownListingPage } from '@/lib/api/listings'

const actor = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'
const date = new Date('2030-01-01T10:00:00.000Z')
const row = { id, revision: 8, category: 'house', listing_status: 'draft', text_address: 'Fixture address in Yaba', base_rent_amount: 500000, asset_metadata: { bedrooms: '2', bathrooms: '2', sizeSqm: '80', amenities: '', hardware_coordinates: [3.4,6.5], secret: 'private metadata' },
  wizard_step: 'details', video_path: `${actor}/fixture/1_video.mp4`, poster_path: null, document_path: `${actor}/fixture/2_proof.pdf`, privateLocation: { id, geometry: { type: 'Point', coordinates: [3.4,6.5] } }, createdAt: date, updatedAt: date }
const context = { params: Promise.resolve({ id }) }
const request = (path: string) => new Request(`https://rentral.example/api/v1${path}`)
beforeEach(() => {
  vi.resetAllMocks()
  fixture.identity.mockResolvedValue({ userId: actor, mode: 'bearer' })
  fixture.find.mockResolvedValue(row)
  fixture.many.mockResolvedValue([row])
  fixture.ready.mockResolvedValue(undefined)
  fixture.edit.mockResolvedValue({ success: true })
  fixture.archive.mockResolvedValue({ success: true })
  fixture.sign.mockResolvedValue({ data: { signedUrl: 'https://rentral.example/api/v1/files/compliance-docs/fixture?token=purpose-bound' }, error: null })
  fixture.storageRecord.mockResolvedValue({ digest: 'a'.repeat(64), size_bytes: 100, content_type: 'video/mp4' })
  fixture.info.mockResolvedValue({ digest: 'a'.repeat(64), size: 100, contentType: 'video/mp4', createdAt: date.toISOString() })
})
it('returns an owner draft with revision and coordinate-presence only, never raw GPS or unknown metadata', async () => {
  const response = await read(request(`/my-listings/${id}`),context)
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.data).toMatchObject({ id, revision: 8, hasCoords: true, status: 'draft', actions: { resume: true, edit: false } })
  expect(JSON.stringify(body)).not.toMatch(/coordinates|geometry|hardware_coordinates|private metadata|secret/)
  expect(fixture.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id, lister_id: actor }, select: expect.objectContaining({ privateLocation: { select: { id: true } } }) }))
})
it('does not fall back to public access for another owner or a missing draft', async () => {
  fixture.find.mockResolvedValue(null)
  const response = await read(request(`/my-listings/${id}`),context)
  expect(response.status).toBe(404)
  expect(fixture.find).toHaveBeenCalledTimes(1)
  expect(fixture.sign).not.toHaveBeenCalled()
})
it('paginates the owner archive without revealing stored file paths', async () => {
  fixture.many.mockResolvedValue([row,{...row,id:other}])
  const result = await ownListingPage(actor,{limit:1})
  expect(result.items).toHaveLength(1)
  expect(result.nextCursor).toBe(`${date.toISOString()}~${id}`)
  expect(JSON.stringify(result)).not.toContain('/fixture/')
  expect(fixture.many).toHaveBeenCalledWith(expect.objectContaining({ where: { lister_id: actor }, take:2, orderBy: [{createdAt:'desc'},{id:'desc'}] }))
})
it('keeps the media vault scoped to owner drafts with footage and a stable archive boundary', async () => {
  const response=await vault(request('/vault?limit=20'))
  expect(response.status).toBe(200)
  expect((await response.json()).data.items[0].area).toBe('Yaba')
  expect(fixture.many).toHaveBeenCalledWith(expect.objectContaining({where:{lister_id:actor,listing_status:'draft',video_path:{not:null}},take:21}))
})
it('forwards only editable posted fields and the expected revision to the shared owner service', async () => {
  const payload={address:'Updated fixture address',basePrice:'500001',metadata:{bedrooms:'3'},expectedRevision:8}
  const response=await edit(new Request(`https://rentral.example/api/v1/my-listings/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'update',listing:payload})}),context)
  expect(response.status).toBe(200)
  expect(fixture.edit).toHaveBeenCalledExactlyOnceWith(actor,{...payload,listingId:id})
  expect(fixture.identity).toHaveBeenCalledWith(expect.any(Request),{mutation:true})
})
it('forwards owner archive and restoration to the shared service without deleting evidence',async()=>{
  const response=await edit(new Request(`https://rentral.example/api/v1/my-listings/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'archive',archived:true})}),context)
  expect(response.status).toBe(200)
  expect(fixture.archive).toHaveBeenCalledExactlyOnceWith(actor,id,true)
  expect(fixture.edit).not.toHaveBeenCalled()
})
it('returns stale revision as409 so draft text can be preserved for comparison',async()=>{
  fixture.edit.mockResolvedValue({success:false,code:'STALE_LISTING',error:'Reload this listing.'})
  const response=await edit(new Request(`https://rentral.example/api/v1/my-listings/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'update',listing:{address:'Updated address',basePrice:'1',metadata:{},expectedRevision:8}})}),context)
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({code:'STALE_LISTING'})
})
it.each([{videoPath:'replacement.mp4'},{documentPath:'replacement.pdf'},{category:'car'},{lat:6.5},{listingId:other}])('rejects sealed field injection%j before shared service writes',async patch=>{
  const response=await edit(new Request(`https://rentral.example/api/v1/my-listings/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'update',listing:{address:'Updated address',basePrice:'500000',metadata:{},...patch}})}),context)
  expect(response.status).toBe(400)
  expect(fixture.edit).not.toHaveBeenCalled()
})
it('signs a private authority document only after current owner authorization',async()=>{
  const response=await document(request(`/my-listings/${id}/document`),context)
  expect(response.status).toBe(200)
  expect(fixture.find).toHaveBeenCalledWith({where:{id,lister_id:actor},select:{document_path:true}})
  expect(fixture.sign).toHaveBeenCalledExactlyOnceWith(row.document_path,300)
  const body=await response.json()
  expect(Date.parse(body.data.expiresAt)-Date.now()).toBeLessThanOrEqual(300000)
  fixture.find.mockResolvedValue(null)
  expect((await document(request(`/my-listings/${id}/document`),context)).status).toBe(404)
  expect(fixture.sign).toHaveBeenCalledTimes(1)
})
it('does not sign an authority file reference belonging to another actor',async()=>{
  fixture.find.mockResolvedValue({document_path:`${other}/fixture/proof.pdf`})
  expect((await document(request(`/my-listings/${id}/document`),context)).status).toBe(404)
  expect(fixture.sign).not.toHaveBeenCalled()
})
it('confirms an uncertain upload only with owned available state and matching actual filesystem metadata',async()=>{
  const path=`${actor}/fixture/1_video.mp4`
  const response=await uploadInfo(request(`/uploads/listings-media/info?path=${encodeURIComponent(path)}`),{params:Promise.resolve({bucket:'listings-media'})})
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({data:{path,size:100,contentType:'video/mp4'}})
  expect(fixture.storageRecord).toHaveBeenCalledWith(expect.objectContaining({where:{id:`listings-media:${path}`,owner_id:actor,bucket:'listings-media',state:'available'}}))
  fixture.info.mockResolvedValue({...await fixture.info(),size:101})
  expect((await uploadInfo(request(`/uploads/listings-media/info?path=${encodeURIComponent(path)}`),{params:Promise.resolve({bucket:'listings-media'})})).status).toBe(409)
})
it('keeps uploading or missing objects unconfirmed and never returns a fake uploaded path',async()=>{
  fixture.storageRecord.mockResolvedValue(null)
  const response=await uploadInfo(request(`/uploads/listings-media/info?path=${actor}/fixture/1_video.mp4`),{params:Promise.resolve({bucket:'listings-media'})})
  expect(response.status).toBe(409)
  expect(fixture.info).not.toHaveBeenCalled()
})
it.each([`${other}/fixture/1_video.mp4`,`${actor}/../mail-outbox/private.eml`,`${actor}/fixture/%2e%2e/proof.pdf`])('rejects private upload-info path%s before file metadata access',async path=>{
  const response=await uploadInfo(request(`/uploads/listings-media/info?path=${encodeURIComponent(path)}`),{params:Promise.resolve({bucket:'listings-media'})})
  expect(response.status).toBeGreaterThanOrEqual(400)
  expect(response.status).toBeLessThan(500)
  expect(fixture.storageRecord).not.toHaveBeenCalled()
  expect(fixture.info).not.toHaveBeenCalled()
})
it('returns authentication JSON without signing or querying private records',async()=>{
  fixture.identity.mockRejectedValue(new ApiError(401,'UNAUTHORIZED','Sign in again.'))
  const response=await document(request(`/my-listings/${id}/document`),context)
  expect(response.status).toBe(401)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(fixture.find).not.toHaveBeenCalled()
  expect(fixture.sign).not.toHaveBeenCalled()
})
