export type EnvironmentValues = Record<string, string | undefined>
export type EnvironmentCheck = { name: string; ok: boolean; detail: string }

export const STAGING_REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'DIRECT_URL', 'NEXT_PUBLIC_APP_URL'] as const

function parsedUrl(value: string | undefined): URL | null {
  try { return value ? new URL(value) : null } catch { return null }
}

export function supabaseProjectRef(value: string | undefined): string | null {
  const url = parsedUrl(value)
  return url?.protocol === 'https:' && /^[a-z0-9]+\.supabase\.co$/.test(url.hostname)
    ? url.hostname.split('.')[0] : null
}

function keyCheck(value: string | undefined, role: 'anon' | 'service_role', ref: string | null): boolean {
  if (!value || !ref) return false
  if (value.startsWith(role === 'anon' ? 'sb_publishable_' : 'sb_secret_')) return value.length > 25
  try {
    const payload: unknown = JSON.parse(Buffer.from(value.split('.')[1] ?? '', 'base64url').toString())
    return typeof payload === 'object' && payload !== null && 'role' in payload && payload.role === role &&
      'ref' in payload && payload.ref === ref && 'exp' in payload && typeof payload.exp === 'number' && payload.exp * 1000 > Date.now()
  } catch { return false }
}

/** No check result contains a credential or connection string. JWT claims are not proof of validity. */
export function stagingChecks(values: EnvironmentValues, local: EnvironmentValues, requireSeparateProject: boolean = true): EnvironmentCheck[] {
  const checks: EnvironmentCheck[] = STAGING_REQUIRED.map(name => ({ name, ok: Boolean(values[name]?.trim()), detail: 'Required setting is present.' }))
  const ref = supabaseProjectRef(values.NEXT_PUBLIC_SUPABASE_URL)
  checks.push({ name: 'Supabase URL', ok: Boolean(ref), detail: 'A hosted HTTPS Supabase project URL is required.' })
  if (requireSeparateProject) checks.push({ name: 'Separate staging project', ok: Boolean(ref) && ref !== supabaseProjectRef(local.NEXT_PUBLIC_SUPABASE_URL), detail: 'Staging must differ from the project in .env.local.' })
  checks.push({ name: 'Publishable key format', ok: keyCheck(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'anon', ref), detail: 'Use a publishable key or unexpired anon JWT for the staging project.' })
  checks.push({ name: 'Server key format', ok: keyCheck(values.SUPABASE_SERVICE_ROLE_KEY, 'service_role', ref), detail: 'Use a server secret key or unexpired service-role JWT for the staging project.' })
  const app = parsedUrl(values.NEXT_PUBLIC_APP_URL)
  checks.push({ name: 'App URL', ok: Boolean(app && !app.username && !app.password &&
    (app.protocol === 'https:' || (app.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname))) && !app.hostname.includes('YOUR-') && !app.hostname.endsWith('.example')),
    detail: 'Use your real HTTPS staging origin, or HTTP localhost for local testing.' })
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    const url = parsedUrl(values[name])
    let target = false, credential = false
    try {
      target = Boolean(url && ref && ['postgres:', 'postgresql:'].includes(url.protocol) && url.pathname === '/postgres' &&
        (url.hostname === `db.${ref}.supabase.co` || (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`)))
      credential = Boolean(url?.password && !/\[(?:YOUR[_ -]?)?PASSWORD\]|YOUR[_ -]PASSWORD|CHANGE_ME/i.test(decodeURIComponent(url.password)))
    } catch { /* Invalid percent encoding is reported as an invalid credential shape. */ }
    checks.push({ name: `${name} target`, ok: target, detail: 'Use the Postgres URL from the staging project Connect panel.' })
    checks.push({ name: `${name} password`, ok: credential, detail: 'Replace the database password placeholder and URL-encode special characters.' })
    if (name === 'DIRECT_URL') checks.push({ name: 'Migration connection mode', ok: Boolean(target && url && (!url.port || url.port === '5432')), detail: 'Use direct or Session pooler port 5432 for migrations.' })
    checks.push({ name: `${name} TLS setting`, ok: Boolean(url && !['disable', 'no-verify'].includes(url.searchParams.get('sslmode') ?? '')), detail: 'Do not disable TLS verification on hosted staging.' })
  }
  for (const name of ['PAYMENTS_ENABLED', 'MUX_ENABLED', 'MEDIA_WORKER_ENABLED', 'LIFECYCLE_WORKER_ENABLED']) {
    checks.push({ name: `${name} rollout`, ok: values[name] !== 'true', detail: 'Keep provider/worker gates off until their acceptance checks pass.' })
  }
  return checks
}
