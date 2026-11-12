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
const fixture = mkdtempSync(join(parent, 'organization-ui-preview-'))
if (dirname(resolve(fixture)) !== resolve(parent)) throw new Error('Unexpected fixture location.')
writeFileSync(join(fixture, 'index.html'), '<!doctype html><html lang="en" style="--font-sans:Inter,system-ui,sans-serif"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated administration UI verification</title></head><body style="background:var(--color-background-app);font-family:var(--font-sans)"><div id="root"></div><script type="module" src="/preview.jsx"></script></body></html>')
const link = join(fixture, 'mock-link.jsx')
writeFileSync(link, 'import React from "react"; export default function Link(props) { return React.createElement("a", props) }')
const image = join(fixture, 'mock-image.jsx')
writeFileSync(image, 'import React from "react"; export default function Image({ unoptimized, priority, fill, ...props }) { return React.createElement("img", props) }')
const source = root.replaceAll('\\', '/')
writeFileSync(join(fixture, 'fonts.css'), [
  ['400', '400Regular', 'Inter_400Regular.ttf'], ['500', '500Medium', 'Inter_500Medium.ttf'],
  ['600', '600SemiBold', 'Inter_600SemiBold.ttf'], ['700', '700Bold', 'Inter_700Bold.ttf'],
].map(([weight, folder, file]) => `@font-face {font-family:Inter;src:url('/@fs/${source}/node_modules/@expo-google-fonts/inter/${folder}/${file}') format('truetype');font-weight:${weight};font-style:normal;font-display:swap;}`).join('\n'))
writeFileSync(join(fixture, 'preview.jsx'), `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { OrganizationAdminQueue } from '/@fs/${source}/components/organizations/OrganizationAdminQueue.tsx'
import '/@fs/${source}/app/globals.css'
import './fonts.css'
createRoot(document.getElementById('root')).render(<main style={{maxWidth:1440, margin:'0 auto', padding:16}}><OrganizationAdminQueue actorId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" onDecisionRecorded={()=>{window.__orgDecisions=(window.__orgDecisions??0)+1}} /></main>)
`)
const server = await createServer({
  configFile: false, cacheDir: join(fixture, '.vite'), root: fixture, envDir: false, envPrefix: 'RENTRAL_UNUSED_UI_PREVIEW_', logLevel: 'warn',
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [{ find: 'next/link', replacement: link }, { find: 'next/image', replacement: image }, { find: '@', replacement: root }] },
  server: { host: '127.0.0.1', port: 4188, strictPort: true, hmr: false, fs: { allow: [root] } },
})
await server.listen()
console.log('Isolated organization review fixture: http://127.0.0.1:4188 (browser-intercepted synthetic records only)')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void server.close().finally(() => process.exit(0)) })