import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const execute = promisify(execFile)
it('generates a private local signing key once and preserves existing connection/settings', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'rentral-local-setup-'))
  try {
    await mkdir(path.join(fixture, 'scripts'))
    const script = path.join(fixture, 'scripts', 'setup-local-auth.mjs')
    await copyFile(path.resolve('scripts/setup-local-auth.mjs'), script)
    const file = path.join(fixture, '.env.local')
    const original = 'MONGODB_URL=mongodb://127.0.0.1:27017/my_existing_database\nRENTRAL_PLATFORM_ENABLED=false\n'
    await writeFile(file, original)
    const firstRun = await execute(process.execPath, [script])
    const first = await readFile(file, 'utf8')
    const secret = /^JWT_SECRET=(.+)$/m.exec(first)?.[1]
    expect(first).toContain(original)
    expect(secret).toMatch(/^[A-Za-z0-9_-]{64}$/)
    expect(firstRun.stdout).not.toContain(secret)
    await execute(process.execPath, [script])
    expect(await readFile(file, 'utf8')).toBe(first)
  } finally { await rm(fixture, { recursive: true, force: true }) }
})
