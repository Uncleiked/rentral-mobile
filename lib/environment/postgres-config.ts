import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PoolConfig } from 'pg'

// A project CA augments trust without allowing an unverified TLS connection.
// Keep pg's URL SSL options from overwriting the explicitly verified context.
export function postgresConfig(connection: string, caPath?: string): PoolConfig {
  if (!caPath) return { connectionString: connection }
  const target = new URL(connection)
  for (const name of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslidentity', 'sslpassword', 'sslaccept']) target.searchParams.delete(name)
  return {
    connectionString: target.href,
    ssl: { ca: readFileSync(resolve(caPath), 'utf8'), rejectUnauthorized: true },
  }
}

// Prisma's migration engine uses sslcert, whereas the runtime adapter uses pg.
export function migrationConnection(connection: string, caPath?: string): string {
  if (!caPath) return connection
  const target = new URL(connection)
  target.searchParams.set('sslmode', 'require')
  target.searchParams.set('sslaccept', 'strict')
  target.searchParams.set('sslcert', resolve(caPath).replaceAll('\\', '/'))
  return target.href
}
