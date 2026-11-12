// Loopback-only UI fixture. This script never reads .env, database or provider settings.
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const fromVitest = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(fromVitest.resolve('vite')).href)
const parent = join(root, 'output', 'playwright', 'fixtures')
mkdirSync(parent, { recursive: true })
const folder = mkdtempSync(join(parent, 'ui-consistency-preview-'))
if (dirname(resolve(folder)) !== resolve(parent)) throw new Error('Invalid fixture path')
// Generate the repeatable CLI audit alongside local screenshots, outside Git.
const source = root.replaceAll('\\', '/')
writeFileSync(join(folder, 'index.html'), '<!doctype html><html lang="en" class="dark" style="--font-rentral:Inter,system-ui,sans-serif"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Isolated Rentral UI verification</title></head><body><script>globalThis.process={env:{}}</script><div id="root"></div><script type="module" src="/preview.jsx"></script></body></html>')
writeFileSync(join(folder, 'mock-link.jsx'), 'import React from "react";export default function Link({prefetch,replace,scroll,...props}){return React.createElement("a",props)}')
writeFileSync(join(folder, 'mock-image.jsx'), 'import React from "react";export default function Image({fill,priority,quality,unoptimized,loader,...props}){return React.createElement("img",{...props,style:{...props.style,...(fill?{position:"absolute",inset:0,width:"100%",height:"100%"}:{})}})}')
writeFileSync(join(folder, 'mock-navigation.js'), 'window.__ownerNavigations=[];window.__refreshCount=0;export const usePathname=()=>"/marketplace";const router={push:href=>window.__ownerNavigations.push(href),replace:()=>{},refresh:()=>{window.__refreshCount+=1},back:()=>{}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const redirect=()=>{};export const notFound=()=>{};')
writeFileSync(join(folder, 'mock-actions.js'), `
const unavailable=async()=>({success:false,error:"This isolated preview cannot save or authenticate."});
export const updatePassword=unavailable,login=unavailable,signup=unavailable,startGoogleSignIn=unavailable,sendPasswordReset=unavailable,resetPassword=unavailable,confirmEmail=unavailable;
export const requestBookingAction=unavailable,createListingAction=unavailable,saveListingDraftAction=unavailable,saveListingMetadataAction=unavailable,submitListingAction=unavailable;
export const setAnalyticsConsentAction=unavailable,deleteAnalyticsHistoryAction=unavailable,checkUsernameAvailability=unavailable,updateProfileIdentity=unavailable;
export const saveListingAction=unavailable,unsaveListingAction=unavailable,toggleSavedListingAction=unavailable,saveListing=unavailable,toggleSavedListing=unavailable,markThreadReadAction=unavailable,readThreadAction=unavailable,sendMessageAction=unavailable;
`)
// Discover export names without executing or importing any server code.
const actionNames=new Set()
function collect(directory){
 for(const entry of require('node:fs').readdirSync(directory,{withFileTypes:true})){
  const path=join(directory,entry.name)
  if(entry.isDirectory())collect(path)
  else if(entry.name.endsWith('.ts') && (entry.name==='actions.ts'||path.replaceAll('\\','/').includes('/app/actions/'))){
   const text=require('node:fs').readFileSync(path,'utf8')
   for(const match of text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g))actionNames.add(match[1])
  }
 }
}
collect(join(root,'app'))
for(const name of ['checkUsernameAvailability','updateProfileIdentity'])actionNames.add(name)
writeFileSync(join(folder,'mock-actions.js'),[...actionNames].map(name=>'export const '+name+'=async()=>({success:false,error:"Isolated UI preview; no data is saved."});').join('\n'))

