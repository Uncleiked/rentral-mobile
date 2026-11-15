import { expect, it, vi } from 'vitest'
import { apiFailure } from '@/lib/api/http'
it.each(['P2028', 'P2034'])('keeps %s outcomes unconfirmed and private without exposing raw database text', async code => {
 const logging=vi.spyOn(console,'error').mockImplementation(()=>undefined)
 try {
  const error=Object.assign(new Error('private-database-uri secret transaction timeout'), { name:'PrismaClientKnownRequestError',code })
  const response=apiFailure(error,'test')
  expect(response.status).toBe(503);expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({success:false,code:'CHANGE_UNCONFIRMED',error:'This change could not be confirmed. Check its current status before retrying.'})
  expect(logging).toHaveBeenCalledWith('[api/v1/test] Request failed',expect.objectContaining({code}))
 }finally{logging.mockRestore()}
})
it('keeps an unknown database validation failure distinct for diagnosis', async ()=>{
 const logging=vi.spyOn(console,'error').mockImplementation(()=>undefined)
 try {
  const error=Object.assign(new Error('Document failed validation: private-document'), {name:'PrismaClientKnownRequestError',code:'P2010',meta:{code:'121'}})
  const response=apiFailure(error,'test');expect(response.status).toBe(500);expect(JSON.stringify(await response.json())).not.toContain('private')
  expect(logging).toHaveBeenCalledWith('[api/v1/test] Request failed',{name:'PrismaClientKnownRequestError',code:'P2010',mongoCode:121,cause:'document_validation'})
 }finally{logging.mockRestore()}
})

