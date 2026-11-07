# Rentral implementation and release readiness

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
- Paid holds block competing activity; flexible holding days and visible reserved
  status. Holder credit conversion and default payout remain unavailable.
- Durable private messages, listing attachments, retries/read receipts and optional
  membership-scoped Supabase Realtime. Versioned cookie/bearer API shares services.
- Booking-linked reviews/reports, staff decisions and immutable admin audit. Reviews
  are evidence from completed bookings, not an automatic consumer-credit rating.
- Private document access, configurable Gemini screening signals, human approval,
  Geoapify/PostGIS address matching and atomic publication prerequisite checks.
- Notifications, renewal recipient-route/reference submissions, lifecycle expiry,
  month-11 in-app/email reminders and 90-day search analytics pruning. External
  references stay pending; arbitrary bank transfers are never automatically verified.
- Consent-based native search telemetry with monthly HMAC identifiers, coarse
  preferences, deduplication, withdrawal/deletion and minimum ten-person cohorts.
- Didit signed-envelope freshness, current-session binding, event ordering and
  metadata reconciliation hardening behind an explicit migration gate.
- Separate-staging launcher, blank credential template and step-by-step setup guide.

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

1. Create a separate Supabase staging project and follow `staging-setup.md`.
   Verify full replay and existing-data upgrades; inspect private bucket cutover.
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
- Actual provider-backed refunds, bank recipient onboarding, payout reconciliation,
  hold-to-rental credit allocation and the 70/30 default settlement pipeline.
  Existing states explicitly remain unpaid/unsettled/requires-review as appropriate.
- A complete appeal/safety-notice policy, evidence-retention rules and auditable
  reputation ranking. Reports are not automatically treated as proven wrongdoing.
- Sponsored-ad billing/ranking and enterprise Insights subscription/entitlement
  management. Current Insights uses server-owned approved-account access.
- Richer cohort conversion/price-elasticity models once sufficient consented evidence
  exists. Current search cohorts are observational, not predictive guarantees.
- Squat-Mates AI is a visible future feature, as explicitly requested. No invented
  matches, financial-risk predictions or lending promises.
- Production deployment and live acceptance. No release is declared complete.

Keep feature gates disabled until the corresponding checks pass. Do not use
`db push`, reset shared databases, or infer staging acceptance from credentials
being present. The user is currently following the external setup guide.
