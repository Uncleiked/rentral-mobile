import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../.env.local', import.meta.url)
let content = await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })
function addIfMissing(key, value) {
  const pattern = new RegExp(`^\\s*${key}\\s*=(.*)$`, 'm')
  const existing = pattern.exec(content)
  if (existing && existing[1].trim()) return
  const line = `${key}=${value}`
  content = existing ? content.replace(pattern, line) : `${content}${content.endsWith('\n') || !content ? '' : '\n'}${line}\n`
}
addIfMissing('MONGODB_URL', 'mongodb://127.0.0.1:27017/rentral?replicaSet=rs0&directConnection=true')
addIfMissing('JWT_SECRET', randomBytes(48).toString('base64url'))
addIfMissing('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
addIfMissing('AUTH_DEV_EMAIL_OUTBOX', 'true')
addIfMissing('RENTRAL_PLATFORM_ENABLED', 'true')
await writeFile(file, content, { encoding: 'utf8', mode: 0o600 })
process.stdout.write('Local settings are ready. Existing database and secret values were preserved. Run npm run db:setup before starting the backend.\n')
