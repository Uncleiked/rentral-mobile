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
writeFileSync(join(root, 'output', 'playwright', 'responsive-audit.js'), "async page => {\n  await page.addInitScript(()=>{globalThis.process={env:{}}});\n  const errors=[], failures=[], results=[];\n  page.on('pageerror',error=>errors.push(error.message));\n  const views=['organization','sign-in','forgot-password','reset-password','booking','create-listing','gallery-listing','matching','account','feed','public','profile'];\n  for(const width of [320,390,768,1024,1440]){\n    await page.setViewportSize({width,height:900});\n    for(const view of views){\n      await page.goto('http://127.0.0.1:4186/?view='+view,{waitUntil:'domcontentloaded',timeout:60000});\n      await page.locator('main').waitFor({state:'visible'});\n      if(view==='organization')await page.getByRole('textbox',{name:'Registered legal name',exact:true}).waitFor();\n      if(view==='matching')await page.getByText('Your preferences',{exact:true}).waitFor();\n      await page.evaluate(()=>document.fonts.ready);\n      const state=await page.evaluate(()=>{\n        const root=document.documentElement, body=getComputedStyle(document.body);\n        const pixel=document.createElement('canvas');pixel.width=pixel.height=1;const context=pixel.getContext('2d',{willReadFrequently:true});\n        const luminance=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);const channels=[...context.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]};\n        const background=luminance(body.backgroundColor),foreground=luminance(body.color);\n        const fields=[...document.querySelectorAll('input:not([type=checkbox],[type=radio],[type=hidden]),select,textarea')].filter(el=>el.getBoundingClientRect().height>0);\n        const tinyFields=fields.filter(el=>innerWidth<640 && parseFloat(getComputedStyle(el).fontSize)<16).length;\n        const offscreen=[...document.querySelectorAll('main *')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.height>0&&s.position!=='absolute'&&s.position!=='fixed'&&s.visibility!=='hidden'&&(r.right>innerWidth+1||r.left< -1)}).slice(0,5).map(el=>({tag:el.tagName,classes:el.className,right:el.getBoundingClientRect().right}));\n        return{overflow:root.scrollWidth>innerWidth+1,contrast:(foreground+.05)/(background+.05),background,tinyFields,offscreen,font:body.fontFamily,bodyRadius:getComputedStyle(root).getPropertyValue('--radius-2xl').trim()};\n      });\n      const result={view,width,...state};results.push(result);\n      if(state.overflow||state.contrast<4.5||state.background>.12||state.tinyFields)failures.push(result);\n      if(width===390||width===1440&&view==='organization')await page.screenshot({path:'output/playwright/'+view+'-'+width+'.png',fullPage:true});\n    }\n  }\n  if(failures.length||errors.length)throw new Error('Responsive audit failed: '+JSON.stringify({failures,errors}));\n  return {cases:results.length,failures,errors,brandRadius:results[0].bodyRadius};\n}")
const source = root.replaceAll('\\', '/')
writeFileSync(join(folder, 'index.html'), '<!doctype html><html lang="en" class="dark" style="--font-rentral:Inter,system-ui,sans-serif"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Isolated Rentral UI verification</title></head><body><script>globalThis.process={env:{}}</script><div id="root"></div><script type="module" src="/preview.jsx"></script></body></html>')
writeFileSync(join(folder, 'mock-link.jsx'), 'import React from "react";export default function Link({prefetch,replace,scroll,...props}){return React.createElement("a",props)}')
writeFileSync(join(folder, 'mock-image.jsx'), 'import React from "react";export default function Image({fill,priority,quality,unoptimized,loader,...props}){return React.createElement("img",{...props,style:{...props.style,...(fill?{position:"absolute",inset:0,width:"100%",height:"100%"}:{})}})}')
writeFileSync(join(folder, 'mock-navigation.js'), 'export const usePathname=()=>"/marketplace";const router={push:()=>{},replace:()=>{},refresh:()=>{},back:()=>{}};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const redirect=()=>{};export const notFound=()=>{};')
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
import { AccountPage } from '/@fs/${source}/components/layout/AccountPage.tsx'
import { MarketplaceShell } from '/@fs/${source}/components/layout/MarketplaceShell.tsx'
import { PublicPage } from '/@fs/${source}/components/layout/PublicPage.tsx'
import { ApiActorScope } from '/@fs/${source}/components/account/ApiActorScope.tsx'
import { OrganizationApplicationForm } from '/@fs/${source}/components/organizations/OrganizationApplicationForm.tsx'
import AuthForm from '/@fs/${source}/app/(auth)/sign-in/AuthForm.tsx'
import ForgotPasswordPage from '/@fs/${source}/app/(auth)/forgot-password/page.tsx'
import ResetPasswordPage from '/@fs/${source}/app/(auth)/reset-password/page.tsx'
import { BookingRequestForm } from '/@fs/${source}/components/bookings/BookingRequestForm.tsx'
import { CreateListingWizard } from '/@fs/${source}/components/listing/CreateListingWizard.tsx'
import { GalleryListingWorkspace } from '/@fs/${source}/components/listing/GalleryListingWorkspace.tsx'
import { MatchingWorkspace } from '/@fs/${source}/components/matching/MatchingWorkspace.tsx'
import { EditProfileModal } from '/@fs/${source}/components/profile/EditProfileModal.tsx'
import { AccountLifecycleCard } from '/@fs/${source}/components/account/AccountLifecycleCard.tsx'
import { AnalyticsPreferences } from '/@fs/${source}/components/privacy/AnalyticsPreferences.tsx'
import { MarketplaceFeedCard } from '/@fs/${source}/components/feed/MarketplaceFeedCard.tsx'
import { MarketplaceHeader } from '/@fs/${source}/components/feed/MarketplaceHeader.tsx'
import '/@fs/${source}/app/globals.css'
import './fonts.css'

