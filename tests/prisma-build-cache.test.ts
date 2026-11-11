import { afterEach, beforeEach, expect, it } from 'vitest'
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { inspectPrismaBuildCache, writePrismaBuildCache } from '../scripts/prisma-build-cache.mjs'

const parent = resolve('test-results')
let fixture: string
const generated = (name: string) => join(fixture, 'node_modules/.prisma/client', name)
const native = process.platform === 'win32' ? 'query_engine-windows.dll.node' : process.platform === 'darwin' ? 'libquery_engine-darwin.dylib.node' : 'libquery_engine-debian-openssl-3.0.x.so.node'
async function put(path: string, text: string) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text) }
async function record() {
  const state = await inspectPrismaBuildCache(fixture, {})
  expect((await writePrismaBuildCache(fixture, state.inputHash, {})).written).toBe(true)
}
beforeEach(async () => {
  await mkdir(parent, { recursive: true })
  fixture = await mkdtemp(join(parent, 'prisma-cache-'))
  for (const name of ['prisma', '@prisma/client', '@prisma/engines', '@prisma/engines-version']) await put(join(fixture, 'node_modules', name, 'package.json'), JSON.stringify({ version: '6.19.3' }))
  await put(join(fixture, 'prisma/schema.prisma'), 'model Example { id String @id }')
  await put(join(fixture, 'prisma.config.ts'), 'export default { schema: "prisma/schema.prisma" }')
  for (const name of ['index.js', 'index.d.ts', 'default.js', 'default.d.ts', 'package.json', 'schema.prisma', native]) await put(generated(name), 'synthetic generated artifact: ' + name)
})
afterEach(async () => {
  if (dirname(resolve(fixture)) !== parent || !fixture.startsWith(join(parent, 'prisma-cache-'))) throw new Error('Unexpected fixture cleanup target')
  await rm(fixture, { recursive: true, force: true })
})
it('requires a snapshot created after successful generation, even when generated files already exist', async () => {
  expect((await inspectPrismaBuildCache(fixture, {})).valid).toBe(false)
})
it('reuses all unchanged artifacts even when Prisma formatted the generated schema differently', async () => {
  await put(generated('schema.prisma'), 'model Example {\n  id String @id\n}\n')
  await record()
  expect((await inspectPrismaBuildCache(fixture, {})).valid).toBe(true)
})
it.each(['prisma/schema.prisma', 'prisma.config.ts', 'node_modules/prisma/package.json', 'node_modules/@prisma/client/package.json', 'node_modules/@prisma/engines-version/package.json'])('regenerates after the source or installed tool input changes: %s', async name => {
  await record(); await appendFile(join(fixture, name), '\nchanged')
  expect((await inspectPrismaBuildCache(fixture, {})).valid).toBe(false)
})
it('rejects partially overwritten generated JavaScript even when source was reverted to the old schema', async () => {
  await record(); await appendFile(generated('index.js'), '\n// output from a failed competing generation')
  expect((await inspectPrismaBuildCache(fixture, {})).valid).toBe(false)
})
it('rejects a changed native engine and a missing generated declaration', async () => {
  await record(); await appendFile(generated(native), 'damaged')
  expect((await inspectPrismaBuildCache(fixture, {})).valid).toBe(false)
  await record(); await rm(generated('index.d.ts'))
  expect((await inspectPrismaBuildCache(fixture, {})).valid).toBe(false)
})
it('never stamps an incomplete client or inputs changed during generation', async () => {
  const state = await inspectPrismaBuildCache(fixture, {})
  await appendFile(join(fixture, 'prisma/schema.prisma'), '\n// changed during generation')
  expect((await writePrismaBuildCache(fixture, state.inputHash, {})).written).toBe(false)
  await rm(generated(native))
  const fresh = await inspectPrismaBuildCache(fixture, {})
  expect((await writePrismaBuildCache(fixture, fresh.inputHash, {})).written).toBe(false)
})
it('invalidates changed generation flags without storing their values or runtime credentials', async () => {
  await record()
  const privateFlag = 'synthetic-private-generation-value'
  expect((await inspectPrismaBuildCache(fixture, { PRISMA_CLIENT_ENGINE_TYPE: privateFlag })).valid).toBe(false)
  expect((await inspectPrismaBuildCache(fixture, { MONGODB_URL: 'synthetic-private-database' })).valid).toBe(true)
  const cache = await readFile(join(fixture, 'node_modules/.cache/rentral/prisma-build.json'), 'utf8')
  expect(cache).not.toContain(privateFlag)
  expect(cache).not.toContain('synthetic-private-database')
})
it('ignores leftover engine-copy temporary files and rejects an unreadable snapshot', async () => {
  await record(); await put(generated(native + '.tmp12345'), 'interrupted copy')
  expect((await inspectPrismaBuildCache(fixture, {})).valid).toBe(true)
  await put(join(fixture, 'node_modules/.cache/rentral/prisma-build.json'), '{broken')
  expect((await inspectPrismaBuildCache(fixture, {})).valid).toBe(false)
})