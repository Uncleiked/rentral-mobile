# Rentral implementation and release readiness

> **Historical readiness snapshot — not current release approval (2026-11-09).**
> The [approved completion blueprint](remaining-work-blueprint.md) and
> [current 31-area matrix](completion-status.md) supersede the scope/status below.
> Rentral now uses Expo Android/iOS, npm, local Next.js, MongoDB/JWT and private
> filesystem storage, with no personal KYC onboarding and Paystack only. Old
> pnpm/Supabase/PostGIS/Didit/OPay and hosted-migration instructions are archival.
> Earlier test totals and provider gaps describe that earlier checkout, not the
> latest changes. Consult [current progress](progress-tracker.md) for actual runs;
> final builds, device/provider acceptance and release approval remain separate.
> Preserve the original PostgreSQL data; follow [current setup](environment-setup.md).

## Historical evidence begins here

Date: 2026-11-07 (Africa/Lagos).

## Implemented in this checkout

- Next.js 16/React 19 modular monolith retained, TypeScript strict mode, pnpm pinned.
- Cinematic photographic homepage with GSAP/ScrollTrigger, responsive navigation,
  working category/location search and reduced-motion support.
- Advanced discovery: category, intent, neighborhood, budget, state, studios/beds,
  baths/kitchens, transmission/seats and vessel capacity/captain filters; stable
  cursors; grid and walkthrough presentations; private-media detail pages.
- Persisted saved listings; truthful owner/visitor profiles, reviews and dashboards.
  Fabricated wallet/lease/social data removed from active UI.
- Media Vault backed by owner-scoped saved drafts. Separate recordings are preserved
  at the same location; grouping uses broad area and saved date without returning GPS.
- Backward-compatible JSON metadata, asset descriptions, host capacity, property
  structure, vehicle/boat safety and itemized optional fee fields. Video maximum 120s.
- Booking requests, participant scopes, host acceptance, precise price snapshots,
  availability exclusion and GPS/code inspection check-in.
- Signed Paystack collection, server reconciliation, strict customer/amount/currency
  binding, duplicate-event protection and deferred balanced append-only ledger.
- Paid holds block competing activity; flexible holding days, visible deadlines and
  one-time hold-to-rental credit with exact remaining balance and immutable allocation.
  Provider refund/payout execution and default compensation remain unavailable.
- Durable private messages, listing attachments, retries/read receipts and optional
  membership-scoped Supabase Realtime. Versioned cookie/bearer API shares services.
- Booking-linked reviews/reports, staff decisions and immutable admin audit. Reviews
  are evidence from completed bookings, not an automatic consumer-credit rating.
- Staff-reviewed safety notices, affected-member appeals and independent decisions;
  fixed public caution text, private evidence and immutable decision history.
- Private document access, configurable Gemini screening signals, human approval,
  Geoapify/PostGIS address matching and atomic publication prerequisite checks.
- Notifications, renewal recipient-route/reference submissions, lifecycle expiry,
  month-11 in-app/email reminders and 90-day search analytics pruning. External
  references stay pending; arbitrary bank transfers are never automatically verified.
- Consent-based native search telemetry with monthly HMAC identifiers, coarse
  preferences, deduplication, withdrawal/deletion and minimum ten-person cohorts.
- Didit signed-envelope freshness, current-session binding, event ordering and
  metadata reconciliation hardening behind an explicit migration gate.
- Local-only configuration checks, verified project CA support and a read-only
  schema/history audit. Separate-staging tools remain optional archival support.

## Verification evidence

The final session handoff in `memory.md` records exact final command results.
Checks include unit regressions, strict TypeScript, ESLint, Prisma validation,
production build, responsive public/auth/browser guards at 320/390/768/1440px,
and isolated PostgreSQL migration replay, real concurrent booking/receipt tests,
RLS/Realtime isolation, referenced-upload protection and ledger constraints.

Browser coverage does not establish authenticated provider workflows. Mocked unit
tests do not establish provider acceptance. The isolated SQL suite never reads app
environment files or contacts hosted Supabase.

## Required external acceptance

1. Current user preference is `.env.local`, with staging cancelled. Its Supabase
   APIs and both PostgreSQL connections pass read-only checks. Eight migrations
   match; twelve source updates remain unapplied. After automatic review rejected
   that mutation, the user explicitly chose **Keep the hosted database unchanged**.
   Do not apply or re-request the update; keep feature gates off and use isolated
   local fixtures for database tests. See `local-development.md`. Hosted upgrades
   and private bucket/API acceptance remain release limitations.
2. Set up separate Didit test workflows, OAuth/SMTP and real approval/decline/
   revocation fixtures. Enable `DIDIT_ORDERING_ENABLED` only after its migration.
3. Configure Mux and verify actual ingest, signed playback, failure recovery and
   camera/GPS behavior on physical phones. Original device evidence is spoofable;
   the platform must never claim unspoofable hardware or guaranteed fraud elimination.
4. Verify Paystack test checkout/webhooks/reconciliation and the merchant custody
   arrangement before enabling payments. A collection API is not by itself escrow.
5. Configure Gemini/Geoapify and evaluate synthetic documents/addresses, error paths
   and human decisions. AI output never proves legal ownership or authenticity.
6. Configure private Realtime, lifecycle/media schedules, optional email and alerts.
   Reconcile stale sending/uncertain outcomes before retries; no blind financial retry.
7. Complete dedicated authenticated journey, accessibility/device, backup-restore,
   load and monitoring checks; finalize operating/privacy/transaction agreements.

## Still requires implementation

- OPay adapter: needs the approved merchant product's collection/virtual-account,
  callback, refund and transfer contracts. No invented endpoint or OPay enable flag.
- Actual provider-backed refunds, bank recipient onboarding, payout reconciliation
  and the 70/30 default settlement pipeline.
  Existing states explicitly remain unpaid/unsettled/requires-review as appropriate.
- Operational evidence-retention rules and auditable reputation ranking. Safety
  notices/appeals are implemented; reports never automatically prove wrongdoing.
- Sponsored-ad billing/ranking and enterprise Insights subscription/entitlement
  management. Current Insights uses server-owned approved-account access.
- Richer cohort conversion/price-elasticity models once sufficient consented evidence
  exists. Current search cohorts are observational, not predictive guarantees.
- Squat-Mates AI is a visible future feature, as explicitly requested. No invented
  matches, financial-risk predictions or lending promises.
- Production deployment and live acceptance. No release is declared complete.

Keep feature gates disabled until the corresponding checks pass. Do not use
`db push`, reset shared databases, or infer provider acceptance from credentials
being present. Hosted migrations were explicitly declined; leave that database
unchanged and do not ask again for the same approval.
