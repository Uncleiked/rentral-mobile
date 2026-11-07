# Local development checkpoint — 2026-11-07

The user cancelled staging setup. Continue with `.env.local`; do not require a
separate staging project to resume local development. The app runs on this machine,
but the configured Supabase database is hosted. Local app execution does not make
that database disposable.

## Verified configuration

`pnpm check:local --remote` passed the required configuration, matching project
targets, public Auth key, server Storage key, and both PostgreSQL connections.
No secret values are printed. This check performs only reads.

Supabase's public root CA is saved in ignored `certificates/supabase-ca.crt`.
`SUPABASE_DB_CA_CERT_PATH=certificates/supabase-ca.crt` was added to the ignored
`.env.local`, preserving its existing credentials. The runtime pg adapter uses
explicit verified TLS; Prisma migrations use `sslcert` and `sslaccept=strict`.
Certificate verification remains enabled. To recreate the CA on another machine:

```sh
pnpm setup:local:ca
pnpm check:local --remote
pnpm audit:local
```

The audit prints metadata, counts and pass/pending/fail results. It compares actual
migration checksums with source, accepts Prisma's LF/CRLF compatibility, checks
browser grants/RLS, private buckets, signup and upload guards, Realtime publication,
and malformed historical Didit JSON. It runs inside a read-only transaction and
rolls back. It never repairs history or invents a baseline.

## Hosted updates explicitly declined

The user answered **Keep the hosted database unchanged**. Do not apply hosted
migrations, change its policies/buckets/data, or ask again for the same approval.
Source migrations remain unapplied there; isolated local fixture tests may continue.

The read-only audit found eight completed, matching migrations and twelve pending:

- `20260924130000_harden_profile_access`
- `20260924150000_add_mux_media_pipeline`
- `20260924170000_private_listing_media`
- `20261107120000_platform_domains`
- `20261107123000_platform_integrity`
- `20261107130000_privacy_spatial_realtime`
- `20261107140000_booking_quote_snapshots`
- `20261107143000_disputed_availability`
- `20261107160000_didit_event_ordering`
- `20261107170000_safety_appeals`
- `20261107180000_hold_credit`
- `20261107190000_compliance_storage_boundary`

No unfinished, altered, unknown or out-of-order migrations were found. PostGIS is
in the expected `extensions` schema; historical Didit payloads contained zero
malformed JSON values. Current profile grants, public listing-media delivery and
signup-function hardening findings correspond to pending migrations above.

Automatic approval review rejected `pnpm exec prisma migrate deploy` because the
latest user instruction authorized local tests and the target is hosted/shared.
The subsequent approval request was explicitly declined by the user. No hosted
schema, policy, bucket or data changes were made. Do not retry, work around the
rejection or re-request that update. A future user instruction must explicitly
change this decision before any hosted mutation can be considered.

Continue code generation, builds and isolated local database tests without touching
the hosted database. Keep schema-dependent and provider/payment/worker flags off.
The pending source migrations and hosted Storage/API acceptance remain release
limitations. Collection support does not establish escrow, refund execution or
payout settlement.

## Test boundaries and saved state

`pnpm test:database` uses only the labelled, marker-protected local Docker fixture.
It never reads `.env.local` or contacts Supabase. All twenty migrations and real
reservation, duplicate-payment and hold-credit races passed there. Safety appeal
and private Storage assertions also passed. This does not establish hosted behavior.

Credentials entered into the shareable example were preserved in an ignored
`.env.staging.example.private-backup-*` copy; the shareable file contains placeholders.
Neither active environment file was overwritten by that cleanup. Use `.env.local`
for configuration, and keep credential-bearing files out of Git and chat.

Exact final verification and next actions are in `memory.md` and
`release-readiness.md`. Source is saved in the working tree; no commit or push was
requested or performed.
