import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inspectPrismaBuildCache, writePrismaBuildCache } from './prisma-build-cache.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, 'package.json'))
function cli(packageName, command) {
  const path = require.resolve(packageName + '/package.json')
  const metadata = JSON.parse(readFileSync(path, 'utf8'))
  return resolve(dirname(path), typeof metadata.bin === 'string' ? metadata.bin : metadata.bin[command])
}
function run(file, args, capture = false) {
  return spawnSync(process.execPath, [file, ...args], { cwd: root, windowsHide: true,
    stdio: capture ? 'pipe' : 'inherit', ...(capture ? { encoding: 'utf8' } : {}) })
}
async function main() {
  const current = await inspectPrismaBuildCache(root)
  if (current.valid) {
    console.log('[build] Prisma Client matches the schema and installed tools; reusing its verified generated files.')
  } else {
    const generated = run(cli('prisma', 'prisma'), ['generate'], true)
    if (generated.stdout) process.stdout.write(generated.stdout)
    if (generated.stderr) process.stderr.write(generated.stderr)
    if (generated.error || generated.status !== 0) {
      if (/EPERM/i.test(generated.stderr ?? '') && /query_engine[^\r\n]*\.node/i.test(generated.stderr ?? '')) {
        console.error('\n[build] Windows has locked the Prisma engine used by a running Rentral server. Stop this project\'s dev/start process with Ctrl+C, then run npm run build again. Other Node applications can stay running.')
      }
      process.exitCode = generated.status || 1
      return
    }
    const recorded = await writePrismaBuildCache(root, current.inputHash)
    if (!recorded.written) {
      console.error('[build] The generated client could not be verified for these inputs. Run npm run build again after checking that generation completed and the schema is unchanged.')
      process.exitCode = 1
      return
    }
  }
  const result = run(cli('next', 'next'), ['build', ...process.argv.slice(2)])
  process.exitCode = result.status ?? 1
}
main().catch(() => {
  console.error('[build] Build preparation failed. Check dependencies and filesystem access, then retry. Private environment values were not logged.')
  process.exitCode = 1
})