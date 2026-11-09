import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
// The fixture worker runs real source in an independent Node process, without a
// bundler or new runtime dependency. Limit aliases to this repository's TS files.
registerHooks({ resolve(specifier, context, nextResolve) {
  const target = specifier.startsWith('@/') ? pathToFileURL(resolve(root, specifier.slice(2))).href
    : specifier.startsWith('.') && context.parentURL ? new URL(specifier, context.parentURL).href : null
  if (target?.startsWith('file:') && existsSync(fileURLToPath(target) + '.ts')) return nextResolve(target + '.ts', context)
  return nextResolve(specifier, context)
} })
