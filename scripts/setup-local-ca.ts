import { X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'

async function main(): Promise<void> {
  const envFile = resolve('.env.local')
  if (!existsSync(envFile)) throw new Error('Create .env.local first.')
  const original = readFileSync(envFile, 'utf8')
  if (parse(original).SUPABASE_DB_CA_CERT_PATH) {
    console.log('The local environment already has a database CA path; preserved it.')
    return
  }
  const response = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt', {
    signal: AbortSignal.timeout(15000), redirect: 'error',
  })
  if (!response.ok) throw new Error('The public Supabase CA could not be downloaded.')
  const pem = await response.text()
  const cert = new X509Certificate(pem)
  if (!cert.ca || Date.parse(cert.validTo) <= Date.now() || Date.parse(cert.validFrom) > Date.now()) throw new Error('The public CA is invalid or expired.')
  mkdirSync(resolve('certificates'), { recursive: true })
  writeFileSync(resolve('certificates/supabase-ca.crt'), pem)
  if (readFileSync(envFile, 'utf8') !== original) throw new Error('The environment file changed during setup. Run this command again after saving it.')
  const setting = 'SUPABASE_DB_CA_CERT_PATH=certificates/supabase-ca.crt'
  const updated = /^SUPABASE_DB_CA_CERT_PATH=.*$/m.test(original)
    ? original.replace(/^SUPABASE_DB_CA_CERT_PATH=.*$/m, setting)
    : `${original.trimEnd()}\n\n# Supabase database CA; certificate verification remains enabled.\n${setting}\n`
  writeFileSync(envFile, updated)
  console.log('Saved the public CA in ignored certificates/ and configured .env.local. Existing credentials were preserved.')
}

main().catch(() => { console.error('Local CA setup failed. No credentials were displayed.'); process.exitCode = 1 })
