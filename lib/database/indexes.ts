import type { CreateIndexesOptions, Db, Document, IndexDirection } from 'mongodb'
import { MONGO_SCHEMA_VERSION, MONGO_SETUP_COLLECTION, MONGO_SETUP_ID } from './metadata.ts'

type IndexPlan = { collection: string; keys: Record<string, IndexDirection>; options: CreateIndexesOptions }
const plan = (collection: string, keys: Record<string, IndexDirection>, unique = false): IndexPlan => ({
  collection, keys, options: { name: `${collection}_${Object.keys(keys).join('_')}_${unique ? 'key' : 'idx'}`, ...(unique ? { unique: true } : {}) },
})
const partialUnique = (collection: string, field: string): IndexPlan => ({
  ...plan(collection, { [field]: 1 }, true),
  options: { name: `${collection}_${field}_key`, unique: true, partialFilterExpression: { [field]: { $type: 'string' } } },
})

// Never run prisma db push: it cannot describe these nullable unique indexes.
export const MONGO_INDEXES: readonly IndexPlan[] = [
  plan('User', { email: 1 }, true), partialUnique('User', 'username'),
  plan('IndividualProfile', { userId: 1 }, true), plan('OrganizationProfile', { userId: 1 }, true),
  plan('WebhookLog', { event_id: 1 }, true), plan('WebhookLog', { session_id: 1, event_created_at: -1 }),
  plan('Listing', { lister_id: 1, createdAt: -1 }), plan('Listing', { listing_status: 1, createdAt: -1, _id: -1 }),
  plan('Listing', { listing_status: 1, category: 1, createdAt: -1, _id: -1 }),
  plan('ListingLocation', { listing_id: 1 }, true), plan('ListingLocation', { geometry: '2dsphere' }),
  plan('MediaAsset', { listing_id: 1 }, true), partialUnique('MediaAsset', 'mux_asset_id'), partialUnique('MediaAsset', 'playback_id'),
  plan('MediaAsset', { status: 1, updatedAt: 1 }), plan('MediaWebhookReceipt', { media_id: 1 }),
  plan('SavedListing', { user_id: 1, listing_id: 1 }, true), plan('SavedListing', { listing_id: 1 }),
  plan('Booking', { listing_id: 1, starts_at: 1 }), plan('Booking', { listing_id: 1, kind: 1, status: 1, starts_at: 1, ends_at: 1 }),
  plan('Booking', { seeker_id: 1, createdAt: -1 }), plan('Booking', { lister_id: 1, createdAt: -1 }), plan('Booking', { status: 1, expires_at: 1 }),
  plan('PaymentIntent', { reference: 1 }, true), plan('PaymentIntent', { idempotency_key: 1 }, true), partialUnique('PaymentIntent', 'provider_transaction_id'),
  plan('PaymentIntent', { user_id: 1, createdAt: -1 }), plan('PaymentIntent', { booking_id: 1 }), plan('PaymentIntent', { listing_id: 1 }),
  plan('PaymentEvent', { event_key: 1 }, true), plan('PaymentEvent', { payment_id: 1 }),
  plan('LedgerTransaction', { payment_id: 1 }, true), plan('LedgerEntry', { transaction_id: 1 }), plan('LedgerEntry', { account_key: 1, createdAt: 1 }),
  plan('Conversation', { listing_id: 1, seeker_id: 1 }, true), plan('Conversation', { seeker_id: 1, updatedAt: -1 }), plan('Conversation', { lister_id: 1, updatedAt: -1 }),
  plan('Message', { sender_id: 1, client_id: 1 }, true), plan('Message', { conversation_id: 1, createdAt: 1, _id: 1 }), plan('Message', { shared_listing_id: 1 }),
  plan('Review', { booking_id: 1, author_id: 1 }, true), plan('Review', { subject_id: 1, createdAt: -1 }), plan('Review', { author_id: 1 }),
  plan('Dispute', { booking_id: 1 }), plan('Dispute', { opened_by: 1 }), plan('Dispute', { status: 1, createdAt: 1 }),
  partialUnique('Notification', 'dedupe_key'), plan('Notification', { user_id: 1, createdAt: -1 }),
  plan('AdminAudit', { actor_id: 1, createdAt: 1 }), plan('AdminAudit', { target_type: 1, target_id: 1 }),
  plan('DocumentReview', { listing_id: 1 }, true), plan('DocumentReview', { status: 1, createdAt: 1 }), plan('DocumentReview', { reviewed_by: 1 }),
  plan('Renewal', { booking_id: 1, reference: 1 }, true), plan('Renewal', { user_id: 1, createdAt: -1 }),
  plan('MarketEvent', { dedupe_key: 1 }, true), plan('MarketEvent', { createdAt: 1, category: 1, neighborhood: 1 }), plan('MarketEvent', { subject_hash: 1, createdAt: 1 }),
  plan('SafetyNotice', { dispute_id: 1, subject_id: 1 }, true), plan('SafetyNotice', { issued_by: 1 }), plan('SafetyNotice', { subject_id: 1, status: 1, createdAt: -1 }),
  plan('SafetyAppeal', { notice_id: 1 }, true), plan('SafetyAppeal', { status: 1, createdAt: 1 }), plan('SafetyAppeal', { appellant_id: 1, createdAt: -1 }), plan('SafetyAppeal', { decided_by: 1 }),
  plan('HoldCreditAllocation', { hold_booking_id: 1 }, true), plan('HoldCreditAllocation', { rental_booking_id: 1 }, true),
  plan('AuthSession', { refresh_hash: 1 }, true), plan('AuthSession', { user_id: 1, expires_at: 1 }),
  { ...plan('AuthSession', { expires_at: 1 }), options: { name: 'AuthSession_expires_at_idx', expireAfterSeconds: 0 } },
  plan('PasswordReset', { token_hash: 1 }, true), plan('PasswordReset', { user_id: 1, expires_at: 1 }),
  { ...plan('PasswordReset', { expires_at: 1 }), options: { name: 'PasswordReset_expires_at_idx', expireAfterSeconds: 0 } },
]

