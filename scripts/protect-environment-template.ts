import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Preserve the complete original privately before removing credentials from a
// shareable example. Never change the active .env.local or .env.staging files.
const templatePath = resolve('.env.staging.example')
const privatePath = resolve(`.env.staging.example.private-backup-${Date.now()}`)
const original = readFileSync(templatePath, 'utf8')
writeFileSync(privatePath, original, { flag: 'wx' })
const sanitized = original.split(/\r?\n/).map(line => {
  const match = /^(\w+)=/.exec(line)
  if (!match) return line
  const name = match[1]
  if (name === 'NEXT_PUBLIC_SUPABASE_URL') return `${name}=https://YOUR-STAGING-PROJECT-REF.supabase.co`
  if (name === 'NEXT_PUBLIC_APP_URL') return `${name}=https://YOUR-STAGING-HOST.example`
  if (name.endsWith('ENABLED')) return `${name}=false`
  if (name === 'NEXT_PUBLIC_MAX_OPTIONAL_LISTING_FEE_NGN') return `${name}=10000000`
  return `${name}=`
}).join('\n')
if (readFileSync(templatePath, 'utf8') !== original) throw new Error('The template changed during recovery. Retry after saving your editor.')
writeFileSync(templatePath, sanitized)
console.log('Original example preserved in an ignored private backup; the shareable template contains placeholders only. Active environment files were preserved.')
