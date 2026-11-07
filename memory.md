# Memory — Rentral responsive platform implementation

Last updated: 2026-11-07 (Africa/Lagos).

## What was built

- Replaced the landing page with local photography, Inter, cinematic scoped GSAP/ScrollTrigger motion, responsive category/location search and reduced-motion handling.
- Added the shared top/mobile marketplace shell; URL-driven advanced search, stable cursors, grid/walkthrough views, details, saved listings and truthful profiles/dashboard.
- Added owner-scoped Media Vault drafts and backward-compatible metadata: studios, beds/baths/kitchens, state, intents, host capacity, structural/vehicle/marine safety and exact optional fee inputs.
- Added booking models/UI/services, price snapshots, participant authorization, GPS+OTP dual check-in, flexible1–7day holds, global hold guards and visible hold deadlines.
- Added guarded Paystack collection/reconciliation, listing-fee checkout, signed callbacks, exact binding and append-only balanced ledger. No fabricated custody/refund/payout success.
- Added durable participant-only messages, listing attachments, rate/idempotency controls, read receipts, optional private Realtime and /api/v1 cookie/bearer routes sharing domain services.
- Added completed-booking reviews/reports, notification/renewal views, human/AI document queues, Geoapify/PostGIS matching, publication gates and immutable staff audit.
- Added consented native coarse search analytics, monthly HMAC subjects, ten-person cohorts, deletion controls, and lifecycle expiry/reminder/email/90-day retention worker.
- Hardened Didit signed-envelope freshness/order/revocation and bounded metadata reconciliation. New receiver is deliberately503 until DIDIT_ORDERING_ENABLED=true after migration.
- Added staging guide/template, guarded pnpm staging launcher, isolated PostgreSQL harness, environment-template recovery helper and credential-free template regression.

## Decisions made

- Preserve Next16/React19 modular monolith, Prisma/Supabase/PostGIS, existing Supabase Auth/Didit, strict TypeScript and pnpm10.28.2. Do not replace them with older Clerk/SmileID/Stripe sketches.
- Latest Gemini history: universal account, pay-per-post, OPay/Paystack, mobile capture+desktop continuation, first-party Insights; AI Squat-Mates visible but explicitly later.
- New domains gated by RENTRAL_PLATFORM_ENABLED. No shared database migration or provider activation was performed. Current environment flags remain untouched.
- Camera/GPS are user-controlled evidence; AI is a review signal. No guarantees of ownership, unspoofable hardware, fraud elimination or consumer credit.
- Posted address changes return to review; confirmed bookings prevent relocation. Paid hold expiry marks settlement requires_review and notifies participants from worker and opportunistic paths.
- Keep financial/identity private data off public responses. New native analytics is optional, coarse and cohort-limited; optional historical PostHog retained disabled in staging.

## Problems solved

- Installed locked dependencies and pinned GSAP3.14.2. Prisma now loads .env.local or explicitly RENTRAL_ENV_FILE; TS targetES2020 and allowJsfalse.
- Added migrations120000domains,123000integrity,130000privacy/spatial/Realtime,140000price snapshots,143000disputed availability,160000Didit ordering (all dated20261107). Earlier pending migrations also remain unapplied remotely.
- Real SQL checks caught/covered disputed inventory release, concurrent reservation exclusion and duplicate settlement, committed object deletion/move and permissive-policy leakage.
- pnpm/Corepack broad lint sometimes stalled; direct installed CLI diagnosed tooling, subsequent complete pnpm lint/typecheck passed. No architectural workaround introduced.
- Existing user dev server is localhost3001, PID17148 when observed. Reused it; failed3100 launch was not kept. Production build used RENTRAL_BUILD_DIR=.next-verify so preview was preserved.
- User began putting credentials in .env.staging.example. Preserved entries in ignored .env.staging and sanitized example. Told user to edit only .env.staging and replace the exposed server key. Never repeat key values. DIRECT_URL had an application HTTP URL and still needs an actual PostgreSQL connection. Do not inspect/print secret file contents.

## Final verification

- pnpm test: 293 tests passed across30 files.
- pnpm lint: passed.
- pnpm typecheck: passed (next typegen + strict tsc).
- Prisma validate/generate: passed.
- Production build: passed, separate .next-verify output.
- Playwright:56 checks passed across320/390/768/1440px, public/auth/guidance, reduced motion, search/menu, private-route and JSON/worker guards. Mobile+desktop homepage screenshots inspected.
- Isolated Docker PostgreSQL/PostGIS:17 migrations replayed; RLS/private Realtime, referenced uploads, exact receipt uniqueness, disputed/overlap availability, actual concurrent reservations and duplicate settlements, balanced/append-only ledger and Insights cohort threshold passed.
- Unit mocks/browser guards do not prove live providers or authenticated device journeys. No remote SQL/provider payment was executed.

## Current state

- Source saved; no commit/push made. User is actively configuring ignored staging values. Do not stage secret files or overwrite that work.
- Complete setup: context/staging-setup.md and .env.staging.example. Command wrapper: pnpm staging prisma migrate status/deploy/validate/generate/diff; pnpm staging dev --port3101.
- Current release status and exact incomplete work: context/release-readiness.md. Main technical reviews: context/security-review.md, identity-review.md, reservations-implementation.md, discovery-implementation.md, vault-implementation.md, homepage-implementation.md, mobile-api.md.
- Local task-owned Docker container rentral-platform-test has no published ports and label rentral.task=platform-verification. pnpm test:database resets only its marker-protected fixture, never app env/DB.

## Next session starts with

1. User completes .env.staging (including real Postgres URLs, publishable key and rotated server key). Do not copy values into chat or source. Use guarded staging launcher to verify the separate target.
2. Apply/test all migrations in staging only; verify hosted Storage/RLS and existing-data cutover, then staged identity/media/provider acceptance per guide. Enable individual gates only after acceptance.
3. Obtain OPay approved merchant contracts. OPay adapter, bank-recipient onboarding, real refunds/payout reconciliation, hold-credit allocation and70/30 compensation execution still require implementation.
4. Complete authenticated provider/device/accessibility/load/backup/monitoring acceptance and deployment. Finalize operating/privacy agreements.
5. Remaining product work: safety-notice/appeal policy, reputation ranking, sponsored ads/enterprise billing, richer evidence-based Insights models. Squat-Mates AI stays later.

## Open questions

- Staging keys/connections are not yet verified. No live sandbox identities, provider events, external schedules or approved custody arrangements were accepted.
- Financial collection alone is not escrow. Keep payments disabled until settlement/refund/hold-credit obligations are implemented and accepted.
- Arbitrary offline bank references cannot be validated by generic Paystack verification. Renewal submissions stay pending evidence review; never turn text into verified fact data or a credit score.
