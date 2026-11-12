import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { describe,expect,it,vi } from 'vitest'
import { privateImageVariant } from '@/lib/media/private-image'
import { isProtectedListingImage,protectedListingImageLoader } from '@/lib/media/image-loader'
async function source(width=1024,height=512){const bytes=await sharp({create:{width,height,channels:3,background:{r:40,g:80,b:120}}}).jpeg().withExif({IFD0:{Artist:'Fixture metadata'}}).toBuffer();return {bytes,storage:{info:vi.fn(async()=>({data:{size:bytes.byteLength,contentType:'image/jpeg',digest:createHash('sha256').update(bytes).digest('hex')},error:null})),download:vi.fn(async()=>({data:new Blob([new Uint8Array(bytes)],{type:'image/jpeg'}),error:null}))}}}
describe('bounded authorized private image derivatives',()=>{
 it('shrinks actual raster bytes without cropping, retains original and strips metadata',async()=>{const {bytes,storage}=await source();const before=Buffer.from(bytes);const output=await privateImageVariant(storage,'fixture/resize',320);const info=await sharp(output).metadata();expect(info).toMatchObject({width:320,height:160,format:'webp'});expect(info.exif).toBeUndefined();expect(bytes.equals(before)).toBe(true);expect(output.byteLength).toBeLessThan(bytes.byteLength)})
 it('never enlarges small original images',async()=>{const {storage}=await source(100,200);expect(await sharp(await privateImageVariant(storage,'fixture/small',1920)).metadata()).toMatchObject({width:100,height:200})})
 it('coalesces duplicate work but reads current metadata again on every cache request',async()=>{const {storage}=await source();const [one,two]=await Promise.all([privateImageVariant(storage,'fixture/shared',640),privateImageVariant(storage,'fixture/shared',640)]);expect(one.equals(two)).toBe(true);await privateImageVariant(storage,'fixture/shared',640);expect(storage.info).toHaveBeenCalledTimes(3);expect(storage.download).toHaveBeenCalledTimes(1)})
 it('rejects arbitrary dimensions before reading storage',async()=>{const {storage}=await source();for(const width of [1,999,2000,Infinity,NaN])await expect(privateImageVariant(storage,'fixture/size',width)).rejects.toThrow();expect(storage.info).not.toHaveBeenCalled()})
 it('rejects oversized or nonraster originals before download',async()=>{const {storage}=await source();const data=(await storage.info()).data;storage.info.mockResolvedValue({data:{...data,size:11*1024*1024},error:null});await expect(privateImageVariant(storage,'fixture/huge',320)).rejects.toThrow();storage.info.mockResolvedValue({data:{...data,contentType:'image/svg+xml'},error:null});await expect(privateImageVariant(storage,'fixture/svg',320)).rejects.toThrow();expect(storage.download).not.toHaveBeenCalled()})
 it('rejects metadata/content mismatch before transformation',async()=>{const {storage}=await source();const data=(await storage.info()).data;storage.info.mockResolvedValue({data:{...data,digest:'0'.repeat(64)},error:null});await expect(privateImageVariant(storage,'fixture/changed',320)).rejects.toThrow()})
 it('only emits sameorigin protected source variants and caps device requested sizes',()=>{const src='/api/listings/11111111-1111-4111-8111-111111111111/source?kind=photo&index=2';expect(isProtectedListingImage(src)).toBe(true);expect(protectedListingImageLoader({src,width:750})).toBe(src+'&w=960');expect(protectedListingImageLoader({src,width:4000})).toBe(src+'&w=1920');for(const invalid of ['https://evil.test'+src,src.replace('kind=photo','kind=video'),'blob:private','/api/v1/files/signed'])expect(isProtectedListingImage(invalid)).toBe(false)})
})


