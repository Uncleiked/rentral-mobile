import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

const knownJobs = new Set(['reservation-expiry', 'renewal-reminders', 'termination-release', 'analytics-retention', 'notification-email', 'financial-reconciliation', 'auth-email-delivery', 'push-dispatch', 'push-receipts'])
const countFields = new Set(['expiredListings', 'reminders', 'emails', 'prunedEvents', 'prunedMappings', 'releasedLeases', 'claimed', 'processed', 'submitted', 'reconciled', 'uncertain', 'failed', 'skipped'])

export function localWorkerOrigin(value = 'http://localhost:3000') {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Worker API origin must be a loopback HTTP(S) origin without credentials, path or query.')
  }
  return url.origin
}
export function workerOptions(args) {
  const options = { once: false, help: false, intervalMs: 30000, timeoutMs: 150000 }
  for (const arg of args) {
    if (arg === '--once') options.once = true
    else if (arg === '--help') options.help = true
    else if (/^--interval-ms=\d+$/.test(arg)) options.intervalMs = Number(arg.split('=')[1])
    else if (/^--timeout-ms=\d+$/.test(arg)) options.timeoutMs = Number(arg.split('=')[1])
    else throw new Error('Use --once, --interval-ms=30000 or --timeout-ms=150000.')
  }
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 1000 || options.intervalMs > 3600000 || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 180000) throw new Error('Worker interval/timeout is out of range.')
  return options
}
export function workerJobs(env) {
  const jobs = [], problems = []
  for (const [name, flag, secretName, path] of [
    ['lifecycle', 'LIFECYCLE_WORKER_ENABLED', 'LIFECYCLE_WORKER_SECRET', '/api/internal/lifecycle-worker'],
    ['media', 'MEDIA_WORKER_ENABLED', 'MEDIA_WORKER_SECRET', '/api/internal/media-worker'],
  ]) {
    if (env[flag] !== 'true') continue
    const secret = env[secretName]
    if (typeof secret !== 'string' || secret.length < 32 || /\s/.test(secret)) { problems.push({ job: name, code: `CONFIGURE_${secretName}` }); continue }
    jobs.push({ name, path, secret })
  }
  return { jobs, problems }
}
async function boundedJson(response) {
  if (!response.body) throw new Error('Invalid worker response.')
  const reader = response.body.getReader(), chunks = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 65536) { await reader.cancel(); throw new Error('Invalid worker response.') }
      chunks.push(next.value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
function resultCounts(data) {
  const counts = {}
  for (const [key, value] of Object.entries(data)) if (countFields.has(key) && Number.isSafeInteger(value) && value >= 0) counts[key] = value
  if (data.financial && typeof data.financial === 'object' && !Array.isArray(data.financial)) {
    for (const key of ['receipts', 'operations']) {
      const value = data.financial[key]
      if (Number.isSafeInteger(value) && value >= 0) counts[`financial.${key}`] = value
    }
  }
  if (data.authEmail && typeof data.authEmail === 'object' && !Array.isArray(data.authEmail)) {
    for (const key of ['sent', 'expired']) {
      const value = data.authEmail[key]
      if (Number.isSafeInteger(value) && value >= 0) counts[`authEmail.${key}`] = value
    }
  }
  if (data.push && typeof data.push === 'object' && !Array.isArray(data.push)) {
    for (const key of ['queued', 'submitted', 'confirmed', 'uncertain', 'failed', 'prunedMetadata']) {
      const value = data.push[key]
      if (Number.isSafeInteger(value) && value >= 0) counts[`push.${key}`] = value
    }
  }
  return counts
}
export async function runWorkerTick(origin, jobs, { timeoutMs, signal }, request = fetch) {
  const results = []
  for (const job of jobs) {
    if (signal.aborted) break
    if (!['/api/internal/lifecycle-worker', '/api/internal/media-worker'].includes(job.path)) { results.push({ job: job.name, status: 'failed', code: 'INVALID_WORKER_TARGET' }); continue }
    try {
      const response = await request(new URL(job.path, localWorkerOrigin(origin)), { method: 'POST', headers: { Authorization: `Bearer ${job.secret}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) })
      const body = await boundedJson(response)
      if (!response.ok || !body || typeof body !== 'object' || body.success !== true || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
        results.push({ job: job.name, status: 'failed', code: `HTTP_${response.status}` }); continue
      }
      const failedJobs = Array.isArray(body.data.failedJobs) ? body.data.failedJobs.filter(value => typeof value === 'string' && knownJobs.has(value)) : []
      results.push({ job: job.name, status: failedJobs.length ? 'partial' : 'ok', counts: resultCounts(body.data), ...(failedJobs.length ? { failedJobs } : {}) })
    } catch { if (!signal.aborted) results.push({ job: job.name, status: 'failed', code: 'REQUEST_UNCONFIRMED' }) }
  }
  return results
}
function privateEnvironment() {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(file)
    if (!existsSync(path)) continue
    const values = parseEnv(readFileSync(path, 'utf8'))
    for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value
  }
}
async function pause(ms, signal) {
  if (signal.aborted) return
  await new Promise(accept => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); accept() }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}
async function main() {
  const options = workerOptions(process.argv.slice(2))
  if (options.help) { console.log('Local worker: npm run worker -- [--once] [--interval-ms=30000] [--timeout-ms=150000]'); return }
  privateEnvironment()
  const origin = localWorkerOrigin(process.env.RENTRAL_WORKER_API_URL ?? 'http://localhost:3000')
  const { jobs, problems } = workerJobs(process.env)
  for (const problem of problems) console.error(`[worker] ${problem.job}: ${problem.code}`)
  if (!jobs.length) throw new Error('No worker jobs are enabled with valid credentials. Configure the worker gates and secrets first.')
  const stopping = new AbortController()
  const stop = () => stopping.abort()
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
  try {
    do {
      const results = await runWorkerTick(origin, jobs, { timeoutMs: options.timeoutMs, signal: stopping.signal })
      for (const result of results) console.log(JSON.stringify(result))
      if (options.once) { if (problems.length || results.some(result => result.status !== 'ok')) process.exitCode = 1; break }
      await pause(options.intervalMs, stopping.signal)
    } while (!stopping.signal.aborted)
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('[worker] Configuration or startup failed. Check the local API origin, enabled worker flags, valid secrets and timing options. Private settings were not logged.'); process.exitCode = 1 })
}
