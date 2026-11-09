import { beforeEach, expect, it, vi } from 'vitest'

const fixture=vi.hoisted(()=>({fetch:vi.fn(),session:vi.fn(),invalidate:vi.fn(),arrayBuffer:vi.fn(),copy:vi.fn(),removeDirectory:vi.fn(),get:vi.fn(),set:vi.fn(),remove:vi.fn(),values:new Map<string,string>(),size:200*1024*1024,exists:true}))
vi.mock('expo-crypto',()=>({randomUUID:()=> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}))
vi.mock('expo/fetch',()=>({fetch:fixture.fetch}))
vi.mock('expo-file-system',()=>({
  Directory:class Directory{uri:string;exists=true;constructor(...parts:(string|{uri:string})[]){this.uri=parts.map(part=>typeof part==='string'?part:part.uri).join('/')}create(){}delete(){fixture.removeDirectory(this.uri)}},
  Paths:{document:{uri:'file:///private/documents'}},
  File:class File{uri:string;constructor(...parts:(string|{uri:string})[]){this.uri=parts.map(part=>typeof part==='string'?part:part.uri).join('/')}get exists(){return fixture.exists}get size(){return fixture.size}arrayBuffer=fixture.arrayBuffer;async copy(target:{uri:string}){fixture.copy(this.uri,target.uri)}},
}))
vi.mock('../apps/mobile/src/lib/auth',()=>({getSession:fixture.session,invalidateSession:fixture.invalidate}))
vi.mock('../apps/mobile/src/lib/config',()=>({config:{apiUrl:'http://192.168.0.1:3000'},configurationError:null}))
vi.mock('../apps/mobile/src/lib/session-storage',()=>({sessionStorage:{getItem:fixture.get,setItem:fixture.set,removeItem:fixture.remove}}))
import {ApiError}from'../apps/mobile/src/lib/api'
import {prepareNativeListingUpload,uploadPreparedNativeListingFile}from'../apps/mobile/src/lib/native-upload'
import {buildNativeDraftCommand,canClearDeclinedDraft}from'../apps/mobile/src/lib/native-draft-workflow'
import {dismissNativeDeviceDraft,loadNativeDeviceDraft,nativeDraftDirectory,newNativeDeviceDraft,resolveNativeDeviceDraft,saveNativeDeviceDraft,stashNativeDraftFile,type NativeDeviceDraft}from'../apps/mobile/src/lib/native-draft-store'
import {EMPTY_LISTING_FORM,formFromOwnerListing,listingFormError,nativeListingMetadata}from'../apps/mobile/src/lib/native-listing'
import {ownerListingDetailSchema}from'../lib/contracts/listings'

