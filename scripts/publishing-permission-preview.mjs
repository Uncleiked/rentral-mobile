// Loopback-only presentation fixture. No environment files, authentication
// shortcuts, database clients or provider calls are loaded by this harness.
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const requireFromVitest = createRequire(require.resolve('vitest/package.json'))
const { createServer } = await import(pathToFileURL(requireFromVitest.resolve('vite')).href)
const parent = join(root, 'output', 'playwright', 'fixtures')
mkdirSync(parent, { recursive: true })
const fixture = mkdtempSync(join(parent, 'publishing-permission-preview-'))
if (dirname(resolve(fixture)) !== resolve(parent)) throw new Error('Unexpected fixture location.')
writeFileSync(join(fixture, 'index.html'), '<!doctype html><html lang="en" style="--font-sans:Inter,system-ui,sans-serif"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated administration UI verification</title></head><body style="background:var(--color-background-app);font-family:var(--font-sans)"><script>globalThis.process={env:{}}</script><div id="root"></div><script type="module" src="/preview.jsx"></script></body></html>')
const link = join(fixture, 'mock-link.jsx')
writeFileSync(link, 'import React from "react"; export default function Link(props) { return React.createElement("a", props) }')
const image = join(fixture, 'mock-image.jsx')
writeFileSync(image, 'import React from "react"; export default function Image({ unoptimized, priority, fill, ...props }) { return React.createElement("img", props) }')
const navigation = join(fixture, 'mock-navigation.js')
writeFileSync(navigation, 'export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{}});export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>"/marketplace/listing/create";')
const source = root.replaceAll('\\', '/')
writeFileSync(join(fixture, 'fonts.css'), [
  ['400', '400Regular', 'Inter_400Regular.ttf'], ['500', '500Medium', 'Inter_500Medium.ttf'],
  ['600', '600SemiBold', 'Inter_600SemiBold.ttf'], ['700', '700Bold', 'Inter_700Bold.ttf'],
].map(([weight, folder, file]) => `@font-face {font-family:Inter;src:url('/@fs/${source}/node_modules/@expo-google-fonts/inter/${folder}/${file}') format('truetype');font-weight:${weight};font-style:normal;font-display:swap;}`).join('\n'))
writeFileSync(join(fixture, 'preview.jsx'), "\nimport React, { useState } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { AdminRecordReview } from '/@fs/PROJECT/components/admin/AdminRecordReview.tsx'\nimport { GalleryListingWorkspace } from '/@fs/PROJECT/components/listing/GalleryListingWorkspace.tsx'\nimport '/@fs/PROJECT/app/globals.css'\nimport './fonts.css'\nconst actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', member='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'\nfunction App(){\n const view=new URLSearchParams(location.search).get('view')||'member'\n const [galleryAllowed,setGalleryAllowed]=useState(false), [freePostingAllowed,setFreePostingAllowed]=useState(false), [directPublishAllowed,setDirectPublishAllowed]=useState(false)\n const [reason,setReason]=useState(''),[override,setOverride]=useState(false),[operation,setOperation]=useState('set_gallery_permission'),[role,setRole]=useState('member'),[saved,setSaved]=useState(0)\n const selection={kind:'user',value:{id:view==='self'?actor:member,revision:0,email:'synthetic@example.invalid',username:'synthetic',role:view==='self'?'owner':'member',suspended:false,closed:false,galleryAllowed:false,freePostingAllowed:false,directPublishAllowed:false,galleryPermissionRevision:0,createdAt:'2026-11-12T00:00:00Z'}}\n if(view==='gallery')return <GalleryListingWorkspace actorId={actor} allowed permissionRevision={7} draft={null} directPublishAllowed={false} freePostingAllowed={false}/>\n return <><AdminRecordReview selection={selection} actorId={actor} owner permissions={['gallery:manage','listing:waive','user:manage']} blocked={false} busy={false} operation={operation} setOperation={setOperation} role={role} setRole={setRole} reason={reason} setReason={setReason} override={override} setOverride={setOverride} galleryAllowed={galleryAllowed} setGalleryAllowed={setGalleryAllowed} freePostingAllowed={freePostingAllowed} setFreePostingAllowed={setFreePostingAllowed} directPublishAllowed={directPublishAllowed} setDirectPublishAllowed={setDirectPublishAllowed} privateDocument={null} openedDocument={null} onPrepareDocument={()=>{}} onOpenDocument={()=>{}} onClose={()=>{}} onSubmit={()=>setSaved(value=>value+1)}/><p role=\"status\">Synthetic decisions: {saved}</p></>\n}\ncreateRoot(document.getElementById('root')).render(<main style={{maxWidth:1100,margin:'0 auto',padding:16}}><App/></main>)\n".replaceAll('PROJECT', source))
const server = await createServer({
  configFile: false, cacheDir: join(fixture, '.vite'), root: fixture, envDir: false, envPrefix: 'RENTRAL_UNUSED_UI_PREVIEW_', logLevel: 'warn',
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [{ find: 'next/link', replacement: link }, { find: 'next/image', replacement: image }, { find: 'next/navigation', replacement: navigation }, { find: '@', replacement: root }] },
  server: { host: '127.0.0.1', port: 4189, strictPort: true, hmr: false, fs: { allow: [root] } },
})
await server.listen()
console.log('Isolated publishing permission fixture: http://127.0.0.1:4189 (browser-intercepted synthetic records only)')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void server.close().finally(() => process.exit(0)) })