export const MONGO_COLLECTIONS = [
  'User', 'Listing', 'ListingLocation', 'MediaAsset', 'MediaWebhookReceipt', 'IndividualProfile', 'OrganizationProfile',
  'WebhookLog', 'SavedListing', 'Booking', 'PaymentIntent', 'PaymentEvent', 'LedgerTransaction', 'LedgerEntry',
  'Conversation', 'Message', 'Review', 'Dispute', 'Notification', 'AdminAudit', 'DocumentReview', 'Renewal',
  'MarketEvent', 'ListingVerification', 'SafetyNotice', 'SafetyAppeal', 'HoldCreditAllocation', 'AuthSession', 'PasswordReset',
] as const

const id = { bsonType: 'string', minLength: 1, maxLength: 256 }
// Prisma's default MongoDB Int serialization uses BSON Int64; native tools may use Int32.
const revision = { bsonType: ['int', 'long'], minimum: 0 }
const positiveMoney = { bsonType: 'long', minimum: 1 }
const currency = { enum: ['NGN'] }
const jsonSchema = (required: string[], properties: Document): Document => ({ $jsonSchema: { bsonType: 'object', required: ['_id', ...required], properties: { _id: id, revision, ...properties } } })

// Cross-document balances, ownership and overlapping periods stay in transactional domain services.
export const MONGO_VALIDATORS: Readonly<Record<string, Document>> = {
  User: jsonSchema(['email'], { email: { bsonType: 'string', minLength: 3 }, username: { bsonType: ['string', 'null'] }, password_hash: { bsonType: ['string', 'null'] }, staff_role: { bsonType: ['string', 'null'] } }),
  Listing: jsonSchema(['lister_id', 'category', 'listing_status'], { lister_id: id, category: { enum: ['house', 'car', 'boat'] }, listing_status: { enum: ['draft', 'pending_verification', 'active', 'suspended'] }, base_rent_amount: { bsonType: ['double', 'int', 'long', 'null'], minimum: 1, maximum: 9999999999 } }),
  ListingLocation: jsonSchema(['listing_id', 'geometry'], { listing_id: id, geometry: { bsonType: 'object', required: ['type', 'coordinates'], properties: { type: { enum: ['Point'] }, coordinates: { bsonType: 'array', minItems: 2, maxItems: 2, items: { bsonType: ['double', 'int', 'long'] } } } } }),
  SavedListing: jsonSchema(['user_id', 'listing_id'], { user_id: id, listing_id: id }),
  Booking: { $and: [jsonSchema(['listing_id', 'seeker_id', 'lister_id', 'kind', 'status', 'starts_at', 'ends_at', 'amount_kobo'], {
    listing_id: id, seeker_id: id, lister_id: id, kind: { enum: ['inspection', 'rental', 'hold'] },
    status: { enum: ['requested', 'awaiting_payment', 'confirmed', 'completed', 'cancelled', 'expired', 'disputed', 'converted'] },
    starts_at: { bsonType: 'date' }, ends_at: { bsonType: 'date' }, amount_kobo: positiveMoney,
    hold_credit_kobo: { bsonType: 'long', minimum: 0 }, currency,
  }), { $expr: { $and: [{ $gt: ['$ends_at', '$starts_at'] }, { $ne: ['$seeker_id', '$lister_id'] }, { $lte: [{ $ifNull: ['$hold_credit_kobo', 0] }, '$amount_kobo'] }] } }] },
  PaymentIntent: jsonSchema(['user_id', 'reference', 'idempotency_key', 'amount_kobo', 'currency'], { user_id: id, reference: id, idempotency_key: id, amount_kobo: positiveMoney, currency }),
  LedgerTransaction: jsonSchema(['payment_id', 'currency', 'kind'], { payment_id: id, currency, kind: { bsonType: 'string', minLength: 1 } }),
  LedgerEntry: jsonSchema(['transaction_id', 'account_key', 'direction', 'amount_kobo', 'currency'], { transaction_id: id, account_key: { bsonType: 'string', minLength: 1 }, direction: { enum: ['debit', 'credit'] }, amount_kobo: positiveMoney, currency }),
  Message: jsonSchema(['conversation_id', 'sender_id', 'client_id', 'body'], { conversation_id: id, sender_id: id, client_id: id, body: { bsonType: 'string', maxLength: 4000 } }),
  Review: jsonSchema(['booking_id', 'author_id', 'subject_id', 'rating'], { booking_id: id, author_id: id, subject_id: id, rating: { bsonType: ['int', 'long'], minimum: 1, maximum: 5 } }),
  HoldCreditAllocation: { $and: [jsonSchema(['hold_booking_id', 'rental_booking_id', 'amount_kobo', 'currency'], { hold_booking_id: id, rental_booking_id: id, amount_kobo: positiveMoney, currency }), { $expr: { $ne: ['$hold_booking_id', '$rental_booking_id'] } }] },
  AuthSession: jsonSchema(['user_id', 'refresh_hash', 'expires_at'], { user_id: id, refresh_hash: id, expires_at: { bsonType: 'date' }, revoked_at: { bsonType: ['date', 'null'] } }),
  PasswordReset: jsonSchema(['user_id', 'token_hash', 'expires_at'], { user_id: id, token_hash: id, expires_at: { bsonType: 'date' }, used_at: { bsonType: ['date', 'null'] } }),
}

export async function ensureMongoIndexes(db: Db): Promise<{ collections: number; indexes: number }> {
  for (const name of MONGO_COLLECTIONS) {
    const validator = MONGO_VALIDATORS[name] ?? jsonSchema([], {})
    if (await db.listCollections({ name }, { nameOnly: true }).hasNext()) {
      await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' })
    } else {
      await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' })
    }
  }
  for (const index of MONGO_INDEXES) await db.collection(index.collection).createIndex(index.keys, index.options)
  // Commit readiness last: a partial or failed setup must not enable unindexed writes.
  await db.collection<{ _id: string; schemaVersion: number; completedAt: Date }>(MONGO_SETUP_COLLECTION).updateOne(
    { _id: MONGO_SETUP_ID }, { $set: { schemaVersion: MONGO_SCHEMA_VERSION, completedAt: new Date() } }, { upsert: true },
  )
  return { collections: MONGO_COLLECTIONS.length, indexes: MONGO_INDEXES.length }
}
