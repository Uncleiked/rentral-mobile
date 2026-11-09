import { MongoClient } from 'mongodb'

const DEFAULT_LOCAL_MONGO_URL = 'mongodb://127.0.0.1:27017/rentral?replicaSet=rs0&directConnection=true'
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1'])

function connection(value?: string, fallbackName = process.env.MONGODB_DB_NAME || 'rentral'): { url: string; databaseName: string; local: boolean } {
  const input = value?.trim() || DEFAULT_LOCAL_MONGO_URL
  const match = /^(mongodb(?:\+srv)?:\/\/)([^/?#]+)(\/[^?#]*)?(\?[^#]*)?$/.exec(input)
  if (!match) throw new Error('Set MONGODB_URL to a valid MongoDB connection.')
  const [, scheme, authority, path = '', query = ''] = match
  if ((!path || path === '/') && !/^[a-zA-Z0-9_-]{1,63}$/.test(fallbackName)) throw new Error('Set MONGODB_DB_NAME to a valid database name.')
  const normalizedPath = path && path !== '/' ? path : `/${fallbackName}`
  const parameters = new URLSearchParams(query.slice(1))
  for (const [name, option] of parameters) {
    if (['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'].includes(name.toLowerCase()) && option.toLowerCase() !== 'false') {
      throw new Error('MongoDB connections must validate TLS certificates and hostnames.')
    }
  }
  let client: MongoClient
  try { client = new MongoClient(`${scheme}${authority}${normalizedPath}${query}`) }
  catch { throw new Error('Set MONGODB_URL to a valid MongoDB connection.') }
  // Constructor parsing performs no network access and handles multi-host/IPv6 URIs.
  const local = scheme === 'mongodb://' && Boolean(client.options.hosts?.length) && Boolean(client.options.hosts?.every(host => typeof host.host === 'string' && loopbackHosts.has(host.host.toLowerCase())))
  let tlsSpecified = false
  for (const [name, option] of parameters) {
    if (['tls', 'ssl'].includes(name.toLowerCase())) {
      tlsSpecified = true
      if (!local && option.toLowerCase() !== 'true') throw new Error('Remote MongoDB connections require TLS.')
    }
  }
  const tls = !local && scheme === 'mongodb://' && !tlsSpecified ? `${query ? '&' : '?'}tls=true` : ''
  return { url: `${scheme}${authority}${normalizedPath}${query}${tls}`, databaseName: client.options.dbName, local }
}

/** Preserve configured endpoints/credentials; add only a missing database name and safe remote TLS default. */
export function mongoUrl(value?: string, fallbackName?: string): string { return connection(value, fallbackName).url }
export function mongoDatabaseName(value?: string, fallbackName?: string): string { return connection(value, fallbackName).databaseName }

/** Setup defaults and disposable fixtures require an explicitly local database. */
export function localMongoUrl(value?: string, fallbackName?: string): string {
  const parsed = connection(value, fallbackName)
  if (!parsed.local) throw new Error('MongoDB setup requires localhost; remote setup needs an explicit --allow-remote option.')
  return parsed.url
}
export function localMongoDatabaseName(value?: string): string { return mongoDatabaseName(localMongoUrl(value)) }
