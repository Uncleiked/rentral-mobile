# Memory - Private Media and Staging Boundary

Last updated: 2026-09-24

## What Was Built

- Latest slice: protected GET `/api/listings/[id]/source?kind=video|poster`,
  same-origin saved previews, five-minute signed redirects and owner/active queries.
  Non-owner original video is denied when Mux is enabled. Compliance documents are
  excluded. No public URL fallback; every response is private/no-store.
- Profile posters use unoptimized Next Image. Native and Mux playback have accessible
  retry states; CaptureCanvas previews remain visible after live-camera denial.
- Prepared `20260924170000_private_listing_media` (unapplied remotely). It changes
  the existing bucket to private, replaces broad reads with owner SELECT and adds
  a restrictive SELECT boundary against legacy permissive policies. Paths unchanged.
- `pnpm test:storage` creates a disposable local PostgreSQL cluster and replays the
  Storage migrations against minimal fixtures. Actual RLS assertions passed; it never
  uses the app database/environment. Requires local initdb/pg_ctl/psql and escalation
  on this Mac for shared memory. Hosted Storage/API/CDN acceptance remains open.
- Added `context/private-media-plan.md`; updated registry, tracker, library docs,
  media/production plans and README. No dependency, credential or feature-flag changes.
- Previous slice: `lib/media/worker.ts`, `worker-auth.ts`, and protected POST
  `/api/internal/media-worker`. It dispatches queued media and reconciles known
  Mux asset IDs after missed callbacks, with two-row batches per phase and a
  five-minute cooldown. Stale submitting jobs become uncertain after ten minutes.
- Queue claims compare the observed attempt count; reconciliation claims and applies
  state with updatedAt compare-and-swap. Ambiguous submissions never automatically
  create a second asset. Webhook changes win over stale polling responses.
- Exact worker path bypasses browser-session middleware; its own server-only bearer
  secret is mandatory before DB/provider access. No broad /api bypass was added.
- Worker requires MEDIA_WORKER_ENABLED=true, MUX_ENABLED=true, all Mux keys, and
  MEDIA_WORKER_SECRET (minimum 32 characters, no whitespace). Nothing enabled locally.
- Added `context/media-worker-plan.md`; expanded `context/media-staging.md` with
  deployment, scheduling, alerting and secret instructions. Updated tracker,
  registry, production plan, library docs and README. No new UI styling this pass.

## Existing Implementation

- Gated Mux ingestion, SDK-verified callbacks, signed playback, owner status/retry
  controls, atomic MediaAsset job creation and MediaWebhookReceipt deduplication.
  API credentials are Video-scoped; the local Mux CLI may need System Read access.
- Upload cleanup waits for in-flight uploads; ambiguous save responses retain files
  and direct users to Your Listings. Post-commit refresh errors preserve success.
- Auth recovery/callback/redirect-cookie repairs, allowlisted login errors, keyboard
  submission and live OAuth-provider availability are implemented. Login worked in
  runtime logs; this does not prove the full authenticated/provider journey.
- Current-database KYC gates protect listing mutations. Pending inventory is hidden
  from public discovery. Fake payment confirmations were removed; no auto-publication.
- Didit events bind to the stored user/session/workflow. Username-based KYC bypass
  is removed. Same-session ordering and real approval/revocation still need work.

## Decisions

- Follow `context/production-plan.md`; historical tracker checkboxes and provider
  examples are not production acceptance. Preserve existing Next/Prisma boundaries,
  strict TypeScript and semantic UI tokens. Use pnpm, not npm/yarn/bun.
- Milestone 08 is still partial. Finish inventory acceptance before Gemini/payment
  publication checks. AI analysis is a review signal, never proof of ownership.
- Do not apply migrations to the current shared database or turn on Mux from a
  statement that CLI forwarding works. A separate staging target is still required.
- External scheduling is not deployed. The worker is a POST endpoint, not a
  GET-only hosting cron. No provider calls run inside DB transactions. Host timeout
  can leave dispatch uncertain; operator reconciliation remains deliberate.

## Verification

- Latest: 159 unit regressions, 28 Playwright route/browser checks across
  320/390/768/1440px, local PostgreSQL RLS checks, lint, TypeScript, production build
  and whitespace checks passed. Earlier Prisma validation remains unchanged.
- New checks cover source authorization, path validation, short-lived no-store
  signing, failure handling and static error/poster rendering. Browser tests cover
  public/auth compatibility and anonymous guards, not authenticated media playback.
- New tests cover bearer-secret gates, exact proxy exception, default-disabled DB
  isolation, bounded scheduling, stale claims, missed callbacks, asset binding,
  partial failure, and webhook/poller races using mocks. They do NOT prove live SQL
  concurrency, deployed scheduling, Mux ingestion or actual HLS playback.
- Browser tests require escalation for Chrome/localhost access; build requires
  network for the configured Geist font. Sandbox failures were environmental,
  and approved reruns passed. Existing dev server on localhost:3000 was reused.
- Supabase Storage info() uses camel-cased contentType. Mux SDK 15 unwrap() is async;
  await it. Signed-only output requires a video track and duration 0 < n <= 125.

## Current State

- User reports Mux CLI connection now works. Presence-only local check confirms all
  five Mux credentials present, but MUX_ENABLED=false. Gemini key remains missing.
  The exposed CLI webhook secret should have been replaced; rotation not verified.
- No remote database writes, assets, credentials or feature flags changed this pass.
  The user was asked asynchronously whether separate staging migrations are verified;
  no answer was received before the implementation checks finished.
- Pending migrations remain unverified here:
  `20260924130000_harden_profile_access`, `20260924150000_add_mux_media_pipeline`,
  `20260924170000_private_listing_media` (local SQL/RLS verified only).
  Do not assume they were applied based on the user's CLI setup confirmation.
- One private-bucket migration and no dependency were added. Existing worktree is heavily dirty with
  earlier auth/media work and unrelated user changes. Do not revert or auto-commit.
- Website preview: http://localhost:3000. Do not run a second Next dev process in
  the same working directory or stop the user's existing server unnecessarily.

## Next Session Starts With

1. Confirm separate Supabase staging configuration and migration verification.
   Follow `context/media-staging.md` before enabling Mux or its worker. Read-only
   `scripts/audit-database.ts` exists; do not run db push against shared databases.
2. Follow `private-media-plan.md` for staged bucket cutover. Code is ready but the
   currently public Storage originals are NOT protected by signed Mux playback.
   Existing submitted listings need an approved backfill before enabling Mux.
3. Deploy/test the worker schedule in staging. Verify actual callbacks/playback,
   missed-event recovery, current KYC gating and races. Investigate unknown assets
   by passthrough; never blindly reset uncertain/submitting jobs to queued.
4. Add committed-object deletion protection and durable orphan cleanup; current
   owner DELETE policies still permit deleting referenced files. Finish camera/GPS
   device acceptance. Browser GPS is
   spoofable evidence, not hardware attestation. Preserve coordinate privacy.
5. Continue document review and payment milestones only after inventory acceptance;
   check current Gemini/provider APIs and obtain sandbox credentials locally.

## Open Risks

- Private profile-table grants still require the security migration and staging audit.
- Didit concurrency, revocation, real provider fixtures and SMTP/OAuth acceptance.
- Mux ready assets do not auto-publish listings or satisfy document/payment checks.
- Owner financial/lease cards remain mock; bookings, payments, messaging and admin
  are incomplete. Do not present the website as production-complete.
