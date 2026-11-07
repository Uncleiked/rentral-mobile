# Reservations and payment collection implementation

Updated: 2026-11-07. This describes code, not deployed provider acceptance.

## Architecture and configuration

- Existing Next.js/Prisma/Supabase boundaries are preserved. New work is TypeScript.
- `RENTRAL_PLATFORM_ENABLED=true` requires staging migration acceptance first.
- Collection additionally requires `PAYMENTS_ENABLED=true` and `PAYSTACK_SECRET_KEY`.
- Configure `PAYSTACK_WEBHOOK_SECRET` for timestamped modern signatures when the
  Paystack account supports them. Once configured, legacy signatures are rejected.
  Accounts still using legacy signatures use HMAC-SHA512 with the secret API key.
- Provider requests use native fetch, 15-second timeouts and no blind retries.
  Credentials never enter the client or source-controlled files.
- No shared database migration, charge, refund, or transfer was executed here.

## Routes and UI

- `/marketplace/bookings`: participant-scoped incoming and outgoing requests.
- `/marketplace/bookings/new?listing=<uuid>&kind=inspection|rental|hold`: date,
  period, and itemized pricing request form. Host acceptance precedes payment.
- `/marketplace/bookings/<uuid>`: acceptance/cancellation, verified hosted
  checkout, reconciliation, on-site check-in, and booking feedback.
- Owner listing details can use `ListingFeeButton` for the NGN 1,000 post fee.
- Request, acceptance, payment, check-in and settlement are separate states.
  Missing configuration is clearly shown; the UI never invents paid balances.
- UI uses MarketplaceShell, semantic tokens, rounded-2xl bordered cards,
  responsive one/two-column layouts, minimum 44px controls and inline errors.

## Persistence and integrity

- `20261107120000_platform_domains` adds saved inventory, reservations,
  payment intents/events, ledger, conversations/messages, reviews/disputes,
  notifications, administrative audit, document review and renewals.
- `20261107123000_platform_integrity` adds private-table RLS/revokes, positive
  NGN minor-unit checks, participant checks, valid statuses, and database GiST
  exclusion of overlapping accepted/confirmed rentals and holds. Inspections
  are exempt. Deferred ledger checks require balanced debit/credit entries;
  ledger and administrative audit records are append-only. Ledger entries
  must be inserted in the same transaction as their parent transaction.
- `20261107140000_booking_quote_snapshots` persists the original itemized quote.
  Root's privacy/spatial/Reatime migration runs between integrity and snapshots.
- Prices are bigint kobo internally and decimal strings across the client
  boundary. Annual/monthly periods use 365/30-day prorating, daily periods
  round up, and trip prices apply once. Agency/legal/caution/service fees apply
  once per rental, never inspections/holds. Listed sales cannot use rental
  checkout. Fee labels do not imply legal entitlements or deposit refund terms.
- Existing geographic listing coordinates remain private and are never selected
  into client payloads. Multiple listers may independently record the same asset.

## Concurrency and provider behaviour

- Reservation mutations lock the listing before the booking. Payment settlement
  adds a payment-intent lock in the same order. The exclusion constraint provides
  the final database protection against concurrent overlapping rentals.
- Accepted requests receive 30 minutes to pay. Verified holds expire after 24h.
  Mutations expire stale reservations while holding the listing lock.
- Every charge reference and idempotency key is unique. In-flight/uncertain
  initialization is reconciled instead of blindly starting another charge.
- Signed charge success and authenticated verification converge on one transaction.
  Exact reference, currency, integer amount, payer email, user and intent metadata
  must match. Duplicate receipts cannot insert another ledger transaction.
- A late payment or a revoked participant identity produces `requires_review`;
  it records the money but never revives an expired reservation.
- Inspection presence requires each participant's location sample within two
  minutes, its PostGIS distance within 20 metres, both server check-in timestamps
  within 15 minutes, and the host entering the renter's six-digit challenge.
  Generic completion cannot bypass inspection check-in. Browser GPS remains
  user-controlled evidence, not hardware attestation.

## Remaining operational work

- Provider-supported custody/escrow, payouts, refunds, hold-default 70/30 splits,
  payout reconciliation, and bank beneficiary verification remain disabled and
  unimplemented; collection alone must never be called escrow acceptance.
- A completed inspection leaves `settlement_status=unsettled`. No automatic
  provider release is performed or represented as successful.
- Expiry currently runs on reservation mutations, not an installed recurring
  scheduler. Deploy and test a durable expiry/reconciliation worker before release.
- `pnpm test:database` replays every migration in a labelled, marker-protected
  Docker database without application environment configuration. Full replay,
  participant chat/Realtime RLS, private-table grants, committed upload protection,
  duplicate references/events, deferred ledger balance/immutability, concurrent
  rental exclusion and concurrent duplicate settlement passed locally.
  Unit mocks separately verify authorization, signature and state branches.
- Exercise actual test-mode checkout, duplicate/late webhooks, initialization
  timeout, revoked identities and authenticated mobile/desktop journeys before
  enabling the flags. Never use production identities in automated tests.