const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',serverId='33333333-3333-4333-8333-333333333333',clientId='44444444-4444-4444-8444-444444444444'
it('never discards an older uncertain listing nonce after a rejected retry, actor change or failed acknowledgment readback',()=>{
 const declined=new ApiError('Declined','INVALID_INPUT',400)
 expect(canClearDeclinedDraft(declined,false,false)).toBe(true)
 expect(canClearDeclinedDraft(declined,true,false)).toBe(false)
 expect(canClearDeclinedDraft(new ApiError('Readback unavailable','NOT_FOUND',404),false,true)).toBe(false)
 for(const[code,status]of[['ACCOUNT_CHANGED',409],['INVALID_RETRY',409],['INVALID_RESPONSE',200],['NETWORK_ERROR',0],['UNAVAILABLE',503]]as const)expect(canClearDeclinedDraft(new ApiError('Unconfirmed',code,status),false,false)).toBe(false)
})
const form={...EMPTY_LISTING_FORM,address:'Fixture address in Yaba',basePrice:'500000',bedrooms:'2',bathrooms:'2',sizeSqm:'80',agencyFee:'123.45',rentalIntent:'shortlet' as const,propertyType:'apartment' as const,kitchens:'1',floors:'2'}
const savedServer={id:serverId,revision:8,category:'house',status:'draft',address:form.address,basePrice:form.basePrice,metadata:nativeListingMetadata('house',form),wizardStep:'checkout',videoPath:`${actor}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/1_video.mp4`,posterPath:null,documentPath:`${actor}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/2_proof.pdf`,documentName:'proof.pdf',hasCoords:true,createdAt:'2030-01-01T10:00:00.000Z',updatedAt:'2030-01-01T10:00:00.000Z',archivedAt:null,actions:{edit:false,resume:true,archive:true,restore:false}}
beforeEach(()=>{
 vi.resetAllMocks();fixture.values.clear();fixture.size=200*1024*1024;fixture.exists=true
 fixture.get.mockImplementation(async key=>fixture.values.get(key)??null)
 fixture.set.mockImplementation(async(key,value)=>{fixture.values.set(key,value)})
 fixture.remove.mockImplementation(async key=>{fixture.values.delete(key)})
 fixture.session.mockResolvedValue({user:{id:actor},access_token:'fixture-access'})
 fixture.arrayBuffer.mockImplementation(()=>{throw new Error('A whole-video allocation is forbidden')})
 fixture.invalidate.mockResolvedValue(undefined)
})
it('streams a200MB native File without reading an ArrayBuffer and preserves MOV format',async()=>{
 const prepared=prepareNativeListingUpload('file:///camera/recording.mov','video',actor)
 expect(prepared.contentType).toBe('video/quicktime');expect(prepared.path.endsWith('.mov')).toBe(true)
 fixture.fetch.mockResolvedValue(Response.json({success:true,data:{path:prepared.path}},{status:201}))
 expect(await uploadPreparedNativeListingFile(prepared,actor)).toBe(prepared.path)
 expect(fixture.fetch).toHaveBeenCalledExactlyOnceWith('http://192.168.0.1:3000/api/v1/uploads/listings-media',expect.objectContaining({body:expect.objectContaining({uri:'file:///camera/recording.mov'}),headers:expect.objectContaining({'Content-Type':'video/quicktime','X-Upload-Path':prepared.path})}))
 expect(fixture.arrayBuffer).not.toHaveBeenCalled()
})
it('does not relabel an unrecognized video container as mp4',()=>{
 expect(()=>prepareNativeListingUpload('file:///camera/unknown.bin','video',actor)).toThrow('actual recorded video format')
 expect(fixture.fetch).not.toHaveBeenCalled()
})
it('validates file bounds and original size before sending anything',async()=>{
 const prepared=prepareNativeListingUpload('file:///camera/recording.mp4','video',actor)
 fixture.size=1
 await expect(uploadPreparedNativeListingFile(prepared,actor)).rejects.toThrow('original file changed')
 fixture.size=10*1024*1024+1
 expect(()=>prepareNativeListingUpload('file:///picked/proof.pdf','document',actor,'application/pdf')).toThrow('10MB')
 expect(fixture.fetch).not.toHaveBeenCalled()
})
it('rejects another actor or an unowned upload path before streaming',async()=>{
 const prepared=prepareNativeListingUpload('file:///camera/recording.mp4','video',actor)
 fixture.session.mockResolvedValue({user:{id:other},access_token:'other-access'})
 await expect(uploadPreparedNativeListingFile(prepared,actor)).rejects.toMatchObject({code:'ACCOUNT_CHANGED'})
 expect(()=>prepareNativeListingUpload('file:///camera/recording.mp4','video',actor,undefined,`${other}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/video.mp4`)).toThrow('path is invalid')
 expect(fixture.fetch).not.toHaveBeenCalled()
})
it('requires an exact successful upload acknowledgment and never automatically retries unknown results',async()=>{
 const prepared=prepareNativeListingUpload('file:///camera/recording.mp4','video',actor)
 fixture.fetch.mockResolvedValueOnce(Response.json({success:true,data:{path:'different/path.mp4'}})).mockRejectedValueOnce(new TypeError('connection lost'))
 await expect(uploadPreparedNativeListingFile(prepared,actor)).rejects.toMatchObject({code:'INVALID_RESPONSE'})
 await expect(uploadPreparedNativeListingFile(prepared,actor)).rejects.toMatchObject({code:'UPLOAD_UNCERTAIN',status:0})
 expect(fixture.fetch).toHaveBeenCalledTimes(2)
})
it('invalidates only an explicitly rejected upload session',async()=>{
 const prepared=prepareNativeListingUpload('file:///camera/recording.mp4','video',actor)
 fixture.fetch.mockResolvedValueOnce(Response.json({success:false,error:'Sign in again.'},{status:401})).mockResolvedValueOnce(Response.json({success:false,error:'Unavailable'},{status:503}))
 await expect(uploadPreparedNativeListingFile(prepared,actor)).rejects.toMatchObject({status:401})
 expect(fixture.invalidate).toHaveBeenCalledExactlyOnceWith('fixture-access')
 fixture.invalidate.mockClear()
 await expect(uploadPreparedNativeListingFile(prepared,actor)).rejects.toMatchObject({status:503})
 expect(fixture.invalidate).not.toHaveBeenCalled()
})
it('reports failed secure-session deletion accurately after a definite401 without claiming network uncertainty',async()=>{
 const prepared=prepareNativeListingUpload('file:///camera/recording.mp4','video',actor)
 fixture.fetch.mockResolvedValue(Response.json({success:false,error:'Sign in again.'},{status:401}))
 fixture.invalidate.mockRejectedValue(new Error('Keychain unavailable'))
 await expect(uploadPreparedNativeListingFile(prepared,actor)).rejects.toMatchObject({status:401,code:'SESSION_CLEAR_FAILED'})
 expect(fixture.fetch).toHaveBeenCalledTimes(1)
})
it('keeps category metadata, purpose, fees and posted form roundtrips under the shared validators',()=>{
 expect(listingFormError('house',form)).toBeNull()
 expect(formFromOwnerListing(ownerListingDetailSchema.parse(savedServer))).toMatchObject(form)
 expect(listingFormError('house',{...form,agencyFee:'1.234'})).toContain('decimal')
 expect(nativeListingMetadata('boat',{...form,capacityPersons:'8',vesselType:'Speedboat',lifeJackets:true,safetyEquipment:'Radio'})).toMatchObject({lifeJackets:true,safetyEquipment:'Radio',rentalIntent:'shortlet'})
})
it('saves only actor-scoped device recovery and does not lose the pending nonce on restart',async()=>{
 const draft=newNativeDeviceDraft(actor)
 const pending=buildNativeDraftCommand(draft,'draft',clientId)
 const saved=await saveNativeDeviceDraft({...draft,pending,sequence:1})
 expect((await loadNativeDeviceDraft(actor))?.pending).toEqual(pending)
 expect(await loadNativeDeviceDraft(other)).toBeNull()
 expect(saved.pending?.listing.clientId).toBe(clientId)
 expect([...fixture.values.values()].join('')).not.toMatch(/access_token|refresh_token|accountNumber|kyc/i)
})
it('does not let later form edits replace an uncertain command or its identifier',async()=>{
 const draft=newNativeDeviceDraft(actor)
 await saveNativeDeviceDraft({...draft,pending:buildNativeDraftCommand(draft,'draft',clientId),sequence:1})
 await expect(saveNativeDeviceDraft({...draft,sequence:2,form,pending:null})).rejects.toThrow('Confirm the saved listing request')
 expect((await loadNativeDeviceDraft(actor))?.pending?.listing.clientId).toBe(clientId)
})
it('drops older or duplicate sequence snapshots instead of overwriting newer recovery',async()=>{
 const draft=newNativeDeviceDraft(actor)
 await saveNativeDeviceDraft({...draft,sequence:2,form})
 const older=await saveNativeDeviceDraft({...draft,sequence:1})
 expect(older.form.address).toBe(form.address)
 const duplicate=await saveNativeDeviceDraft({...draft,sequence:2})
 expect(duplicate.form.address).toBe(form.address)
})
it('resolves only the exact actor, local draft and acknowledged client identifier',async()=>{
 const draft=newNativeDeviceDraft(actor)
 const command=buildNativeDraftCommand(draft,'draft',clientId)
 const saved=await saveNativeDeviceDraft({...draft,sequence:1,pending:command})
 await expect(resolveNativeDeviceDraft(actor,draft.localId,other,saved)).rejects.toThrow('no longer matches')
 const resolved=await resolveNativeDeviceDraft(actor,draft.localId,clientId,saved)
 expect(resolved.pending).toBeNull();expect(resolved.sequence).toBe(2)
})
it('treats missing recovery chunks as unknown until explicit review and dismissal',async()=>{
 fixture.values.set(`rentral.listing.draft.${actor}.present`,'1')
 await expect(loadNativeDeviceDraft(actor)).rejects.toThrow('incomplete')
 await expect(saveNativeDeviceDraft(newNativeDeviceDraft(actor))).rejects.toThrow('incomplete')
 await dismissNativeDeviceDraft(actor)
 expect(await loadNativeDeviceDraft(actor)).toBeNull()
})
it('copies recordings into the actor/local-draft private directory without reading the file into JavaScript',async()=>{
 const uri=await stashNativeDraftFile(actor,clientId,'file:///camera/recording.mov','video')
 expect(uri).toBe(`file:///private/documents/rentral-listing-drafts/${actor}/${clientId}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mov`)
 expect(fixture.copy).toHaveBeenCalledWith('file:///camera/recording.mov',uri)
 expect(fixture.arrayBuffer).not.toHaveBeenCalled()
})
it('rejects device recovery that points outside its owned private directory',async()=>{
 const draft=newNativeDeviceDraft(actor)
 await expect(saveNativeDeviceDraft({...draft,capture:{uri:'file:///other/member/video.mp4',lat:6.5,lng:3.4,accuracy:10,duration:20}})).rejects.toThrow('file location cannot be confirmed')
})
it('never builds a server save from an unconfirmed upload or a different recording',()=>{
 const draft=newNativeDeviceDraft(actor)
 const uri=`${nativeDraftDirectory(actor,draft.localId).uri}/video.mp4`
 const captured={...draft,form,capture:{uri,lat:6.5,lng:3.4,accuracy:10,duration:20}}
 expect(()=>buildNativeDraftCommand(captured,'submit',clientId)).toThrow('Upload and confirm')
 const upload=prepareNativeListingUpload(uri,'video',actor)
 expect(()=>buildNativeDraftCommand({...captured,videoUpload:{upload,state:'unknown'}},'submit',clientId)).toThrow('Upload and confirm')
 expect(()=>buildNativeDraftCommand({...captured,videoUpload:{upload:{...upload,uri:'different-recording.mp4'},state:'uploaded'}},'submit',clientId)).toThrow('does not match')
})
it('resumes paired server evidence without ever reading back its raw capture coordinates',()=>{
 const draft=newNativeDeviceDraft(actor,ownerListingDetailSchema.parse(savedServer))
 const command=buildNativeDraftCommand(draft,'submit',clientId)
 expect(command.listing).toMatchObject({draftId:serverId,expectedRevision:8,videoPath:savedServer.videoPath,documentPath:savedServer.documentPath})
 expect(command.listing).not.toHaveProperty('lat');expect(command.listing).not.toHaveProperty('lng')
 expect(JSON.stringify(draft.server)).not.toMatch(/coordinates|latitude|longitude|geometry/)
})
it('keeps a retaken draft from borrowing the previous recording’s GPS lock',()=>{
 const draft=newNativeDeviceDraft(actor,ownerListingDetailSchema.parse(savedServer))
 const retaken:NativeDeviceDraft={...draft,server:{...draft.server!,videoPath:null,posterPath:null,hasCoords:false}}
 expect(()=>buildNativeDraftCommand(retaken,'submit',clientId)).toThrow('capture location')
 const partial=buildNativeDraftCommand(retaken,'draft',clientId)
 expect(partial.listing).not.toHaveProperty('videoPath');expect(partial.listing).not.toHaveProperty('lat')
})
it('keeps original upload metadata and aborts only the explicitly cancelled transfer',async()=>{
 const prepared=prepareNativeListingUpload('file:///camera/recording.mp4','video',actor)
 const controller=new AbortController()
 fixture.fetch.mockImplementation(async(_url,options)=>{expect(options.signal.aborted).toBe(true);throw new DOMException('Cancelled','AbortError')})
 controller.abort()
 await expect(uploadPreparedNativeListingFile(prepared,actor,controller.signal)).rejects.toMatchObject({status:0,code:'UPLOAD_UNCERTAIN'})
 expect(prepared.path).toContain(actor)
 expect(fixture.fetch).toHaveBeenCalledTimes(1)
 expect(fixture.arrayBuffer).not.toHaveBeenCalled()
})
it('reports a definite upload rejection as an error without inventing success',async()=>{
 const prepared=prepareNativeListingUpload('file:///camera/recording.mp4','video',actor)
 fixture.fetch.mockResolvedValue(Response.json({success:false,error:'Container is not accepted.'},{status:415}))
 await expect(uploadPreparedNativeListingFile(prepared,actor)).rejects.toBeInstanceOf(ApiError)
})
