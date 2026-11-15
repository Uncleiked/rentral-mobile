import type { Prisma } from '@prisma/client'
import { assertMongoReady, assertCaptureReady, assertFinancialReady, assertLifecycleReady, assertMatchingReady } from './readiness'
import { traceDatabaseQuery } from './transaction-trace'

// Only mutable, revision-bearing models accepted by lockRecord. No foreign key,
// identifier, arbitrary predicate or caller-supplied update can pass this boundary.
const collections = {
  conversation: 'Conversation', user: 'User', listing: 'Listing', listingCapture: 'ListingCapture',
  booking: 'Booking', paymentIntent: 'PaymentIntent', mediaAsset: 'MediaAsset', dispute: 'Dispute',
  safetyNotice: 'SafetyNotice', safetyAppeal: 'SafetyAppeal', renewal: 'Renewal',
  leaseTermination: 'LeaseTermination', workerState: 'WorkerState', paymentRecipient: 'PaymentRecipient',
  financialOperation: 'FinancialOperation', providerReceipt: 'ProviderReceipt', matchProfile: 'MatchProfile',
  matchConnection: 'MatchConnection', matchReport: 'MatchReport', commercialOrder: 'CommercialOrder',
  sponsoredCampaign: 'SponsoredCampaign', pushDevice: 'PushDevice', pushDelivery: 'PushDelivery',
} as const
export type RevisionLockModel = keyof typeof collections

async function prepared(model: RevisionLockModel): Promise<void> {
  if (model === 'listingCapture') return assertCaptureReady()
  if (['paymentRecipient', 'financialOperation', 'providerReceipt'].includes(model)) return assertFinancialReady()
  if (['leaseTermination', 'workerState'].includes(model)) return assertLifecycleReady()
  if (['matchProfile', 'matchConnection', 'matchReport'].includes(model)) return assertMatchingReady()
  return assertMongoReady()
}

async function increment(tx: Prisma.TransactionClient, model: RevisionLockModel, id: string, activeAccount: boolean): Promise<boolean> {
  if (!Object.hasOwn(collections, model) || typeof id !== 'string' || id.length === 0 || (activeAccount && model !== 'user')) throw new Error('INVALID_REVISION_LOCK')
  await prepared(model)
  const collection = collections[model]
  // MongoDB null equality includes legacy missing fields, matching activeAccountWhere.
  const predicate = activeAccount ? { _id: id, closed_at: null, suspended_at: null } : { _id: id }
  const update = {
    // Extended JSON keeps a missing, Int32 or Int64 revision integral.
    $inc: { revision: { $numberLong: '1' } },
    // These two schema models do not declare an @updatedAt field.
    ...(!['listingCapture', 'providerReceipt'].includes(model) ? { $currentDate: { updatedAt: true } } : {}),
  }
  // Prisma's Mongo relationMode emulates onUpdate checks even for revision-only
  // writes, causing dozens of unrelated reads. This single fixed command uses
  // the existing interactive transaction/session and changes no relation key.
  const result = await traceDatabaseQuery(collection, 'revisionLock', () => tx.$runCommandRaw({
    update: collection, updates: [{ q: predicate, u: update, multi: false, upsert: false }],
  }))
  if (!result || Array.isArray(result) || typeof result !== 'object' || result.ok !== 1 ||
      (result.writeErrors !== undefined && (!Array.isArray(result.writeErrors) || result.writeErrors.length !== 0)) || result.writeConcernError != null ||
      !Number.isSafeInteger(result.n) || !Number.isSafeInteger(result.nModified) || result.n !== result.nModified || ![0, 1].includes(result.n as number)) {
    throw new Error('REVISION_LOCK_UNCONFIRMED')
  }
  return result.n === 1
}

/** Scalar-only write lock; the caller must already be inside withTransaction. */
export function lockRecordRevision(tx: Prisma.TransactionClient, model: RevisionLockModel, id: string): Promise<boolean> {
  return increment(tx, model, id, false)
}

/** Availability is checked by the same write that conflicts with account closure. */
export function lockActiveAccount(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  return increment(tx, 'user', id, true)
}