writeFileSync(join(folder, 'fonts.css'), [
 ['400','400Regular','Inter_400Regular.ttf'],['500','500Medium','Inter_500Medium.ttf'],['600','600SemiBold','Inter_600SemiBold.ttf'],['700','700Bold','Inter_700Bold.ttf'],
].map(([weight, directory, name]) => `@font-face{font-family:Inter;src:url('/@fs/${source}/node_modules/@expo-google-fonts/inter/${directory}/${name}');font-weight:${weight};font-style:normal;font-display:swap}`).join('\n'))
writeFileSync(join(folder, 'preview.jsx'), `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ApiActorScope } from '/@fs/${source}/components/account/ApiActorScope.tsx'
import { OwnerListingsWorkspace } from '/@fs/${source}/components/listing/OwnerListingsWorkspace.tsx'
import { CreateListingWizard } from '/@fs/${source}/components/listing/CreateListingWizard.tsx'
import { GalleryListingWorkspace } from '/@fs/${source}/components/listing/GalleryListingWorkspace.tsx'
import { DirectPublicationPanel } from '/@fs/${source}/components/listing/DirectPublicationPanel.tsx'
import { useRentralStore } from '/@fs/${source}/store/useRentralStore.ts'
import '/@fs/${source}/app/globals.css'
import './fonts.css'
window.__rentralStore=useRentralStore
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const params=new URLSearchParams(location.search),view=params.get('view')||'inventory'
const poster='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="darkslategray" width="800" height="600"/></svg>')
const listing=(number,status,title,extra={})=>({id:'00000000-0000-4000-8000-'+String(number).padStart(12,'0'),status,title,price:'500,000',priceDenomination:'year',posterUrl:poster,videoUrl:null,useMux:false,media:null,badges:['House'],...extra})
const listings=[listing(1,'draft','Sunny Yaba studio',{mediaSource:'approved_gallery'}),listing(2,'pending_verification','Submitted Surulere duplex'),listing(3,'active','Live Lekki apartment'),listing(4,'suspended','Suspended Lagos house'),listing(5,'suspended','Archived old studio',{archivedAt:'2026-11-12T10:00:00.000Z'}),listing(6,'draft','Recorded Abuja home',{mediaSource:'recorded'})]
let screen
if(view==='gallery')screen=<GalleryListingWorkspace actorId={actor} allowed permissionRevision={1} draft={null}/>
else if(view==='wizard')screen=<CreateListingWizard actorId={actor} draft={null}/>
else if(view==='publish')screen=<DirectPublicationPanel actorId={actor} state={{id,revision:3,status:'pending_verification',trustedPublisher:true,canPublish:params.get('state')!=='revoked',message:params.get('state')==='revoked'?'Direct publishing is unavailable for this listing. Administrative review is required.':'This listing can publish without human review once its publication fee and media requirements are complete.'}}/>
else screen=<OwnerListingsWorkspace listings={listings} initialFilter={params.get('status')||'all'}/>
createRoot(document.getElementById('root')).render(<ApiActorScope actorId={actor}><main className="mx-auto min-h-screen max-w-6xl p-4 text-text-primary sm:p-6">{screen}</main></ApiActorScope>)
`)

const server=await createServer({
 configFile:false,cacheDir:join(folder,'.vite'),root:folder,envDir:false,envPrefix:'RENTRAL_UNUSED_UI_PREVIEW_',logLevel:'warn',esbuild:{jsx:'automatic'},
 plugins:[{name:'isolated-ui-actions',enforce:'pre',resolveId(id,importer){
  if(id.startsWith('@/app/') && /actions|profile-edit/.test(id))return join(folder,'mock-actions.js')
  if(id==='./actions'&&importer?.includes('/app/'))return join(folder,'mock-actions.js')
 }}],
 resolve:{alias:[{find:/^@\/app\/.*$/,replacement:join(folder,'mock-actions.js')},{find:'next/link',replacement:join(folder,'mock-link.jsx')},{find:'next/image',replacement:join(folder,'mock-image.jsx')},{find:'next/navigation',replacement:join(folder,'mock-navigation.js')},{find:'@',replacement:root}]},
 server:{host:'127.0.0.1',port:4187,strictPort:true,fs:{allow:[root]}},
})
await server.listen()
console.log('Isolated owner workflow UI preview: http://127.0.0.1:4187 (synthetic data, no database or providers)')
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void server.close().finally(()=>process.exit(0)))
