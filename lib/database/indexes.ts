import type { CreateIndexesOptions, Db, Document, IndexDirection } from 'mongodb'
import { MONGO_SCHEMA_VERSION, MONGO_SETUP_COLLECTION, MONGO_SETUP_ID, STORAGE_CLAIMS_VERSION, FINANCIAL_VERSION, LIFECYCLE_VERSION, MUTATION_VERSION, AUTH_SECURITY_VERSION, MATCHING_VERSION, MEDIA_UPLOAD_VERSION, COMMERCIAL_VERSION, MESSAGING_ACTIVITY_VERSION, PUSH_VERSION, CAPTURE_VERSION } from './metadata.ts'

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
  plan('ListingCapture', { owner_id: 1, started_at: -1 }), plan('ListingCapture', { listing_id: 1 }), partialUnique('ListingCapture', 'video_object_id'),
  { ...plan('ListingCapture', { owner_id: 1, video_digest: 1 }, true), options: { name: 'ListingCapture_owner_video_digest_key', unique: true, partialFilterExpression: { video_digest: { $type: 'string' } } } },
  plan('MediaAsset', { listing_id: 1 }, true), partialUnique('MediaAsset', 'mux_asset_id'), partialUnique('MediaAsset', 'playback_id'),
  plan('MediaAsset', { status: 1, updatedAt: 1 }), plan('MediaWebhookReceipt', { media_id: 1 }),
  partialUnique('MediaAsset', 'mux_upload_id'), plan('MediaAsset', { status: 1, upload_lease_expires_at: 1, updatedAt: 1 }),
  plan('SavedListing', { user_id: 1, listing_id: 1 }, true), plan('SavedListing', { listing_id: 1 }),
  plan('Booking', { listing_id: 1, starts_at: 1 }), plan('Booking', { listing_id: 1, kind: 1, status: 1, starts_at: 1, ends_at: 1 }),
  plan('Booking', { seeker_id: 1, createdAt: -1 }), plan('Booking', { lister_id: 1, createdAt: -1 }), plan('Booking', { status: 1, expires_at: 1 }),
  plan('PaymentIntent', { reference: 1 }, true), plan('PaymentIntent', { idempotency_key: 1 }, true),
  { ...plan('PaymentIntent', { provider: 1, provider_environment: 1, provider_transaction_id: 1 }, true), options: {
    name: 'PaymentIntent_provider_environment_transaction_key', unique: true, partialFilterExpression: { provider_transaction_id: { $type: 'string' } },
  } },
  plan('PaymentIntent', { user_id: 1, createdAt: -1 }), plan('PaymentIntent', { booking_id: 1 }), plan('PaymentIntent', { listing_id: 1 }),
  plan('PaymentEvent', { event_key: 1 }, true), plan('PaymentEvent', { payment_id: 1 }),
  plan('LedgerTransaction', { payment_id: 1 }), partialUnique('LedgerTransaction', 'business_key'), plan('LedgerTransaction', { operation_id: 1 }),
  { ...plan('LedgerTransaction', { payment_id: 1, kind: 1 }, true), options: { name: 'LedgerTransaction_payment_id_kind_key', unique: true, partialFilterExpression: { kind: 'provider_collection' } } },
  plan('LedgerEntry', { transaction_id: 1 }), plan('LedgerEntry', { account_key: 1, createdAt: 1 }),
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
  plan('StorageObject', { bucket: 1, path: 1 }, true),
  plan('StorageObject', { owner_id: 1, state: 1, createdAt: 1 }),
  plan('StorageObject', { state: 1, lease_expires_at: 1 }),
  plan('Renewal', { booking_id: 1, status: 1 }), plan('Renewal', { status: 1, createdAt: 1, _id: 1 }),
  plan('LeaseTermination', { booking_id: 1, status: 1 }), plan('LeaseTermination', { status: 1, requested_end_at: 1, _id: 1 }),
  plan('LeaseTermination', { requested_by: 1, createdAt: -1, _id: 1 }), plan('WorkerState', { lease_expires_at: 1 }),
  plan('Notification', { email_status: 1, createdAt: 1, _id: 1 }),
  plan('WorkerFailure', { status: 1, last_occurred_at: 1, _id: 1 }), plan('WorkerFailure', { job: 1, target_id: 1 }),
  plan('MutationReceipt', { actor_id: 1, scope: 1, client_id: 1 }, true), plan('MutationReceipt', { resource_id: 1 }),
  plan('EmailChange', { old_token_hash: 1 }, true), plan('EmailChange', { new_token_hash: 1 }, true),
  { ...plan('EmailChange', { user_id: 1 }, true), options: { name: 'EmailChange_user_id_pending_key', unique: true, partialFilterExpression: { status: 'pending' } } },
  plan('EmailChange', { user_id: 1, createdAt: -1 }), plan('EmailChange', { expires_at: 1 }),
  plan('AuthEmailDelivery', { dedupe_key: 1 }, true), plan('AuthEmailDelivery', { status: 1, next_attempt_at: 1, _id: 1 }),
  plan('AuthEmailDelivery', { lease_expires_at: 1 }), plan('AuthEmailDelivery', { user_id: 1, createdAt: -1 }), plan('AuthEmailDelivery', { expires_at: 1 }),
  plan('MatchProfile', { user_id: 1 }, true), plan('MatchProfile', { is_visible: 1, moderation_status: 1, updatedAt: -1, _id: 1 }),
  plan('MatchConnection', { lower_user_id: 1, upper_user_id: 1 }, true),
  plan('MatchConnection', { lower_user_id: 1, status: 1, last_activity_at: 1, _id: 1 }), plan('MatchConnection', { upper_user_id: 1, status: 1, last_activity_at: 1, _id: 1 }),
  plan('MatchConnection', { requested_by: 1, last_requested_at: 1 }), plan('MatchMessage', { sender_id: 1, client_id: 1 }, true),
  plan('MatchMessage', { connection_id: 1, createdAt: 1, _id: 1 }), plan('MatchBlock', { blocker_id: 1, blocked_id: 1 }, true), plan('MatchBlock', { blocked_id: 1 }),
  plan('MatchReport', { status: 1, createdAt: 1, _id: 1 }), plan('MatchReport', { opened_by: 1, createdAt: 1 }), plan('MatchReport', { subject_id: 1, createdAt: 1 }),
  plan('Listing', { lister_id: 1, archived_at: 1, createdAt: -1, _id: -1 }),
  plan('PaymentRecipient', { user_id: 1, status: 1, createdAt: -1 }),
  plan('PaymentRecipient', { user_id: 1, provider: 1, provider_environment: 1, account_fingerprint: 1 }, true),
  { ...plan('PaymentRecipient', { provider: 1, provider_environment: 1, provider_code: 1 }, true), options: {
    name: 'PaymentRecipient_provider_environment_code_key', unique: true, partialFilterExpression: { provider_code: { $type: 'string' } },
  } },
  plan('FinancialOperation', { reference: 1 }, true), plan('FinancialOperation', { idempotency_key: 1 }, true),
  plan('FinancialOperation', { booking_id: 1, createdAt: -1 }), plan('FinancialOperation', { status: 1, reconcile_after: 1 }),
  plan('FinancialOperation', { participant_ids: 1, createdAt: -1, _id: -1 }),
  { ...plan('FinancialOperation', { provider: 1, provider_environment: 1, kind: 1, provider_id: 1 }, true), options: {
    name: 'FinancialOperation_provider_environment_kind_id_key', unique: true, partialFilterExpression: { provider_id: { $type: 'string' } },
  } },
  plan('FinancialAllocation', { operation_id: 1, payment_id: 1 }, true), plan('FinancialAllocation', { payment_id: 1 }),
  plan('ProviderReceipt', { event_key: 1 }, true), plan('ProviderReceipt', { status: 1, next_attempt_at: 1 }),
  plan('ConversationActivity', { conversation_id: 1, user_id: 1 }, true),
  { ...plan('ConversationActivity', { last_seen_at: 1 }), options: { name: 'ConversationActivity_last_seen_at_idx', expireAfterSeconds: 90 } },
  plan('CommercialOrder', { user_id: 1, client_id: 1 }, true), partialUnique('CommercialOrder', 'campaign_id'),
  plan('CommercialOrder', { user_id: 1, createdAt: -1, _id: -1 }), plan('CommercialOrder', { status: 1, createdAt: 1, _id: 1 }),
  plan('PaymentIntent', { order_id: 1, createdAt: -1, _id: -1 }),
  plan('InsightEntitlement', { order_id: 1 }, true), plan('InsightEntitlement', { user_id: 1, status: 1, ends_at: 1 }),
  partialUnique('SponsoredCampaign', 'order_id'), plan('SponsoredCampaign', { user_id: 1, createdAt: -1, _id: -1 }),
  plan('SponsoredCampaign', { status: 1, starts_at: 1, ends_at: 1, _id: 1 }), plan('SponsoredCampaign', { listing_id: 1, status: 1 }),
  plan('MarketEvent', { campaign_id: 1, event_type: 1, createdAt: 1 }),
  plan('PushDevice', { installation_id: 1 }, true), plan('PushDevice', { token_hash: 1 }, true), plan('PushDevice', { user_id: 1, status: 1 }),
  plan('PushDevice', { user_id: 1, auth_session_id: 1, status: 1 }),
  plan('PushDelivery', { notification_id: 1, device_id: 1 }, true), partialUnique('PushDelivery', 'ticket_id'),
  plan('PushDelivery', { status: 1, next_check_at: 1, _id: 1 }), plan('PushDelivery', { user_id: 1, createdAt: -1, _id: -1 }),
  plan('ProviderReceipt', { provider: 1, provider_environment: 1, reference: 1 }),
]

