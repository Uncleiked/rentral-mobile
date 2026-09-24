# Mux Staging Runbook

This integration is disabled by default. Do not set `MUX_ENABLED=true` on the current
shared database before staging verification. Credentials belong in the ignored `.env`.

## Configuration

Create a dedicated test environment in the Mux dashboard. Give its API token only
the Video permissions needed to create/read assets. Configure:

```dotenv
MUX_ENABLED=false
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
MUX_WEBHOOK_SECRET=
MUX_SIGNING_KEY_ID=
MUX_SIGNING_PRIVATE_KEY=
```

`MUX_SIGNING_PRIVATE_KEY` accepts the base64 private key returned by Mux or a quoted
PEM value. These values are server-only; never prefix them with `NEXT_PUBLIC_`.
Use the same Mux environment for API credentials, signing key and webhook secret.
Mux processing can incur charges even when the environment is named "test".

Point the environment webhook to a publicly reachable HTTPS staging URL ending in
`/api/webhooks/mux`. Mux sends the environment's events; the handler processes
`video.asset.created`, `video.asset.ready` and `video.asset.errored`, ignoring others.
Keep development tunnels temporary and secrets out of logs. For local CLI forwarding,
use the CLI's signing secret, not a dashboard endpoint secret. The listener uses
the System event-stream API; keep its development credentials separate from the
application's Video token. Environment variables override the CLI's stored login.

## Scheduled Worker

Implementation: `lib/media/worker.ts`; entry point: `POST /api/internal/media-worker`.
This is an authenticated server-to-server endpoint, not a browser page. No scheduler
has been installed or enabled by this change. Keep these server-only values local:

```dotenv
MEDIA_WORKER_ENABLED=false
MEDIA_WORKER_SECRET=
```

1. Complete the database rollout and provider acceptance below on separate staging.
   Do not interpret a working Mux CLI connection as database acceptance.
2. Generate a separate random secret (at least 32 characters, no whitespace), store
   it in the application's secret manager as MEDIA_WORKER_SECRET, and configure the
   same value in the scheduler. Never reuse a Mux API/signing/webhook secret.
3. With all Mux credentials configured and MUX_ENABLED=true on staging, set
   MEDIA_WORKER_ENABLED=true and restart/redeploy the staging app.
4. Configure a scheduler to POST every five minutes to the HTTPS staging URL plus
   `/api/internal/media-worker`, with `Authorization: Bearer <MEDIA_WORKER_SECRET>`.
   No request body is required. GET is deliberately unsupported; use a scheduler
   capable of POST, not a browser or a GET-only cron integration.
5. Set scheduler concurrency to one, request timeout to at least 60 seconds, and
   the hosting function timeout to 60 seconds. The route declares maxDuration=60,
   but hosting enforcement is platform-specific. Alert on timeouts and non-2xx.
6. Inspect the response counters, not secret-bearing provider logs. A 200 means
   the batch ran, not that all videos are ready. Alert when needsReview is nonzero.
   A 503 can contain partial progress; never reset media rows as a retry strategy.

Each run selects at most two rows in each phase. Queued/processing jobs need a
five-minute cooldown. Queued dispatch rechecks current owner KYC/status, uses the
existing atomic claim and caps preflight attempts at five. Processing reconciliation
claims an observed updatedAt, fetches the known asset, verifies ID/passthrough, and
conditionally applies signed-video validation. Concurrent webhook updates win.
Provider calls run outside transactions; no fake webhook receipts are inserted.

Submitting rows older than ten minutes with no provider ID become uncertain. These
and already-uncertain rows are never retried automatically: an operator must find
the original asset by passthrough and investigate. Webhooks can still resolve them.
Host termination during dispatch is recoverable only to this manual-review state,
not a guarantee that every interrupted upload completes unattended. Provider reads
use SDK timeouts; database/Storage latency also counts toward the host deadline.

The route returns 401 for absent/invalid secrets (including a missing configured
secret), 503 when flags/configuration are unavailable, and no-store responses. Only
this exact path skips browser Auth middleware; the route itself enforces its secret.
Disable MEDIA_WORKER_ENABLED and the scheduler to pause background execution. This
does not stop an already-running call, webhooks, or the existing owner retry action.

Before production, test overlapping scheduler requests, a missed ready callback,
a webhook completing during a provider read, prolonged provider/Storage/DB outages,
and process termination in staging. Unit mocks are not database concurrency proof.

## Database Rollout

1. Point local staging configuration at a separate Supabase staging database.
2. Review/replay the full Prisma migration history on a disposable database, then
   test an upgrade with representative existing data. Required Supabase schemas,
   roles and Storage migrations mean plain PostgreSQL alone is not sufficient.
3. Verify `20260924130000_harden_profile_access` and
   `20260924150000_add_mux_media_pipeline` with `pnpm exec prisma migrate status`.
   Apply only to the confirmed staging target using `pnpm exec prisma migrate deploy`.
4. Confirm RLS and denied anon/authenticated grants on MediaAsset and
   MediaWebhookReceipt, uniqueness/FKs, the ready-state duration constraint, and
   rollback of both listing and media job on an injected transaction failure.
5. Run `pnpm exec prisma generate`, then set `MUX_ENABLED=true` and restart the
   staging server. Enabling requires all credentials; missing keys fail closed.

The runtime intentionally makes no new-table queries while disabled. Existing
submitted listings have no jobs automatically: inventory them and approve a
controlled backfill before enabling this flag on an established environment.
The enabled public feed only plays ready Mux assets, so unprocessed legacy inventory
will disappear until backfilled. Never flip the flag as an untested production toggle.

## Acceptance Checklist

- Submit a dedicated test listing: listing and queued job commit together.
- Confirm only signed playback policies are created, with internal UUID passthrough.
- Deliver created/ready/errored events, duplicates and reordered deliveries. Confirm
  no callback changes listing publication status or enables payment-dependent flows.
- Simulate asset-creation timeout after acceptance: row becomes uncertain; callbacks
  recover it without a second create request.
- Simulate process termination before/after the create call. Submitting/uncertain
  jobs require operator reconciliation against Mux passthrough; never reset them
  to queued without proving that no provider asset was created.
- Interrupt a source upload. Cleanup waits for all in-flight uploads to settle.
  Interrupt a save response after commit: retain objects and check Your Listings.
- Verify owner playback of pending inventory, denial to another account, and signed
  access to active inventory. Check token expiry/renewal and denied anonymous access.
- Inspect desktop/mobile HLS playback, token-error recovery and owner status controls.
- Confirm no keys, source signed URLs or provider bodies reach logs or browser props.

## Explicit Remaining Work

- Private original-media staging and migration of existing public originals.
  Signed Mux playback does not protect the current public Storage originals.
- Deploy/verify the protected scheduled dispatcher and known-asset reconciliation.
  Next.js `after` remains opportunistic; the worker requires an external scheduler.
  Unknown submissions still need operator investigation; orphan cleanup is not built.
- Actual device camera/GPS tests and real Mux ingestion/playback acceptance.
- Publication prerequisites (documents, location and payment) remain separate.

Do not mark milestone 08 production-complete until these checks and remaining work
are resolved. The application does not currently delete submitted listings because
media cleanup and provider retention must be coordinated first.
