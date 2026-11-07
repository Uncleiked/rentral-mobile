# Didit identity review and cutover

Reviewed and implemented 2026-11-07. No remote migration or provider acceptance was
performed in this change.

## Verified provider contract

Didit distinguishes a retry's delivery timestamp from the underlying record's
update time. Its documentation describes unordered delivery and stable event IDs;
ordering uses `created_at`, while freshness uses the authenticated `timestamp`
matched to `X-Timestamp`. Full-payload V2 canonical JSON or raw-body signatures are
supported here; the deprecated partial-envelope signature is never sufficient.
See [Didit webhook envelope and ordering](https://docs.didit.me/integration/webhooks).

The documented [current session decision endpoint](https://docs.didit.me/sessions-api/retrieve-session)
is `GET https://verification.didit.me/v3/session/{session_id}/decision/`, authenticated
with the application's `x-api-key`. KYC and KYB share that endpoint. This change
does not invent a provider revision counter or assume the dispatch time is an
ordering sequence.

## Changes and invariants

- `lib/identity/didit-policy.ts` validates bounded envelopes, exact signature hex,
  signed/header timestamp agreement and current delivery freshness. Actual streamed
  payloads are capped at 1 MiB. Signatures, payloads and provider diagnostics never
  enter console logs.
- `lib/identity/didit-service.ts` locks the current User row before applying a
  session event. Vendor identity, stored session, workflow and KYC/KYB kind must all
  agree. Session-creation races return retryable 503; superseded attempts are
  acknowledged without changing identity.
- Event application and its ordering receipt commit in one transaction. No network
  call occurs while the SQL lock is held. Older events cannot replace newer
  committed state. Ignored or mixed-workflow events never become ordering markers.
- Provider timestamps have second resolution. At an equal timestamp, a stricter
  decision wins. An approval requires a strictly newer update to restore eligibility
  after a restriction. Ambiguous data edits at the same timestamp are preserved for
  operator reconciliation rather than guessing their order.
- New delivery logs retain a minimal binding envelope, excluding the provider's
  identity decision and document data. The existing private User decision remains
  the identity record; old raw delivery logs are not silently erased by migration.
- Supabase app metadata is a navigation cache. Protected actions and the versioned
  API independently recheck current database KYC/profile eligibility. A metadata
  outage cannot turn a revoked database user into an eligible user.
- Metadata is read fresh before each write and checked again after the network
  response. A delayed older approval corrects itself if a newer revocation committed
  meanwhile. Reconciliation makes at most three attempts; failure returns 503 and
  leaves the already-applied receipt pending metadata sync. A retry re-syncs the
  current database state instead of replaying the historical approval.

## Migration and activation

`20261107160000_didit_event_ordering` adds optional `event_created_at` and
`metadata_synced_at` timestamps plus a session/time index on WebhookLog. It does not
add User columns or expose any table to browser roles. The baseline backfill uses
only processed historical session events whose vendor, current session, workflow
and kind match. Historical malformed operational JSON must be investigated on
staging if replay encounters it; never bypass the migration with `db push`.

1. Keep `DIDIT_ORDERING_ENABLED=false` during preparation. The receiver returns 503
   while off, with no access to the new columns. No unsafe legacy processing path
   is retained. Provider delivery retries are finite, so use a controlled callback
   maintenance window and inspect/resend missed deliveries after activation.
2. Follow [staging setup](staging-setup.md) and deploy the full migration history to
   the isolated target. Verify the new columns/index, clean replay and an upgrade
   fixture. Regenerate the Prisma client before building.
3. Use dedicated Didit Sandbox workflows and their own webhook destination secret.
   Subscribe to `status.updated` and `data.updated`; this implementation does not
   process consolidated entity or transaction-monitoring events as KYC decisions.
4. Before cutover, reconcile existing stored sessions against the provider's current
   session decision. The previous receiver may already have committed an older
   verdict last. The migration preserves existing decisions; it does not claim to
   repair them from incomplete historical logs. Verify session/workflow/vendor/kind
   before any controlled correction; do not paste API keys or real identity data in
   chat or source files.
5. Enable `DIDIT_ORDERING_ENABLED=true` in staging, restart and exercise actual
   approvals, revocations, duplicates, older deliveries and metadata outages. Resend
   current signed deliveries through the provider console where needed. Same-second
   conflicting outcomes require current-decision/operator reconciliation; an
   ambiguous approval must not be forced into eligibility.
6. Use the same staged release procedure for production after acceptance. Monitor
   non-2xx deliveries and pending metadata sync receipts. A durable scheduled
   identity reconciliation worker remains future operations work; provider retry
   exhaustion must not be represented as guaranteed eventual delivery.

## Verification and limits

Thirteen Didit regressions cover staging gates, signature/freshness validation,
unsigned-header replay attempts, missing ordering evidence, Unicode payloads,
raw full signatures, event deduplication, conflicting reused IDs, workflow/kind
binding, session-creation retries, newer revocation versus older approval,
same-second conflicts and delayed metadata writes. Relevant API/auth/listing
guards also pass; full TypeScript and focused identity lint checks pass.

Mocked transaction serialization is not a live PostgreSQL lock-race test. Hosted
provider signatures, database concurrency, payload retention, secret rotation and
actual approval/revocation journeys still require staging evidence. A transient
stale navigation cache can survive an outage; sensitive mutations remain denied by
the authoritative database check.
