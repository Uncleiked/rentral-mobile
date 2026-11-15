import { describe, expect, it } from 'vitest'
import { traceDatabaseQuery, traceTransaction } from '@/lib/database/transaction-trace'
describe('private transaction timing trace', () => {
 it('keeps query arguments and results out of the diagnostic snapshot', async () => {
  await traceTransaction(async snapshot => {
   expect(await traceDatabaseQuery('User','findUnique',async()=>({email:'private.fixture.invalid'}))).toEqual({email:'private.fixture.invalid'})
   expect(snapshot()).toEqual([{model:'User',operation:'findUnique',elapsedMs:expect.any(Number)}])
   expect(JSON.stringify(snapshot())).not.toContain('private')
  })
 })
 it('isolates concurrent transactions and records failures without error payloads', async()=>{
  const a=traceTransaction(async snapshot=>{await traceDatabaseQuery('User','updateMany',async()=>{await new Promise(r=>setTimeout(r,5));return1()});return snapshot()})
  const b=traceTransaction(async snapshot=>{await expect(traceDatabaseQuery('SocialFollow','create',async()=>{throw new Error('secret')})).rejects.toThrow('secret');return snapshot()})
  function return1(){return 1}
  expect((await a).map(x=>x.model)).toEqual(['User']);expect((await b).map(x=>x.model)).toEqual(['SocialFollow'])
 })
 it('does not retain a completed transaction trace on unrelated queries', async()=>{
  await traceTransaction(async snapshot=>{await traceDatabaseQuery('User','count',async()=>1);expect(snapshot()).toHaveLength(1)})
  expect(await traceDatabaseQuery('User','count',async()=>2)).toBe(2)
 })
})

