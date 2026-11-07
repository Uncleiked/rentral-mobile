import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'

// Local recovery only: preserve entries accidentally placed in a shareable template.
const templatePath = resolve('.env.staging.example')
const privatePath = resolve('.env.staging')
const original = readFileSync(templatePath, 'utf8')
const source = parse(original)
const privateOriginal = existsSync(privatePath) ? readFileSync(privatePath, 'utf8') : ''
const destination = parse(privateOriginal)
const updates = Object.entries(source).filter(([name, value]) => value.trim() && !destination[name]?.trim())
let privateText = privateOriginal
for (const [name, value] of updates) {
  const expression = new RegExp(`^${name}=.*$`, 'm')
  if (expression.test(privateText)) privateText = privateText.replace(expression, () => `${name}=${value}`)
  else privateText += `\n${name}=${value}`
}
writeFileSync(privatePath, privateText)
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
console.log('Staging entries preserved in the ignored private file; the shareable template contains placeholders only.')
