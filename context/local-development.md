# Current runtime troubleshooting — 2026-11-09

The application/backend run locally; the user has now selected **keep the saved
MongoDB Atlas connection**. Preserve that ignored MONGODB_URL. The old Supabase/
PostgreSQL audit below is historical and does not describe current setup.

## Required processes and phone address

Keep two repository-root terminals open: `npm run dev` starts Next on
`0.0.0.0:3000`; `npm run mobile` starts Expo/Metro, normally port 8081. Expo serves
the app bundle and does not start the API. Set apps/mobile/.env.local to the
device-reachable EXPO_PUBLIC_API_URL and restart Expo after changes.

Use `http://YOUR_COMPUTER_LAN_IP:3000` on a physical phone,
`http://10.0.2.2:3000` for an Android emulator, or `http://localhost:3000` for an
iOS simulator.
The phone needs a route to that computer/port. Native loopback, missing-host and
Expo-tunnel configurations require an explicit API origin; a bundle tunnel does
not forward the API. See [mobile setup](../apps/mobile/README.md).

To separate reachability from database access, open
`http://YOUR_COMPUTER_LAN_IP:3000/api/v1/auth/web-session` in the phone browser.
An unauthenticated JSON response establishes API reachability, not Atlas
readiness or successful signup.

## Saved Atlas preparation

Atlas only permits connections from its project's IP access list. Add the
backend computer network's **current public egress IP**, not its private LAN IP
or the phone's IP; see [official Atlas instructions](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
Keep TLS certificate/hostname verification enabled. Once connectivity works and
preparation of that saved database is intended, explicitly run:

~~~powershell
npm run db:setup -- --allow-remote
~~~

This prepares reviewed indexes, validators and the readiness marker; it does
not reset/import application data or change the saved connection. Account flows
remain unavailable until database connectivity and preparation both succeed.

## Verified Atlas and phone account flow — 2026-11-09

- Restored the missing backend and kept Expo separate. Both API and Metro serve
  the LAN; the Android development bundle contains the verified API origin and
  diagnostics. Actual addresses remain only in ignored configuration.
- Corrected confirmed Atlas public-IP drift after the user updated the active
  /32 entry. Native TLS/replica-set checks and Prisma reads now pass.
- Under the user-authorized account-flow repair, remote preparation succeeded:
  29 collections/73 indexes checked or prepared, including validators/readiness.
  No reset or legacy-data import occurred; original PostgreSQL/Supabase is untouched.
- Fixed cached closed readiness clients and safe auth-error redaction. Cold Atlas
  transactions now have bounded acquisition/execution of up to5s/10s within15s
  total, with no P2028 replay.
- Registration after a fresh backend restart returned201 in12.4s, below the native
  20s request limit. Its JWT profile/listings requests and subsequent sign-in
  returned200. Guarded cleanup removed only that owned diagnostic User and its
  two sessions; a read-only check found no diagnostic accounts remaining. Live
  phone background requests were concurrent; this is not a cold-only benchmark.
- Actual phone sign-in returned200 in6.4s, profile/listings reads returned200,
  and profile editing returned200 in6.6s. Subsequent messages, bookings, saved
  listings and category/location-filtered discovery requests all returned200.
  The real account is preserved and member use is confirmed through live traffic.
- Latest checks:636 tests/61 files PASS; owned local Mongo fixture16/16 PASS
  after the budget fix; foundation checks11 PASS; root/mobile typechecks and
  lint PASS. Normal automated suites use owned local fixtures. The controlled
  Atlas diagnostic above used owned temporary records and guarded cleanup.
- The backend and Expo are intentionally left running. This verifies the account/
  member flow; real camera/GPS/permissions/playback and provider acceptance remain
  separate work. Earlier fixture checks alone were not phone acceptance.

## Historical Supabase checkpoint — 2026-11-07 (superseded)

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
