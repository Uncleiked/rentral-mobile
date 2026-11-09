import { MongoClient } from 'mongodb'
import { mongoDatabaseName, mongoUrl } from './config'
import { MONGO_SCHEMA_VERSION, MONGO_SETUP_COLLECTION, MONGO_SETUP_ID } from './metadata'

const READY_CACHE_MS = 5000
type SetupMarker = { _id: string; schemaVersion: number }
let native: { uri: string; client: MongoClient } | null = null
let cached: { uri: string; until: number } | null = null
let pending: { uri: string; promise: Promise<void> } | null = null

export class MongoReadinessError extends Error {
  readonly status = 503
  constructor(readonly code: 'DATABASE_SETUP_REQUIRED' | 'DATABASE_UNAVAILABLE') {
    super(code === 'DATABASE_SETUP_REQUIRED'
      ? 'MongoDB is not prepared. Run npm run db:setup for the chosen database before using Rentral.'
      : 'MongoDB is unavailable. Check the configured connection and try again.')
    this.name = 'MongoReadinessError'
  }
}

/** Read-only check. Runtime requests never create collections, indexes or setup markers. */
export async function assertMongoReady(): Promise<void> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  if (cached?.uri === uri && cached.until > Date.now()) return
  if (pending?.uri === uri) return pending.promise
  const promise = (async (): Promise<void> => {
    if (native?.uri !== uri) {
      await native?.client.close()
      native = { uri, client: new MongoClient(uri, { serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000 }) }
    }
    let marker: SetupMarker | null
    try {
      marker = await native.client.db(mongoDatabaseName(uri)).collection<SetupMarker>(MONGO_SETUP_COLLECTION).findOne({ _id: MONGO_SETUP_ID }, { projection: { schemaVersion: 1 } })
    } catch { throw new MongoReadinessError('DATABASE_UNAVAILABLE') }
    if (marker?.schemaVersion !== MONGO_SCHEMA_VERSION) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
    cached = { uri, until: Date.now() + READY_CACHE_MS }
  })()
  pending = { uri, promise }
  try { await promise } finally { if (pending?.promise === promise) pending = null }
}

/** Used when shutting down an owned test fixture; it never changes database data. */
export async function closeMongoReadiness(): Promise<void> {
  cached = null
  pending = null
  const client = native?.client
  native = null
  await client?.close()
}
