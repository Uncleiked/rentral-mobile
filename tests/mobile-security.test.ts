import { afterEach,beforeEach,expect,it,vi } from 'vitest'
const fixture=vi.hoisted(()=>({request:vi.fn(),fetch:vi.fn()}))
vi.mock('../apps/mobile/src/lib/api',()=>({api:fixture.request,ApiError:class ApiError extends Error{constructor(message:string,public readonly code:string,public readonly status:number){super(message)}}}))
vi.mock('../apps/mobile/src/lib/config',()=>({config:{apiUrl:'http://192.168.0.1:3000'},configurationError:null}))
import{ApiError}from'../apps/mobile/src/lib/api'
import{cancelAccountEmailChange,changeAccountPassword,confirmAccountEmailChange,requestAccountEmailChange,revokeAccountSession,revokeAllAccountSessions}from'../apps/mobile/src/lib/security-api'
const actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222'
const pending={id,newEmail:'updated@example.test',oldConfirmed:false,newConfirmed:false,expiresAt:'2030-01-01T10:00:00.000Z'}
const code='a'.repeat(43)
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('fetch',fixture.fetch)})
afterEach(()=>{vi.unstubAllGlobals()})
it('scopes password changes to the captured actor and requires explicit confirmed revocation flags',async()=>{
 fixture.request.mockResolvedValueOnce({changed:true,signInRequired:true}).mockResolvedValueOnce({changed:true,signInRequired:false})
 expect(await changeAccountPassword({currentPassword:'fixture-old-password',newPassword:'fixture-new-password'},actor)).toEqual({changed:true,signInRequired:true})
 expect(fixture.request).toHaveBeenLastCalledWith('/auth/password',{method:'POST',body:{currentPassword:'fixture-old-password',newPassword:'fixture-new-password'},expectedUserId:actor})
 await expect(changeAccountPassword({currentPassword:'fixture-old-password',newPassword:'fixture-new-password'},actor)).rejects.toMatchObject({code:'INVALID_RESPONSE'})
})
it('validates local credential inputs before any network mutation and leaves known bad input correctable',async()=>{
 await expect(changeAccountPassword({currentPassword:'old',newPassword:'short'},actor)).rejects.toMatchObject({status:400,code:'INVALID_INPUT'})
 await expect(requestAccountEmailChange({currentPassword:'old',newEmail:'not-an-email'},actor)).rejects.toMatchObject({status:400,code:'INVALID_INPUT'})
 expect(fixture.request).not.toHaveBeenCalled()
})
it('normalizes the email request and verifies the acknowledgment targets exactly that address',async()=>{
 fixture.request.mockResolvedValueOnce({pending,delivery:'development-outbox'}).mockResolvedValueOnce({pending:{...pending,newEmail:'other@example.test'},delivery:'email'})
 expect((await requestAccountEmailChange({newEmail:' Updated@Example.Test ',currentPassword:'fixture-current'},actor)).delivery).toBe('development-outbox')
 expect(fixture.request.mock.calls[0]).toEqual(['/auth/email-change',{method:'POST',body:{newEmail:'updated@example.test',currentPassword:'fixture-current'},expectedUserId:actor}])
 await expect(requestAccountEmailChange({newEmail:'updated@example.test',currentPassword:'fixture-current'},actor)).rejects.toMatchObject({code:'INVALID_RESPONSE'})
})
it('requires a confirmed email cancellation and never fabricates a cancelled pending change',async()=>{
 fixture.request.mockResolvedValueOnce({cancelled:true}).mockResolvedValueOnce({cancelled:false})
 expect(await cancelAccountEmailChange(actor)).toEqual({cancelled:true})
 await expect(cancelAccountEmailChange(actor)).rejects.toMatchObject({code:'INVALID_RESPONSE'})
})
it('matches current-session revocation to the selected row before telling the UI to sign out',async()=>{
 fixture.request.mockResolvedValueOnce({revoked:true,current:false}).mockResolvedValueOnce({revoked:true,current:true})
 expect(await revokeAccountSession(id,false,actor)).toEqual({revoked:true,current:false})
 expect(fixture.request.mock.calls[0]).toEqual([`/auth/sessions/${id}`,{method:'DELETE',expectedUserId:actor}])
 await expect(revokeAccountSession(id,false,actor)).rejects.toMatchObject({code:'INVALID_RESPONSE'})
})
it('requires explicit sign-in-required acknowledgment for revoking all sessions',async()=>{
 fixture.request.mockResolvedValueOnce({revoked:true,signInRequired:true}).mockResolvedValueOnce({revoked:true})
 expect(await revokeAllAccountSessions(actor)).toEqual({revoked:true,signInRequired:true})
 await expect(revokeAllAccountSessions(actor)).rejects.toMatchObject({code:'INVALID_RESPONSE'})
})
it('preserves a known wrong-current-password response without any automatic retry',async()=>{
 fixture.request.mockRejectedValue(new ApiError('Current password is incorrect.','INVALID_PASSWORD',400))
 await expect(changeAccountPassword({currentPassword:'wrong-fixture',newPassword:'fixture-new-password'},actor)).rejects.toMatchObject({status:400,code:'INVALID_PASSWORD'})
 expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('preserves an unknown password change result without replaying sensitive instructions',async()=>{
 fixture.request.mockRejectedValue(new ApiError('Unknown result.','NETWORK_ERROR',0))
 await expect(changeAccountPassword({currentPassword:'fixture-current',newPassword:'fixture-new-password'},actor)).rejects.toMatchObject({status:0})
 expect(fixture.request).toHaveBeenCalledTimes(1)
})
it('confirms an email code publicly in a POST body, never in a URL or Authorization header',async()=>{
 fixture.fetch.mockResolvedValue(Response.json({success:true,data:{status:'waiting',signInRequired:false}}))
 expect(await confirmAccountEmailChange(code)).toEqual({status:'waiting',signInRequired:false})
 expect(fixture.fetch).toHaveBeenCalledExactlyOnceWith('http://192.168.0.1:3000/api/v1/auth/email-change/confirm',expect.objectContaining({method:'POST',credentials:'omit',body:JSON.stringify({token:code}),headers:{Accept:'application/json','Content-Type':'application/json'}}))
 expect(fixture.request).not.toHaveBeenCalled()
})
it('does not complete or sign out on a contradictory confirmation response',async()=>{
 fixture.fetch.mockResolvedValueOnce(Response.json({success:true,data:{status:'completed',signInRequired:false}})).mockResolvedValueOnce(Response.json({success:true,data:{status:'waiting',signInRequired:true}}))
 await expect(confirmAccountEmailChange(code)).rejects.toMatchObject({code:'INVALID_RESPONSE'})
 await expect(confirmAccountEmailChange(code)).rejects.toMatchObject({code:'INVALID_RESPONSE'})
})
it('returns a confirmed completed change only with server-required new sign-in',async()=>{
 fixture.fetch.mockResolvedValue(Response.json({success:true,data:{status:'completed',signInRequired:true}}))
 expect(await confirmAccountEmailChange(code)).toEqual({status:'completed',signInRequired:true})
})
it('does not send malformed confirmation capabilities or retry a lost response',async()=>{
 await expect(confirmAccountEmailChange('short')).rejects.toMatchObject({code:'INVALID_INPUT',status:400})
 expect(fixture.fetch).not.toHaveBeenCalled()
 fixture.fetch.mockRejectedValue(new TypeError('Connection reset'))
 await expect(confirmAccountEmailChange(code)).rejects.toMatchObject({status:0,code:'NETWORK_ERROR'})
 expect(fixture.fetch).toHaveBeenCalledTimes(1)
})
it('preserves explicit code rejection and rejects a malformed successful response',async()=>{
 fixture.fetch.mockResolvedValueOnce(Response.json({success:false,error:'This confirmation code is expired.'},{status:400})).mockResolvedValueOnce(new Response('Unexpected proxy document',{status:200}))
 await expect(confirmAccountEmailChange(code)).rejects.toMatchObject({status:400,message:'This confirmation code is expired.'})
 await expect(confirmAccountEmailChange(code)).rejects.toMatchObject({status:200,code:'INVALID_RESPONSE'})
})
