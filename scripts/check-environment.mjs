import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mongoUrl } from '../lib/database/config.ts'

const flags = ['GOOGLE_AUTH_ENABLED', 'AUTH_DEV_EMAIL_OUTBOX', 'RENTRAL_PLATFORM_ENABLED', 'RENTRAL_SAFETY_ENABLED', 'PAYMENTS_ENABLED', 'SETTLEMENT_ENABLED', 'PAYSTACK_TRANSFERS_ENABLED', 'PAYSTACK_REFUNDS_ENABLED', 'MUX_ENABLED', 'MEDIA_WORKER_ENABLED', 'LIFECYCLE_WORKER_ENABLED', 'AUTH_EMAIL_ENABLED', 'NOTIFICATION_EMAIL_ENABLED', 'PUSH_NOTIFICATIONS_ENABLED', 'COMMERCIAL_ENABLED', 'RENTRAL_ANALYTICS_ENABLED', 'NEXT_PUBLIC_POSTHOG_ENABLED', 'OLUSO_ENABLED']
const publicNames = new Set(['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_EAS_PROJECT_ID'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const cutoff = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
function origin(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash } catch { return false }
}
function encodedKey(value, encoding) {
  try { const bytes = Buffer.from(value ?? '', encoding); return bytes.length === 32 && bytes.toString(encoding) === value } catch { return false }
}

/** Offline inspection only. Report key names and instructions, never values. */
export function inspectEnvironment(backend, mobile) {
  const errors = [], notes = []
  const fail = (key, message) => errors.push({ key, message })
  const enabled = key => backend[key] === 'true'
  const required = key => { if (!backend[key]?.trim()) fail(key, 'Set this backend value before enabling the feature.') }
  const privateKey = (key, encoding = 'base64url') => { if (!encodedKey(backend[key], encoding)) fail(key, `Generate a separate 32-byte key encoded as ${encoding}.`) }
  for (const [key, value] of Object.entries({ ...backend, ...mobile })) {
    if (typeof value === 'string' && /(?:^|[/:])(?:YOUR_|THE_SAME_PUBLIC_|REPLACE_ME)/i.test(value)) fail(key, 'Replace the template placeholder with your own value, or leave this optional feature disabled and its value blank.')
  }
  for (const key of flags) if (backend[key] !== undefined && !['true', 'false'].includes(backend[key])) fail(key, 'Use exactly true or false.')
  const uri = backend.MONGODB_URL ?? backend.DATABASE_URL
  if (!uri?.trim()) fail('MONGODB_URL', 'Set the selected MongoDB replica-set connection in the backend file.')
  else { try { mongoUrl(uri, backend.MONGODB_DB_NAME || 'rentral') } catch { fail('MONGODB_URL', 'Use a valid MongoDB connection with certificate validation and an explicit database name or MONGODB_DB_NAME.') } }
  if (!backend.JWT_SECRET || Buffer.byteLength(backend.JWT_SECRET, 'utf8') < 32) fail('JWT_SECRET', 'Generate a private signing secret of at least 32 bytes.')
  if (!origin(backend.NEXT_PUBLIC_APP_URL)) fail('NEXT_PUBLIC_APP_URL', 'Use the web origin only, such as http://localhost:3000.')
  if (enabled('GOOGLE_AUTH_ENABLED')) {
    required('GOOGLE_CLIENT_ID'); required('GOOGLE_CLIENT_SECRET')
    if (backend.GOOGLE_CLIENT_ID?.trim() && (!backend.GOOGLE_CLIENT_ID.trim().endsWith('.apps.googleusercontent.com') || /\s/.test(backend.GOOGLE_CLIENT_ID.trim()))) fail('GOOGLE_CLIENT_ID', 'Use the Web application OAuth client ID from Google Auth Platform.')
    if (origin(backend.NEXT_PUBLIC_APP_URL)) {
      const callbackOrigin = new URL(backend.NEXT_PUBLIC_APP_URL)
      if (callbackOrigin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(callbackOrigin.hostname)) fail('NEXT_PUBLIC_APP_URL', 'Google sign-in requires HTTPS, except for a loopback development origin.')
    }
    notes.push('Google also requires the additive identity database setup and the exact /auth/google/callback redirect registered in Google Auth Platform. This offline check does not verify either.')
  } else notes.push('Google sign-in is not enabled. Email/password remains available; follow context/google-sign-in-setup.md to configure the alternative.')
  if (!origin(mobile.EXPO_PUBLIC_API_URL)) fail('EXPO_PUBLIC_API_URL', 'Set the backend origin reachable from the device, without /api/v1.')
  for (const key of Object.keys(mobile)) {
    if (key.startsWith('EXPO_PUBLIC_') && !publicNames.has(key)) fail(key, 'This public mobile variable is not used by Rentral. Keep backend keys out of the mobile file.')
    if (!key.startsWith('EXPO_PUBLIC_') && /SECRET|TOKEN|KEY|PASSWORD|MONGODB|DATABASE_URL/.test(key)) fail(key, 'Move this private setting to the backend file.')
  }
  if (mobile.EXPO_PUBLIC_EAS_PROJECT_ID && !uuid.test(mobile.EXPO_PUBLIC_EAS_PROJECT_ID)) fail('EXPO_PUBLIC_EAS_PROJECT_ID', 'Use the EAS project UUID; it is optional until device push is configured.')
  if (!enabled('RENTRAL_PLATFORM_ENABLED')) notes.push('Marketplace features are disabled; set RENTRAL_PLATFORM_ENABLED=true after database setup.')
  if (!enabled('RENTRAL_SAFETY_ENABLED')) notes.push('Reports and appeals are disabled; set RENTRAL_SAFETY_ENABLED=true after database setup.')
  if (!backend.GEOAPIFY_API_KEY?.trim()) notes.push('GEOAPIFY_API_KEY is missing: drafts can be kept, but listing address verification and submission need this backend-only geocoding key. See context/environment-setup.md.')
  else if (/[\s*]/.test(backend.GEOAPIFY_API_KEY.trim()) || /^https?:/i.test(backend.GEOAPIFY_API_KEY.trim())) fail('GEOAPIFY_API_KEY', 'Paste only the full unmasked project API key, not the masked dropdown value or an example request URL.')
  if (enabled('PAYMENTS_ENABLED') || enabled('COMMERCIAL_ENABLED') || enabled('SETTLEMENT_ENABLED')) {
    required('PAYSTACK_SECRET_KEY')
    const key = backend.PAYSTACK_SECRET_KEY ?? ''
    const inferred = /^(sk|rk)_test_/.test(key) ? 'test' : /^(sk|rk)_live_/.test(key) ? 'live' : null
    const mode = backend.PAYSTACK_ENVIRONMENT || inferred
    if (!['test', 'live'].includes(mode) || (inferred && inferred !== mode) || key.startsWith('pk_') || /[\r\n]/.test(key)) fail('PAYSTACK_ENVIRONMENT', 'Use test or live and a matching backend secret or restricted key.')
    if (!enabled('PAYMENTS_ENABLED')) fail('PAYMENTS_ENABLED', 'Enable collection before commercial purchases or settlement.')
  }
  if (enabled('SETTLEMENT_ENABLED')) {
    if (backend.SETTLEMENT_POLICY_ACK !== 'manual-review-v1') fail('SETTLEMENT_POLICY_ACK', 'Reviewed settlement requires manual-review-v1.')
    if (!backend.PAYMENT_ACCOUNT_HASH_SECRET || Buffer.byteLength(backend.PAYMENT_ACCOUNT_HASH_SECRET, 'utf8') < 32) fail('PAYMENT_ACCOUNT_HASH_SECRET', 'Generate and keep a separate stable account-fingerprint secret of at least 32 bytes.')
  }
  for (const key of ['MEDIA_WORKER_SECRET', 'LIFECYCLE_WORKER_SECRET']) {
    if (enabled(key.replace('_SECRET', '_ENABLED')) && (!backend[key] || backend[key].length < 32 || /\s/.test(backend[key]))) fail(key, 'Generate a separate worker secret of at least 32 characters without whitespace.')
  }
  if (enabled('MUX_ENABLED')) for (const key of ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']) required(key)
  if (enabled('MEDIA_WORKER_ENABLED') && !enabled('MUX_ENABLED')) fail('MUX_ENABLED', 'The media worker requires configured Mux processing.')
  if (enabled('AUTH_EMAIL_ENABLED')) { required('RESEND_API_KEY'); required('RENTRAL_EMAIL_FROM'); privateKey('AUTH_EMAIL_ENCRYPTION_KEY') }
  else if (!enabled('AUTH_DEV_EMAIL_OUTBOX')) notes.push('Password recovery and email change need real email delivery or the private development outbox.')
  if (backend.AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY) privateKey('AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY')
  if (enabled('NOTIFICATION_EMAIL_ENABLED')) {
    required('RESEND_API_KEY'); required('RENTRAL_EMAIL_FROM')
    if (!cutoff(backend.NOTIFICATION_EMAIL_SINCE)) fail('NOTIFICATION_EMAIL_SINCE', 'Set an explicit ISO timestamp with time zone so old notifications are not sent.')
    if (!enabled('LIFECYCLE_WORKER_ENABLED')) notes.push('Notification email needs the local lifecycle worker to run.')
  }
  if (enabled('PUSH_NOTIFICATIONS_ENABLED')) {
    required('EXPO_ACCESS_TOKEN'); privateKey('PUSH_TOKEN_ENCRYPTION_KEY', 'base64')
    if (!/^[\x21-\x7e]{16,512}$/.test(backend.EXPO_ACCESS_TOKEN ?? '')) fail('EXPO_ACCESS_TOKEN', 'Use the backend Expo access token, not a device ExpoPushToken.')
    if (!cutoff(backend.PUSH_NOTIFICATIONS_SINCE)) fail('PUSH_NOTIFICATIONS_SINCE', 'Set an explicit ISO timestamp with time zone.')
    if (!uuid.test(backend.EXPO_PUBLIC_EAS_PROJECT_ID ?? '')) fail('EXPO_PUBLIC_EAS_PROJECT_ID', 'Set the EAS project UUID in the backend and mobile files for push.')
    else if (backend.EXPO_PUBLIC_EAS_PROJECT_ID.toLowerCase() !== mobile.EXPO_PUBLIC_EAS_PROJECT_ID?.toLowerCase()) fail('EXPO_PUBLIC_EAS_PROJECT_ID', 'The backend and mobile EAS project IDs must agree.')
    notes.push('Device push requires a development/store build, configured project credentials and explicit device permission. Expo Go is not push acceptance.')
  }
  if (enabled('COMMERCIAL_ENABLED')) for (const [price, days, fallback] of [['INSIGHTS_PRICE_KOBO', 'INSIGHTS_TERM_DAYS', '30'], ['SPONSORSHIP_PRICE_KOBO', 'SPONSORSHIP_TERM_DAYS', '7']]) {
    const value = backend[price] ?? ''
    if (!/^[1-9]\d{0,11}$/.test(value) || BigInt(value || '0') > 100000000000n) fail(price, 'Set your positive integer-kobo price, up to 100000000000. No default market price is invented.')
    const term = backend[days] ?? fallback
    if (!/^[1-9]\d{0,2}$/.test(term) || Number(term) > 366) fail(days, 'Use a term of 1–366 days.')
  }
  if (enabled('RENTRAL_ANALYTICS_ENABLED') && (!backend.ANALYTICS_HASH_SECRET || Buffer.byteLength(backend.ANALYTICS_HASH_SECRET, 'utf8') < 32)) fail('ANALYTICS_HASH_SECRET', 'Generate a separate stable analytics hashing secret of at least 32 bytes.')
  if (enabled('OLUSO_ENABLED')) required('OLUSO_API_KEY')
  if (backend.BACKUP_ENCRYPTION_KEY) privateKey('BACKUP_ENCRYPTION_KEY')
  return { ok: errors.length === 0, errors, notes, verification: 'Offline format check only; no database connection, provider calls or settings changes were made.' }
}

async function envFile(path) {
  try { return parseEnv(await readFile(path, 'utf8')) }
  catch (error) { if (error && error.code === 'ENOENT') return {}; throw new Error('An environment file could not be read or parsed.') }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [backend, mobile] = await Promise.all([envFile(resolve('.env.local')), envFile(resolve('apps/mobile/.env.local'))])
    const result = inspectEnvironment(backend, mobile)
    console.log(result.ok ? 'Environment file formats passed.' : 'Environment settings need attention:')
    for (const issue of result.errors) console.log(`- ${issue.key}: ${issue.message}`)
    for (const note of result.notes) console.log(`- ${note}`)
    console.log(result.verification)
    process.exitCode = result.ok ? 0 : 1
  } catch { console.error('Environment inspection could not finish. Check that the two local files are readable. Values were not printed.'); process.exitCode = 1 }
}
