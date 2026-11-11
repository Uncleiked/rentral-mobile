// Only the build runner may write this snapshot, after standard Prisma generation
// succeeds. It contains hashes, never environment values or database settings.
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const version = 1
const stampPath = root => join(root, 'node_modules', '.cache', 'rentral', 'prisma-build.json')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const required = ['index.js', 'index.d.ts', 'default.js', 'default.d.ts', 'package.json', 'schema.prisma']
const inputFiles = ['prisma/schema.prisma', 'prisma.config.ts', 'node_modules/prisma/package.json',
  'node_modules/@prisma/client/package.json', 'node_modules/@prisma/engines/package.json',
  'node_modules/@prisma/engines-version/package.json']

export async function currentInputHash(root, env = process.env) {
  const files = await Promise.all(inputFiles.map(async name => [name, hash(await readFile(join(root, name)))]))
  const flags = Object.entries(env).filter(([name]) => name.startsWith('PRISMA_') || ['NODE_ENV', 'NODE_OPTIONS'].includes(name))
    .sort(([left], [right]) => left.localeCompare(right))
  return hash(JSON.stringify({ version, files, flags, platform: process.platform, architecture: process.arch, node: process.versions.node }))
}

async function artifacts(root) {
  const base = join(root, 'node_modules', '.prisma', 'client')
  if (!(await lstat(base)).isDirectory()) throw new Error('CLIENT_INCOMPLETE')
  const result = []
  async function visit(relative = '') {
    for (const entry of await readdir(join(base, relative), { withFileTypes: true })) {
      if (/\.tmp\d+(?:-|$)/.test(entry.name)) continue
      const path = relative ? relative + '/' + entry.name : entry.name
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) result.push([path, hash(await readFile(join(base, path)))])
      else throw new Error('CLIENT_INCOMPLETE')
    }
  }
  await visit()
  const names = new Set(result.map(([name]) => name))
  const native = [...names].some(name => {
    const file = basename(name)
    return process.platform === 'win32' ? /^(?:query_engine-windows\.dll\.node|query-engine-windows\.exe)$/.test(file)
      : process.platform === 'darwin' ? /(?:query_engine-darwin.*\.dylib\.node|query-engine-darwin.*)$/.test(file)
        : /(?:query_engine-.*\.so\.node|query-engine-.*)$/.test(file)
  })
  if (!native || !required.every(name => names.has(name))) throw new Error('CLIENT_INCOMPLETE')
  return result.sort(([left], [right]) => left.localeCompare(right))
}

export async function inspectPrismaBuildCache(root, env = process.env) {
  let inputHash = null
  try { inputHash = await currentInputHash(root, env) }
  catch { return { valid: false, reason: 'inputs-unavailable', inputHash } }
  try {
    const stamp = JSON.parse(await readFile(stampPath(root), 'utf8'))
    if (stamp?.version !== version || stamp.inputHash !== inputHash || !Array.isArray(stamp.artifacts)) return { valid: false, reason: 'inputs-changed', inputHash }
    const current = await artifacts(root)
    if (JSON.stringify(stamp.artifacts) !== JSON.stringify(current)) return { valid: false, reason: 'generated-client-changed', inputHash }
    return { valid: true, reason: 'unchanged', inputHash }
  } catch { return { valid: false, reason: 'snapshot-unavailable', inputHash } }
}

export async function writePrismaBuildCache(root, expectedInputHash, env = process.env) {
  let temporary
  try {
    if (!expectedInputHash || await currentInputHash(root, env) !== expectedInputHash) return { written: false, reason: 'inputs-changed-during-generation' }
    const snapshot = await artifacts(root)
    // Refuse a stamp if source/config changed while generated artifacts were read.
    if (await currentInputHash(root, env) !== expectedInputHash) return { written: false, reason: 'inputs-changed-during-generation' }
    const target = stampPath(root)
    await mkdir(join(root, 'node_modules', '.cache', 'rentral'), { recursive: true })
    temporary = target + '.tmp-' + process.pid + '-' + randomUUID()
    await writeFile(temporary, JSON.stringify({ version, inputHash: expectedInputHash, artifacts: snapshot }) + '\n', { flag: 'wx', mode: 0o600 })
    await rename(temporary, target)
    return { written: true, reason: 'generated' }
  } catch { return { written: false, reason: 'snapshot-unavailable' } }
  finally { if (temporary) await unlink(temporary).catch(() => undefined) }
}