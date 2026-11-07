import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { parse } from 'dotenv'

// An explicit launcher avoids Next.js silently falling back to production local keys.
function main(): void {
  const file = resolve('.env.staging')
  if (!existsSync(file)) throw new Error('Create .env.staging using .env.staging.example first.')
  const staging = parse(readFileSync(file))
  const local = existsSync('.env.local') ? parse(readFileSync('.env.local')) : {}
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'DIRECT_URL', 'NEXT_PUBLIC_APP_URL']
  if (required.some(name => !staging[name]?.trim())) throw new Error('The staging file is missing required Supabase, database or app settings.')
  const supabase = new URL(staging.NEXT_PUBLIC_SUPABASE_URL)
  if (supabase.protocol !== 'https:' || !supabase.hostname.endsWith('.supabase.co')) throw new Error('Use a separate hosted Supabase staging project URL.')
  const projectRef = supabase.hostname.split('.')[0]
  if (local.NEXT_PUBLIC_SUPABASE_URL && new URL(local.NEXT_PUBLIC_SUPABASE_URL).hostname === supabase.hostname) throw new Error('Staging must use a different Supabase project from .env.local.')
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const database = new URL(staging[name])
    if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      !(database.hostname === `db.${projectRef}.supabase.co` || decodeURIComponent(database.username).endsWith(`.${projectRef}`))) {
      throw new Error('A staging database connection does not match the staging Supabase project. Check its Connect settings.')
    }
  }
  const args = process.argv.slice(2).filter(argument => argument !== '--')
  const command = args.shift()
  if (!command || !['dev', 'build', 'start', 'prisma'].includes(command)) throw new Error('Usage: pnpm staging dev --port 3101 | pnpm staging prisma migrate status | pnpm staging build')
  if (command === 'prisma' && !(
    (args[0] === 'migrate' && ['status', 'deploy', 'diff'].includes(args[1] ?? '')) || args[0] === 'validate' || args[0] === 'generate'
  )) throw new Error('The staging launcher permits only Prisma validate, generate, migrate status, migrate diff and migrate deploy.')
  const isolatedNames = new Set([...Object.keys(local), ...Object.keys(staging), ...Object.keys(process.env).filter(name => /^(NEXT_PUBLIC_|SUPABASE_|DIDIT_|MUX_|PAYSTACK_|OPAY_|GEMINI_|RENTRAL_|MEDIA_WORKER_|LIFECYCLE_|RESEND_|ANALYTICS_|GEOAPIFY_|DATABASE_URL$|DIRECT_URL$)/.test(name))])
  const environment = { ...process.env }
  for (const name of isolatedNames) environment[name] = staging[name] ?? ''
  // Preserve the chosen file for Prisma; Next receives staging values in process.env.
  environment.RENTRAL_ENV_FILE = file
  for (const flag of ['RENTRAL_PLATFORM_ENABLED', 'RENTRAL_SAFETY_ENABLED', 'PAYMENTS_ENABLED', 'MUX_ENABLED', 'MEDIA_WORKER_ENABLED', 'LIFECYCLE_WORKER_ENABLED', 'RENTRAL_REALTIME_ENABLED', 'RENTRAL_ANALYTICS_ENABLED']) environment[flag] = staging[flag] || 'false'
  environment.NEXT_PUBLIC_POSTHOG_ENABLED = staging.NEXT_PUBLIC_POSTHOG_ENABLED || 'false'
  const executable = command === 'prisma' ? resolve('node_modules/prisma/build/index.js') : resolve('node_modules/next/dist/bin/next')
  const child = spawn(process.execPath, [...(command === 'prisma' ? [executable] : [executable, command]), ...args], { env: environment, stdio: 'inherit', shell: false })
  child.on('error', () => { console.error('The staging command could not start. Install dependencies with pnpm first.'); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
}

try { main() } catch (error) { console.error(error instanceof Error ? error.message : 'Staging configuration is invalid.'); process.exitCode = 1 }