export const MONGO_COLLECTIONS = [
  'User', 'Listing', 'ListingLocation', 'ListingCapture', 'MediaAsset', 'MediaWebhookReceipt', 'IndividualProfile', 'OrganizationProfile',
  'WebhookLog', 'SavedListing', 'Booking', 'PaymentIntent', 'PaymentEvent', 'LedgerTransaction', 'LedgerEntry',
  'Conversation', 'Message', 'Review', 'Dispute', 'Notification', 'AdminAudit', 'DocumentReview', 'Renewal',
  'MarketEvent', 'ListingVerification', 'SafetyNotice', 'SafetyAppeal', 'HoldCreditAllocation', 'AuthSession', 'PasswordReset', 'StorageObject',
  'LeaseTermination', 'WorkerState', 'WorkerFailure', 'PaymentRecipient', 'FinancialOperation', 'FinancialAllocation', 'ProviderReceipt', 'MutationReceipt', 'EmailChange', 'AuthEmailDelivery',
  'MatchProfile', 'MatchConnection', 'MatchMessage', 'MatchBlock', 'MatchReport',
  'ConversationActivity', 'CommercialOrder', 'InsightEntitlement', 'SponsoredCampaign',
  'PushDevice', 'PushDelivery',
] as const

const id = { bsonType: 'string', minLength: 1, maxLength: 256 }
// Prisma's default MongoDB Int serialization uses BSON Int64; native tools may use Int32.
const revision = { bsonType: ['int', 'long'], minimum: 0 }
const positiveMoney = { bsonType: 'long', minimum: 1 }
const currency = { enum: ['NGN'] }
const environment = { enum: ['test', 'live'] }
const nullableDate = { bsonType: ['date', 'null'] }
const jsonSchema = (required: string[], properties: Document): Document => ({ $jsonSchema: { bsonType: 'object', required: ['_id', ...required], properties: { _id: id, revision, ...properties } } })