describe('private image transform queue', () => {
 it.each([3,12])('serves %s simultaneous real thumbnails with only two transforms active', async count => {
  const { storage } = await source(), download = storage.download.getMockImplementation()!
  let downloading = 0, peak = 0
  storage.download.mockImplementation(async () => { downloading += 1; peak = Math.max(peak,downloading); try { await new Promise(resolve => setTimeout(resolve,5)); return await download() } finally { downloading -= 1 } })
  const images = await Promise.all(Array.from({length:count},(_,index) => privateImageVariant(storage,'fixture/parallel-'+count+'/'+index,320)))
  expect(images).toHaveLength(count);expect(peak).toBe(2);expect(storage.download).toHaveBeenCalledTimes(count)
  for(const image of images) expect(await sharp(image).metadata()).toMatchObject({width:320,height:160,format:'webp'})
 })
 it('bounds FIFO waiting work and releases slots after queue saturation', async () => {
  const { storage } = await source(), download = storage.download.getMockImplementation()!
  let release:()=>void=()=>undefined
  const barrier = new Promise<void>(resolve=>{release=resolve}), order:string[]=[]
  storage.download.mockImplementation(async (...args:unknown[])=>{order.push(String(args[0]));await barrier;return download()})
  const work = Array.from({length:18},(_,index)=>privateImageVariant(storage,'fixture/queue-bound/'+index,320))
  const overflow = privateImageVariant(storage,'fixture/queue-bound/overflow',320).catch(error=>error)
  try { expect(await overflow).toBeInstanceOf(Error) } finally { release() }
  await Promise.all(work)
  expect(order).toEqual(Array.from({length:18},(_,index)=>'fixture/queue-bound/'+index))
  expect(await privateImageVariant(storage,'fixture/queue-bound/overflow',320)).toBeInstanceOf(Buffer)
 })
 it('expires a queued request, removes its pending entry and never downloads it before retry', async () => {
  const { storage } = await source(), download = storage.download.getMockImplementation()!
  let release:()=>void=()=>undefined
  const barrier = new Promise<void>(resolve=>{release=resolve})
  storage.download.mockImplementation(async()=>{await barrier;return download()})
  vi.useFakeTimers()
  const active = [privateImageVariant(storage,'fixture/queue-deadline/a',320),privateImageVariant(storage,'fixture/queue-deadline/b',320)]
  const expired = privateImageVariant(storage,'fixture/queue-deadline/expired',320).catch(error=>error)
  try { await vi.advanceTimersByTimeAsync(10001);expect(await expired).toBeInstanceOf(Error);expect(storage.download).toHaveBeenCalledTimes(2) }
  finally { vi.useRealTimers();release();await Promise.allSettled([...active,expired]) }
  expect(await privateImageVariant(storage,'fixture/queue-deadline/expired',320)).toBeInstanceOf(Buffer)
  expect(storage.download).toHaveBeenCalledTimes(3)
 })
 it('releases active and pending state after a transform source failure', async () => {
  const { storage } = await source(), download = storage.download.getMockImplementation()!
  storage.download.mockRejectedValueOnce(new Error('Owned fixture read failed'))
  await expect(privateImageVariant(storage,'fixture/queue-retry',320)).rejects.toThrow('Owned fixture read failed')
  storage.download.mockImplementation(download)
  expect(await privateImageVariant(storage,'fixture/queue-retry',320)).toBeInstanceOf(Buffer)
 })
})

it('coalesces duplicate requests that are already waiting for a transform slot', async () => {
 const {storage}=await source(),download=storage.download.getMockImplementation()!
 let release:()=>void=()=>undefined
 const barrier=new Promise<void>(resolve=>{release=resolve})
 storage.download.mockImplementation(async()=>{await barrier;return download()})
 const active=[privateImageVariant(storage,'fixture/queued-duplicate/a',320),privateImageVariant(storage,'fixture/queued-duplicate/b',320)]
 const one=privateImageVariant(storage,'fixture/queued-duplicate/shared',320),two=privateImageVariant(storage,'fixture/queued-duplicate/shared',320)
 try {for(let index=0;index<10;index+=1)await Promise.resolve();expect(storage.download).toHaveBeenCalledTimes(2)}finally{release()}
 const [first,second]=await Promise.all([one,two,...active])
 expect(first).toBe(second);expect(storage.download).toHaveBeenCalledTimes(3)
})
