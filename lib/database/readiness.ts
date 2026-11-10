import { MongoClient } from 'mongodb'
import { mongoDatabaseName, mongoUrl } from './config'
import { MONGO_SCHEMA_VERSION, MONGO_SETUP_COLLECTION, MONGO_SETUP_ID, STORAGE_CLAIMS_VERSION, FINANCIAL_VERSION, LIFECYCLE_VERSION, MUTATION_VERSION, AUTH_SECURITY_VERSION, MATCHING_VERSION, MEDIA_UPLOAD_VERSION, COMMERCIAL_VERSION, MESSAGING_ACTIVITY_VERSION, PUSH_VERSION, CAPTURE_VERSION } from './metadata'
import { MONGO_READINESS_MESSAGES, type MongoReadinessCode } from './readiness-errors'

const READY_CACHE_MS = 5000
type SetupMarker = { _id: string; schemaVersion: number; storageClaimsVersion?: number; financialVersion?: number; lifecycleVersion?: number; mutationVersion?: number; authSecurityVersion?: number; matchingVersion?: number; mediaUploadVersion?: number; commercialVersion?: number; messagingActivityVersion?: number; pushVersion?: number; captureVersion?: number }
let native: { uri: string; client: MongoClient } | null = null
let cached: { uri: string; until: number; storageClaimsReady: boolean; financialReady: boolean; lifecycleReady: boolean; mutationReady: boolean; authSecurityReady: boolean; matchingReady: boolean; mediaUploadReady: boolean; commercialReady: boolean; messagingActivityReady: boolean; pushReady: boolean; captureReady: boolean } | null = null
let pending: { uri: string; promise: Promise<void> } | null = null

export class MongoReadinessError extends Error {
  readonly status = 503
  constructor(readonly code: MongoReadinessCode) {
    super(MONGO_READINESS_MESSAGES[code])
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
      // Atlas discovery and TLS can exceed three seconds on a cold local start.
      // Stay bounded while allowing the first request to establish a connection.
      native = { uri, client: new MongoClient(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 }) }
    }
    const connection = native
    let marker: SetupMarker | null
    try {
      marker = await connection.client.db(mongoDatabaseName(uri)).collection<SetupMarker>(MONGO_SETUP_COLLECTION).findOne({ _id: MONGO_SETUP_ID }, { projection: { schemaVersion: 1, storageClaimsVersion: 1, financialVersion: 1, lifecycleVersion: 1, mutationVersion: 1, authSecurityVersion: 1, matchingVersion: 1, mediaUploadVersion: 1, commercialVersion: 1, messagingActivityVersion: 1, pushVersion: 1, captureVersion: 1 } })
    } catch {
      // A failed initial driver connection retains a closed topology. Discard
      // that client so a later request can recover after connectivity returns.
      if (native === connection) {
        native = null
        if (cached?.uri === uri) cached = null
      }
      await connection.client.close().catch(() => undefined)
      throw new MongoReadinessError('DATABASE_UNAVAILABLE')
    }
    if (marker?.schemaVersion !== MONGO_SCHEMA_VERSION) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
    if (native === connection) cached = { uri, until: Date.now() + READY_CACHE_MS, storageClaimsReady: marker.storageClaimsVersion === STORAGE_CLAIMS_VERSION,
      financialReady: marker.financialVersion === FINANCIAL_VERSION, lifecycleReady: marker.lifecycleVersion === LIFECYCLE_VERSION,
      mutationReady: marker.mutationVersion === MUTATION_VERSION, authSecurityReady: marker.authSecurityVersion === AUTH_SECURITY_VERSION,
      matchingReady: marker.matchingVersion === MATCHING_VERSION, mediaUploadReady: marker.mediaUploadVersion === MEDIA_UPLOAD_VERSION,
      commercialReady: marker.commercialVersion === COMMERCIAL_VERSION, messagingActivityReady: marker.messagingActivityVersion === MESSAGING_ACTIVITY_VERSION, pushReady: marker.pushVersion === PUSH_VERSION, captureReady: marker.captureVersion === CAPTURE_VERSION }
  })()
  pending = { uri, promise }
  try { await promise } finally { if (pending?.promise === promise) pending = null }
}

/** New storage operations cannot implicitly create an unprepared collection. */
export async function assertStorageClaimsReady(): Promise<void> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  if (cached?.uri !== uri || !cached.storageClaimsReady) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function assertFinancialReady(): Promise<void> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  if (cached?.uri !== uri || !cached.financialReady) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function financialPrepared(): Promise<boolean> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  return cached?.uri === uri && cached.financialReady
}

export async function matchingPrepared(): Promise<boolean> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  return cached?.uri === uri && cached.matchingReady
}

export async function assertMutationReady(): Promise<void> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  if (cached?.uri !== uri || !cached.mutationReady) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function assertLifecycleReady(): Promise<void> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  if (cached?.uri !== uri || !cached.lifecycleReady) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

/** Older prepared databases retain their existing storage flows during upgrades. */
export async function lifecyclePrepared(): Promise<boolean> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  return cached?.uri === uri && cached.lifecycleReady
}

export async function authSecurityPrepared(): Promise<boolean> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  return cached?.uri === uri && cached.authSecurityReady
}

export async function assertAuthSecurityReady(): Promise<void> {
  if (!await authSecurityPrepared()) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function assertMatchingReady(): Promise<void> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  if (cached?.uri !== uri || !cached.matchingReady) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function assertMediaUploadReady(): Promise<void> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  if (cached?.uri !== uri || !cached.mediaUploadReady) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function commercialPrepared(): Promise<boolean> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  return cached?.uri === uri && cached.commercialReady
}

export async function assertCommercialReady(): Promise<void> {
  if (!await commercialPrepared()) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function assertMessagingActivityReady(): Promise<void> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  if (cached?.uri !== uri || !cached.messagingActivityReady) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function pushPrepared(): Promise<boolean> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  return cached?.uri === uri && cached.pushReady
}

export async function assertPushReady(): Promise<void> {
  if (!await pushPrepared()) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function assertCaptureReady(): Promise<void> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  if (cached?.uri !== uri || !cached.captureReady) throw new MongoReadinessError('DATABASE_SETUP_REQUIRED')
}

export async function capturePrepared(): Promise<boolean> {
  const uri = mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL)
  await assertMongoReady()
  // Deletion takes the storage-object write lock before this check. Refresh a
  // negative marker so a just-enabled capture seal cannot be hidden for the
  // readiness cache window in another server process.
  if (cached?.uri === uri && !cached.captureReady) {
    cached.until = 0
    await assertMongoReady()
  }
  return cached?.uri === uri && cached.captureReady
}

/** Used when shutting down an owned test fixture; it never changes database data. */
export async function closeMongoReadiness(): Promise<void> {
  cached = null
  pending = null
  const client = native?.client
  native = null
  await client?.close()
}