// Cross-document balances, ownership and overlapping periods stay in transactional domain services.
export const MONGO_VALIDATORS: Readonly<Record<string, Document>> = {
  User: jsonSchema(['email'], {
    email: { bsonType: 'string', minLength: 3 }, username: { bsonType: ['string', 'null'] },
    password_hash: { bsonType: ['string', 'null'] }, staff_role: { bsonType: ['string', 'null'] },
    closed_at: { bsonType: ['date', 'null'] },
    push_consent_version: { bsonType: ['int', 'long', 'null'], minimum: 0 },
    analytics_consent: { bsonType: ['bool', 'null'] }, analytics_consent_at: { bsonType: ['date', 'null'] },
    analytics_subjects: { bsonType: ['array', 'null'], maxItems: 64, items: {
      bsonType: 'object', required: ['month', 'subject'], additionalProperties: false,
      properties: { month: { bsonType: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' }, subject: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' } },
    } },
  }),
  Listing: jsonSchema(['lister_id', 'category', 'listing_status'], { lister_id: id, category: { enum: ['house', 'car', 'boat'] }, listing_status: { enum: ['draft', 'pending_verification', 'active', 'suspended'] }, base_rent_amount: { bsonType: ['double', 'int', 'long', 'null'], minimum: 1, maximum: 9999999999 } }),
  ListingLocation: jsonSchema(['listing_id', 'geometry'], { listing_id: id, geometry: { bsonType: 'object', required: ['type', 'coordinates'], properties: { type: { enum: ['Point'] }, coordinates: { bsonType: 'array', minItems: 2, maxItems: 2, items: { bsonType: ['double', 'int', 'long'] } } } } }),
  ListingCapture: jsonSchema(['owner_id', 'session_id', 'begin_hash', 'state', 'start_geometry', 'start_accuracy', 'start_sample_at', 'started_at', 'finish_by'], {
    owner_id: id, session_id: id, begin_hash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' }, state: { enum: ['recording', 'recorded', 'sealed'] },
    start_geometry: { bsonType: 'object' }, end_geometry: { bsonType: ['object', 'null'] },
    start_accuracy: { bsonType: ['double', 'int', 'long'], minimum: 0.000001, maximum: 100 },
    end_accuracy: { bsonType: ['double', 'int', 'long', 'null'], minimum: 0.000001, maximum: 100 },
    start_sample_at: { bsonType: 'date' }, started_at: { bsonType: 'date' }, finish_by: { bsonType: 'date' }, end_sample_at: nullableDate, finished_at: nullableDate, sealed_at: nullableDate, seal_by: nullableDate,
    duration_seconds: { bsonType: ['double', 'int', 'long', 'null'], minimum: 0.000001, maximum: 120 },
    video_path: { bsonType: ['string', 'null'], maxLength: 500 }, video_digest: { bsonType: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
  }),
  MediaAsset: jsonSchema(['listing_id', 'source_path', 'status'], { listing_id: id, source_path: { bsonType: 'string', minLength: 1, maxLength: 500 },
    status: { enum: ['queued', 'submitting', 'uploading', 'uncertain', 'processing', 'ready', 'errored'] },
    mux_asset_id: { bsonType: ['string', 'null'] }, mux_upload_id: { bsonType: ['string', 'null'] },
    upload_bytes: { bsonType: ['int', 'long'], minimum: 0, maximum: 209715200 },
    upload_reconcile_page: { bsonType: ['int', 'long'], minimum: 1, maximum: 51 },
    upload_completed_at: nullableDate, upload_lease_expires_at: nullableDate,
  }),
  ConversationActivity: jsonSchema(['conversation_id', 'user_id', 'last_seen_at'], {
    conversation_id: id, user_id: id, last_seen_at: { bsonType: 'date' }, typing_until: nullableDate,
  }),
  PushDevice: jsonSchema(['user_id', 'installation_id', 'token_hash', 'proof_hash', 'platform', 'status', 'opted_in_at'], {
    user_id: id, installation_id: id, token_hash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' }, proof_hash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
    auth_session_id: { bsonType: ['string', 'null'], minLength: 1, maxLength: 256 },
    platform: { enum: ['android', 'ios'] }, status: { enum: ['active', 'revoked', 'unregistered'] },
    token_ciphertext: { bsonType: ['string', 'null'], maxLength: 4096 }, token_iv: { bsonType: ['string', 'null'], maxLength: 128 }, token_tag: { bsonType: ['string', 'null'], maxLength: 128 },
    opted_in_at: { bsonType: 'date' }, revoked_at: nullableDate,
  }),
  PushDelivery: jsonSchema(['notification_id', 'device_id', 'user_id', 'status', 'attempts'], {
    notification_id: id, device_id: id, user_id: id, status: { enum: ['pending', 'submitting', 'ticketed', 'confirmed', 'uncertain', 'failed', 'skipped'] },
    token_hash: { bsonType: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
    ticket_id: { bsonType: ['string', 'null'], maxLength: 256 }, error_code: { bsonType: ['string', 'null'], maxLength: 256 }, attempts: { bsonType: ['int', 'long'], minimum: 0 },
    claimed_at: nullableDate, accepted_at: nullableDate, receipt_checked_at: nullableDate, next_check_at: nullableDate,
  }),
  CommercialOrder: jsonSchema(['user_id', 'client_id', 'kind', 'status', 'currency', 'amount_kobo', 'price_version', 'service_days', 'billing_environment'], {
    user_id: id, client_id: id, kind: { enum: ['insights', 'sponsorship'] },
    status: { enum: ['created', 'awaiting_payment', 'paid', 'requires_review', 'cancelled'] }, currency, amount_kobo: positiveMoney,
    price_version: id, service_days: { bsonType: ['int', 'long'], minimum: 1, maximum: 366 }, billing_environment: environment, campaign_id: { bsonType: ['string', 'null'] }, paid_at: nullableDate,
  }),
  InsightEntitlement: { $and: [jsonSchema(['user_id', 'order_id', 'billing_environment', 'starts_at', 'ends_at', 'status'], {
    user_id: id, order_id: id, billing_environment: environment, starts_at: { bsonType: 'date' }, ends_at: { bsonType: 'date' }, status: { enum: ['active', 'revoked'] },
  }), { $expr: { $gt: ['$ends_at', '$starts_at'] } }] },
  SponsoredCampaign: { $and: [jsonSchema(['user_id', 'listing_id', 'billing_environment', 'status', 'starts_at', 'ends_at', 'headline'], {
    user_id: id, listing_id: id, billing_environment: environment, order_id: { bsonType: ['string', 'null'] },
    status: { enum: ['draft', 'pending_review', 'approved', 'rejected', 'paused', 'cancelled'] },
    starts_at: { bsonType: 'date' }, ends_at: { bsonType: 'date' }, headline: { bsonType: 'string', minLength: 1, maxLength: 80 },
    reviewed_by: { bsonType: ['string', 'null'] }, reviewed_at: nullableDate, decision_reason: { bsonType: ['string', 'null'], maxLength: 4000 },
  }), { $expr: { $gt: ['$ends_at', '$starts_at'] } }] },
  SavedListing: jsonSchema(['user_id', 'listing_id'], { user_id: id, listing_id: id }),
  Booking: { $and: [jsonSchema(['listing_id', 'seeker_id', 'lister_id', 'kind', 'status', 'starts_at', 'ends_at', 'amount_kobo'], {
    listing_id: id, seeker_id: id, lister_id: id, kind: { enum: ['inspection', 'rental', 'hold'] },
    status: { enum: ['requested', 'awaiting_payment', 'confirmed', 'completed', 'cancelled', 'expired', 'disputed', 'converted'] },
    starts_at: { bsonType: 'date' }, ends_at: { bsonType: 'date' }, amount_kobo: positiveMoney,
    hold_credit_kobo: { bsonType: 'long', minimum: 0 }, currency,
  }), { $expr: { $and: [{ $gt: ['$ends_at', '$starts_at'] }, { $ne: ['$seeker_id', '$lister_id'] }, { $lte: [{ $ifNull: ['$hold_credit_kobo', 0] }, '$amount_kobo'] }] } }] },
  PaymentIntent: jsonSchema(['user_id', 'reference', 'idempotency_key', 'amount_kobo', 'currency'], { user_id: id, reference: id, idempotency_key: id, amount_kobo: positiveMoney, currency,
    provider_environment: { enum: ['test', 'live', null] } }),
  LedgerTransaction: jsonSchema(['payment_id', 'currency', 'kind'], { payment_id: id, currency, kind: { bsonType: 'string', minLength: 1 },
    business_key: { bsonType: ['string', 'null'], minLength: 1, maxLength: 256 }, operation_id: { bsonType: ['string', 'null'] } }),
  LedgerEntry: jsonSchema(['transaction_id', 'account_key', 'direction', 'amount_kobo', 'currency'], { transaction_id: id, account_key: { bsonType: 'string', minLength: 1 }, direction: { enum: ['debit', 'credit'] }, amount_kobo: positiveMoney, currency }),
  Message: jsonSchema(['conversation_id', 'sender_id', 'client_id', 'body'], { conversation_id: id, sender_id: id, client_id: id, body: { bsonType: 'string', maxLength: 4000 } }),
  Review: jsonSchema(['booking_id', 'author_id', 'subject_id', 'rating'], { booking_id: id, author_id: id, subject_id: id, rating: { bsonType: ['int', 'long'], minimum: 1, maximum: 5 } }),
  HoldCreditAllocation: { $and: [jsonSchema(['hold_booking_id', 'rental_booking_id', 'amount_kobo', 'currency'], { hold_booking_id: id, rental_booking_id: id, amount_kobo: positiveMoney, currency }), { $expr: { $ne: ['$hold_booking_id', '$rental_booking_id'] } }] },
  AuthSession: jsonSchema(['user_id', 'refresh_hash', 'expires_at'], { user_id: id, refresh_hash: id, expires_at: { bsonType: 'date' }, revoked_at: { bsonType: ['date', 'null'] } }),
  PasswordReset: jsonSchema(['user_id', 'token_hash', 'expires_at'], { user_id: id, token_hash: id, expires_at: { bsonType: 'date' }, used_at: { bsonType: ['date', 'null'] } }),
  StorageObject: jsonSchema(['bucket', 'path', 'owner_id', 'state'], {
    bucket: { enum: ['listings-media', 'compliance-docs', 'profile-avatars'] },
    path: { bsonType: 'string', minLength: 1, maxLength: 500 }, owner_id: id,
    state: { enum: ['uploading', 'available', 'deleting', 'deleted'] },
    digest: { bsonType: ['string', 'null'], maxLength: 128 },
    size_bytes: { bsonType: ['int', 'long', 'null'], minimum: 0, maximum: 209715200 },
    content_type: { bsonType: ['string', 'null'], maxLength: 128 },
    operation_token: { bsonType: ['string', 'null'], maxLength: 128 },
    lease_expires_at: { bsonType: ['date', 'null'] },
    upload_completed_at: nullableDate,
  }),
  Renewal: jsonSchema(['booking_id', 'user_id', 'reference', 'recipient_route', 'status'], {
    booking_id: id, user_id: id, reference: id, recipient_route: { enum: ['direct_landlord', 'original_agent'] },
    status: { enum: ['pending_counterparty', 'pending_review', 'approved', 'rejected'] },
    original_ends_at: nullableDate, requested_ends_at: nullableDate, host_confirmed_at: nullableDate, reviewed_at: nullableDate,
    evidence_path: { bsonType: ['string', 'null'], maxLength: 500 },
  }),
  LeaseTermination: jsonSchema(['booking_id', 'requested_by', 'reason', 'original_ends_at', 'requested_end_at', 'status', 'counterparty_decision'], {
    booking_id: id, requested_by: id, reason: { bsonType: 'string', minLength: 15, maxLength: 4000 },
    original_ends_at: { bsonType: 'date' }, requested_end_at: { bsonType: 'date' },
    status: { enum: ['pending_counterparty', 'pending_review', 'approved', 'rejected', 'released'] },
    counterparty_decision: { enum: ['pending', 'accepted', 'rejected'] },
    evidence_path: { bsonType: ['string', 'null'], maxLength: 500 },
  }),
  WorkerState: jsonSchema([], { lease_expires_at: nullableDate, last_started_at: nullableDate, last_completed_at: nullableDate }),
  MutationReceipt: jsonSchema(['actor_id', 'scope', 'client_id', 'input_hash', 'resource_id'], {
    actor_id: id, scope: { enum: ['listing_submit', 'listing_draft_save', 'booking_create'] }, client_id: id, resource_id: id,
    input_hash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
  }),
  AdminAudit: { $and: [jsonSchema(['action', 'target_type', 'target_id', 'reason'], {
    actor_id: { bsonType: ['string', 'null'], minLength: 1 }, operator_id: { enum: ['local-database-operator', null] },
    action: id, target_type: id, target_id: id, reason: { bsonType: 'string', minLength: 1, maxLength: 5000 },
  }), { $or: [{ actor_id: { $type: 'string', $ne: '' } }, { actor_id: null, operator_id: 'local-database-operator' }] }] },
  EmailChange: jsonSchema(['user_id', 'old_email', 'new_email', 'credential_fingerprint', 'status', 'old_token_hash', 'new_token_hash', 'expires_at'], {
    user_id: id, old_email: { bsonType: 'string', minLength: 3, maxLength: 254 }, new_email: { bsonType: 'string', minLength: 3, maxLength: 254 },
    credential_fingerprint: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' }, old_token_hash: id, new_token_hash: id,
    status: { enum: ['pending', 'completed', 'cancelled'] }, expires_at: { bsonType: 'date' },
    old_confirmed_at: nullableDate, new_confirmed_at: nullableDate, completed_at: nullableDate,
  }),
  AuthEmailDelivery: jsonSchema(['kind', 'dedupe_key', 'key_id', 'status', 'expires_at'], {
    kind: { enum: ['password_reset', 'email_change_old', 'email_change_new', 'security_notice'] }, dedupe_key: id,
    key_id: { bsonType: 'string', pattern: '^[a-f0-9]{16}$' }, encrypted_payload: { bsonType: ['string', 'null'], maxLength: 32768 },
    status: { enum: ['pending', 'sending', 'sent', 'uncertain', 'expired', 'dead_letter'] }, expires_at: { bsonType: 'date' },
    attempts: { bsonType: ['int', 'long'], minimum: 0 }, lease_expires_at: nullableDate, next_attempt_at: nullableDate,
  }),
  MatchProfile: { $and: [jsonSchema(['user_id', 'is_visible', 'moderation_status', 'neighborhoods', 'monthly_min_kobo', 'monthly_max_kobo', 'smoking', 'pets', 'guests', 'quiet_hours'], {
    user_id: id, is_visible: { bsonType: 'bool' }, moderation_status: { enum: ['clear', 'restricted'] }, bio: { bsonType: 'string', maxLength: 500 },
    neighborhoods: { bsonType: 'array', maxItems: 3, uniqueItems: true, items: { bsonType: 'string', minLength: 1, maxLength: 120 } },
    monthly_min_kobo: { bsonType: 'long', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, monthly_max_kobo: { bsonType: 'long', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    smoking: { bsonType: 'string', maxLength: 32 }, pets: { bsonType: 'string', maxLength: 32 }, guests: { bsonType: 'string', maxLength: 32 }, quiet_hours: { bsonType: 'string', maxLength: 32 },
  }), { $expr: { $and: [{ $lte: ['$monthly_min_kobo', '$monthly_max_kobo'] }, { $or: [{ $eq: ['$is_visible', false] }, { $gte: [{ $size: { $ifNull: ['$neighborhoods', []] } }, 1] }] }] } }] },
  MatchConnection: { $and: [jsonSchema(['lower_user_id', 'upper_user_id', 'requested_by', 'status', 'last_requested_at'], {
    lower_user_id: id, upper_user_id: id, requested_by: id, status: { enum: ['requested', 'accepted', 'declined', 'closed'] }, last_requested_at: { bsonType: 'date' },
    lower_read_at: nullableDate, upper_read_at: nullableDate,
    last_activity_at: { bsonType: 'date' }, last_message_id: { bsonType: ['string', 'null'] },
  }), { $expr: { $and: [{ $lt: ['$lower_user_id', '$upper_user_id'] }, { $in: ['$requested_by', ['$lower_user_id', '$upper_user_id']] }] } }] },
  MatchMessage: jsonSchema(['connection_id', 'sender_id', 'client_id', 'body'], { connection_id: id, sender_id: id, client_id: id, body: { bsonType: 'string', minLength: 1, maxLength: 2000 } }),
  MatchBlock: { $and: [jsonSchema(['blocker_id', 'blocked_id'], { blocker_id: id, blocked_id: id }), { $expr: { $ne: ['$blocker_id', '$blocked_id'] } }] },
  MatchReport: { $and: [jsonSchema(['opened_by', 'subject_id', 'reason', 'status'], { opened_by: id, subject_id: id,
    reason: { bsonType: 'string', minLength: 20, maxLength: 4000 }, status: { enum: ['open', 'resolved'] },
  }), { $expr: { $ne: ['$opened_by', '$subject_id'] } }] },
  WorkerFailure: jsonSchema(['job', 'target_type', 'target_id', 'error_code', 'status', 'first_occurred_at', 'last_occurred_at'], {
    job: id, target_type: id, target_id: id, error_code: id, status: { enum: ['open', 'resolved'] },
    attempts: { bsonType: ['int', 'long'], minimum: 0 }, first_occurred_at: { bsonType: 'date' }, last_occurred_at: { bsonType: 'date' },
  }),
  PaymentRecipient: jsonSchema(['user_id', 'provider', 'provider_environment', 'bank_code', 'account_last4', 'account_fingerprint', 'status'], {
    user_id: id, provider: { enum: ['paystack'] }, provider_environment: environment, bank_code: { bsonType: 'string', minLength: 1, maxLength: 16 },
    account_last4: { bsonType: 'string', pattern: '^[0-9]{4}$' }, account_fingerprint: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
    provider_code: { bsonType: ['string', 'null'], maxLength: 128 }, status: { enum: ['pending', 'active', 'disabled', 'uncertain'] },
  }),
  FinancialOperation: jsonSchema(['provider', 'provider_environment', 'kind', 'reference', 'idempotency_key', 'amount_kobo', 'currency', 'status', 'requested_by', 'reason'], {
    provider: { enum: ['paystack'] }, provider_environment: environment, kind: { enum: ['refund', 'payout'] },
    reference: id, idempotency_key: id, amount_kobo: positiveMoney, currency, requested_by: id,
    retained_kobo: { bsonType: 'long', minimum: 0 }, policy_version: { enum: ['standard-v1', '30-70-v1', null] },
    participant_ids: { bsonType: 'array', maxItems: 2, uniqueItems: true, items: id },
    reason: { bsonType: 'string', minLength: 15, maxLength: 4000 },
    status: { enum: ['requested', 'approved', 'rejected', 'submitting', 'pending', 'requires_action', 'succeeded', 'failed', 'reversed', 'uncertain'] },
  }),
  FinancialAllocation: jsonSchema(['operation_id', 'payment_id', 'amount_kobo'], { operation_id: id, payment_id: id, amount_kobo: positiveMoney }),
  ProviderReceipt: jsonSchema(['provider', 'provider_environment', 'event_key', 'entity_kind', 'payload_hash', 'status'], {
    provider: { enum: ['paystack'] }, provider_environment: environment, event_key: id, entity_kind: { enum: ['collection', 'transfer', 'refund'] },
    payload_hash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
    status: { enum: ['pending', 'processing', 'processed', 'failed', 'dead_letter'] },
  }),
}

export async function ensureMongoIndexes(db: Db): Promise<{ collections: number; indexes: number }> {
  // Verification restores are deliberately inert. Routine setup must not turn
  // their quarantined schema marker into a usable application database.
  if (await db.collection('_RestoreVerification').findOne({}, { projection: { _id: 1 } })) {
    throw new Error('RESTORE_QUARANTINED_SETUP_REFUSED')
  }
  for (const name of MONGO_COLLECTIONS) {
    const validator = MONGO_VALIDATORS[name] ?? jsonSchema([], {})
    if (await db.listCollections({ name }, { nameOnly: true }).hasNext()) {
      await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' })
    } else {
      await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' })
    }
  }
  for (const index of MONGO_INDEXES) await db.collection(index.collection).createIndex(index.keys, index.options)
  // Replace only the reviewed legacy collection-only constraint. Its narrower
  // replacement is already present, so even a crashed upgrade cannot duplicate
  // a provider collection. Historical journals are never edited or backfilled.
  const journals = db.collection('LedgerTransaction')
  const legacy = (await journals.indexes()).find(index => index.name === 'LedgerTransaction_payment_id_key')
  if (legacy) {
    if (legacy.unique !== true || Object.keys(legacy.key).length !== 1 || legacy.key.payment_id !== 1) throw new Error('UNEXPECTED_LEGACY_LEDGER_INDEX')
    await journals.dropIndex('LedgerTransaction_payment_id_key')
  }
  const payments = db.collection('PaymentIntent')
  const legacyPaymentIdentity = (await payments.indexes()).find(index => index.name === 'PaymentIntent_provider_transaction_id_key')
  if (legacyPaymentIdentity) {
    if (legacyPaymentIdentity.unique !== true || Object.keys(legacyPaymentIdentity.key).length !== 1 || legacyPaymentIdentity.key.provider_transaction_id !== 1) throw new Error('UNEXPECTED_LEGACY_PAYMENT_INDEX')
    await payments.dropIndex('PaymentIntent_provider_transaction_id_key')
  }
  // Commit readiness last: a partial or failed setup must not enable unindexed writes.
  await db.collection<{ _id: string; schemaVersion: number; storageClaimsVersion: number; financialVersion: number; lifecycleVersion: number; mutationVersion: number; authSecurityVersion: number; matchingVersion: number; mediaUploadVersion: number; commercialVersion: number; messagingActivityVersion: number; pushVersion: number; captureVersion: number; completedAt: Date }>(MONGO_SETUP_COLLECTION).updateOne(
    { _id: MONGO_SETUP_ID }, { $set: { schemaVersion: MONGO_SCHEMA_VERSION, storageClaimsVersion: STORAGE_CLAIMS_VERSION,
      financialVersion: FINANCIAL_VERSION, lifecycleVersion: LIFECYCLE_VERSION, mutationVersion: MUTATION_VERSION, authSecurityVersion: AUTH_SECURITY_VERSION,
      matchingVersion: MATCHING_VERSION, mediaUploadVersion: MEDIA_UPLOAD_VERSION, commercialVersion: COMMERCIAL_VERSION, messagingActivityVersion: MESSAGING_ACTIVITY_VERSION, pushVersion: PUSH_VERSION, captureVersion: CAPTURE_VERSION, completedAt: new Date() } }, { upsert: true },
  )
  return { collections: MONGO_COLLECTIONS.length, indexes: MONGO_INDEXES.length }
}