const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const view = new URLSearchParams(location.search).get('view') || 'organization'
const respond=data=>new Response(JSON.stringify({success:true,data}),{headers:{'Content-Type':'application/json'}})
const nativeFetch=window.fetch.bind(window)
window.fetch=(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href)
 if(url.origin!==location.origin)return Promise.reject(new Error('External requests are disabled in the isolated preview'))
 if(!url.pathname.startsWith('/api/'))return nativeFetch(input,options)
 if((options.method||'GET')!=='GET')return Promise.resolve(new Response(JSON.stringify({success:false,code:'PREVIEW_ONLY',error:'This preview does not save data.'}),{status:503,headers:{'Content-Type':'application/json'}}))
 if(url.pathname==='/api/v1/organizations/me')return Promise.resolve(respond({application:null}))
 if(url.pathname==='/api/v1/squat-mates/profile')return Promise.resolve(respond({profile:null,canDiscover:false}))
 return Promise.resolve(new Response(JSON.stringify({success:false,code:'PREVIEW_ONLY',error:'Synthetic unavailable state. Check your connection and retry.'}),{status:503,headers:{'Content-Type':'application/json'}}))
}
const poster='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="900"><rect fill="darkslategray" width="800" height="900"/><text x="50" y="110" fill="white" font-size="30">Synthetic walkthrough preview</text></svg>')
const listing={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'Bright studio apartment with a flexible workspace and a long descriptive listing title',category:'house',username:'verified_host_with_a_long_public_username',avatarUrl:null,isVerified:false,location:'A very long neighbourhood address near Yaba, Lagos Mainland',price:'12,345,678,900.00',priceDenomination:'year',intent:'rent',badges:['Studio','Dedicated workspace','Flexible move-in'],videoUrl:null,posterUrl:poster,useMux:false,saved:false,savingAvailable:true}
const heading=title=><header className="mb-7 min-w-0"><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent-hover">Your Rentral workspace</p><h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1></header>
const workspace=(title,children)=><MarketplaceShell>{heading(title)}{children}</MarketplaceShell>
const profile={id:actor,username:'synthetic_host',displayName:'Synthetic host',email:'a_very_long_private_email_address_for_layout_testing@example.invalid',accountType:'individual',bio:'Synthetic profile text',dateOfBirth:null,phoneNumber:'08000000000',country:'Nigeria',address:'Synthetic street address',avatarUrl:null,kycVerified:false,verificationStatus:'unverified',memberSince:new Date(),pendingEmail:null}
function ProfilePreview(){const [open,setOpen]=React.useState(false);return workspace('Your profile',<><button className="min-h-11 rounded-xl border border-border-subtle px-5 py-3" onClick={()=>setOpen(true)}>Edit profile</button><EditProfileModal profile={profile} isOpen={open} onClose={()=>setOpen(false)}/></>)}
let screen
switch(view){
 case 'sign-in':screen=<AccountPage><AuthForm providers={{google:true,apple:false}}/></AccountPage>;break
 case 'forgot-password':screen=<ForgotPasswordPage/>;break
 case 'reset-password':screen=<ResetPasswordPage/>;break
 case 'booking':screen=workspace('Book your inspection',<BookingRequestForm listingId={listing.id} category="house" priceNaira="1500000" enabled/>);break
 case 'create-listing':screen=workspace('Create a listing',<CreateListingWizard draft={null} actorId={actor}/>);break
 case 'gallery-listing':screen=workspace('Create a gallery listing',<GalleryListingWorkspace actorId={actor} allowed permissionRevision={1} draft={null}/>);break
 case 'matching':screen=workspace('Find your Squat-Mate',<MatchingWorkspace/>);break
 case 'profile':screen=<ProfilePreview/>;break
 case 'account':screen=workspace('Account and privacy',<div className="grid min-w-0 gap-6 lg:grid-cols-2"><AccountLifecycleCard userId={actor}/><AnalyticsPreferences initialAllowed={false}/></div>);break
 case 'feed':screen=<MarketplaceShell><MarketplaceHeader filters={{category:'all',view:'feed',q:'',minPrice:null,maxPrice:null,intent:'all'}}/><MarketplaceFeedCard listing={listing}/></MarketplaceShell>;break
 case 'public':screen=<PublicPage eyebrow="Get in touch" title="Help with your next move"><section><h2 className="text-xl font-semibold text-text-primary">We are here to help</h2><p>Help for bookings, listing evidence and account questions.</p><p className="break-words">support-reference-with-a-very-long-identifier-for-a-small-screen-layout-check</p></section></PublicPage>;break
 default:screen=<AccountPage wide><header className="mb-7 min-w-0"><p className="text-xs font-semibold uppercase tracking-widest text-accent-hover">Organization registration</p><h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Introduce your organization</h1><p className="mt-3 text-sm leading-6 text-text-secondary">Submit your registration evidence for an administrator to review.</p></header><OrganizationApplicationForm actorId={actor}/></AccountPage>
}
createRoot(document.getElementById('root')).render(<ApiActorScope actorId={actor}>{screen}</ApiActorScope>)
`)
const server=await createServer({
 configFile:false,cacheDir:join(folder,'.vite'),root:folder,envDir:false,envPrefix:'RENTRAL_UNUSED_UI_PREVIEW_',logLevel:'warn',esbuild:{jsx:'automatic'},
 plugins:[{name:'isolated-ui-actions',enforce:'pre',resolveId(id,importer){
  if(id.startsWith('@/app/') && /actions|profile-edit/.test(id))return join(folder,'mock-actions.js')
  if(id==='./actions'&&importer?.includes('/app/'))return join(folder,'mock-actions.js')
 }}],
 resolve:{alias:[{find:/^@\/app\/.*$/,replacement:join(folder,'mock-actions.js')},{find:'next/link',replacement:join(folder,'mock-link.jsx')},{find:'next/image',replacement:join(folder,'mock-image.jsx')},{find:'next/navigation',replacement:join(folder,'mock-navigation.js')},{find:'@',replacement:root}]},
 server:{host:'127.0.0.1',port:4186,strictPort:true,fs:{allow:[root]}},
})
await server.listen()
console.log('Isolated Rentral UI preview: http://127.0.0.1:4186 (synthetic data, no database or providers)')
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void server.close().finally(()=>process.exit(0)))
