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
const folder = mkdtempSync(join(parent, 'social-preview-'))
if (dirname(resolve(folder)) !== resolve(parent)) throw new Error('Invalid fixture path')
// Generate the repeatable CLI audit alongside local screenshots, outside Git.
const source = root.replaceAll('\\', '/')
writeFileSync(join(folder, 'index.html'), '<!doctype html><html lang="en" class="dark" style="--font-rentral:Inter,system-ui,sans-serif"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Isolated Rentral UI verification</title></head><body><script>globalThis.process={env:{}}</script><div id="root"></div><script type="module" src="/preview.jsx"></script></body></html>')
writeFileSync(join(folder, 'mock-link.jsx'), 'import React from "react";export default function Link({prefetch,replace,scroll,...props}){return React.createElement("a",props)}')
writeFileSync(join(folder, 'mock-image.jsx'), 'import React from "react";export default function Image({fill,priority,quality,unoptimized,loader,...props}){return React.createElement("img",{...props,style:{...props.style,...(fill?{position:"absolute",inset:0,width:"100%",height:"100%"}:{})}})}')
writeFileSync(join(folder, 'mock-navigation.js'), 'window.__socialNavigations=[];window.__refreshCount=0;export const usePathname=()=>new URLSearchParams(location.search).get("path")||"/marketplace";const router={push:href=>window.__socialNavigations.push(href),replace:()=>{},refresh:()=>{window.__refreshCount+=1},back:()=>{}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const redirect=()=>{};export const notFound=()=>{};')
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
writeFileSync(join(folder,'mock-actions.js'),"export const markThreadReadAction=async()=>{window.__readCalls=(window.__readCalls||0)+1;return {success:true,data:undefined}};export const startConversationAction=async()=>({success:true,data:\"cccccccc-cccc-4ccc-8ccc-cccccccccccc\"});export const setListingSaved=async input=>{window.__saveCalls=(window.__saveCalls||[]).concat(input);return {success:true,data:{saved:input.saved}}};");
writeFileSync(join(folder,'preview.jsx'),"\nimport React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { PeopleSearch } from '/@fs/__SOURCE__/components/social/PeopleSearch.tsx'\nimport { ProfileSocialControls } from '/@fs/__SOURCE__/components/social/ProfileSocialControls.tsx'\nimport { LikeListingButton } from '/@fs/__SOURCE__/components/social/LikeListingButton.tsx'\nimport { SaveListingButton } from '/@fs/__SOURCE__/components/feed/SaveListingButton.tsx'\nimport { MessagesWorkspace } from '/@fs/__SOURCE__/components/messaging/MessagesWorkspace.tsx'\nimport { NotificationsWorkspace } from '/@fs/__SOURCE__/components/notifications/NotificationsWorkspace.tsx'\nimport { MarketplaceSidebar } from '/@fs/__SOURCE__/components/feed/MarketplaceSidebar.tsx'\nimport '/@fs/__SOURCE__/app/globals.css'\nimport './fonts.css'\nconst actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', listing='dddddddd-dddd-4ddd-8ddd-dddddddddddd', thread='cccccccc-cccc-4ccc-8ccc-cccccccccccc'\nconst params=new URLSearchParams(location.search),view=params.get('view')||'people'\nlet screen\nif(view==='notifications')screen=<NotificationsWorkspace actorId={actor}/>\nelse if(view==='profile')screen=<ProfileSocialControls profileId={other}/>\nelse if(view==='likes')screen=<div className=\"flex flex-wrap gap-3\"><LikeListingButton listingId={listing}/><SaveListingButton listingId={listing} saved={false} available/></div>\nelse if(view==='inbox')screen=<MessagesWorkspace actorId={actor} threadId={params.has('thread')?thread:undefined} recipientId={params.has('user')?other:undefined} initialFolder={params.get('folder')||'primary'}/>\nelse screen=<PeopleSearch actorId={actor}/>\ncreateRoot(document.getElementById('root')).render(<><MarketplaceSidebar/><main className=\"mx-auto min-h-screen max-w-6xl p-4 text-text-primary sm:p-6\">{screen}</main></>)\n".replaceAll('__SOURCE__',source));

const server=await createServer({configFile:false,cacheDir:join(folder,'.vite'),root:folder,envDir:false,envPrefix:'RENTRAL_UNUSED_SOCIAL_PREVIEW_',logLevel:'warn',esbuild:{jsx:'automatic'},resolve:{alias:[{find:/^@\/app\/.*$/,replacement:join(folder,'mock-actions.js')},{find:'next/link',replacement:join(folder,'mock-link.jsx')},{find:'next/image',replacement:join(folder,'mock-image.jsx')},{find:'next/navigation',replacement:join(folder,'mock-navigation.js')},{find:'@',replacement:root}]},server:{host:'127.0.0.1',port:4190,strictPort:true,fs:{allow:[root]}}})
await server.listen()
console.log('Isolated social UI preview: http://127.0.0.1:4190 (synthetic data; no environment, database or provider access)')
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void server.close().finally(()=>process.exit(0)))
