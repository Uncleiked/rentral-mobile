# Rentral completion implementation

> **Historical implementation plan — superseded scope (2026-11-09).**
> Follow the user-approved [completion blueprint](remaining-work-blueprint.md),
> [current 31-area matrix](completion-status.md), and [environment guide](environment-setup.md).
> The active stack is Expo Android/iOS, npm, local Next.js, MongoDB/JWT and private
> local storage. Personal KYC/profile onboarding is removed; Paystack alone is
> approved. Supabase/PostGIS/OAuth/Didit initiation, OPay and migration/bypass
> assumptions below remain historical evidence and must not be reinstated.
> Source implementations and recorded fixtures do not imply final aggregate,
> physical-device, real-provider or production-release acceptance. See
> [the progress tracker](progress-tracker.md) for current command outcomes.

## Historical evidence begins here

Started: 2026-11-07 (Africa/Lagos).

The user authorizes completing the existing TypeScript platform, responsive
Instagram/Airbnb-inspired UI, cinematic jjettas-inspired motion, architecture
decisions and incremental progress saving. Keep Next.js 16's modular monolith,
Prisma/PostGIS and existing authentication/media authorization boundaries.

## Implementation sequence

1. Install locked dependencies and establish baseline checks.
2. Replace the homepage with photographic editorial sections, accessible search,
   local assets and scoped GSAP motion that respects reduced motion.
3. Unify top/mobile navigation; implement URL-driven discovery, grid/walkthrough
   views, detail pages, saved listings and truthful profile/dashboard data.
4. Add migration-backed reservations, integer-kobo payment intents, verified
   Paystack callbacks and a balanced ledger. Provider calls stay outside SQL
   transactions. Preserve unavailable states without configured providers.
5. Add participant-scoped messaging, listing shares, read receipts, notifications,
   booking-linked reviews/disputes, document review, admin audit and renewal review.
6. Verify lint, strict TypeScript, unit regressions, schema/build, responsive
   browser checks and isolated SQL constraints. Document external acceptance gaps.

## Authority and release boundaries

- `context/production-plan.md` supersedes older provider and architecture examples.
- No fabricated balances, reputation, escrow status or successful payment actions.
- The current `.env.local` has Supabase/Didit/database settings; Mux, Gemini,
  Paystack and worker credentials are absent. Secret values are never output.
- New schema-dependent features use `RENTRAL_PLATFORM_ENABLED`
  only after migrations are verified. Never run `db push` on the shared database.
- Gemini share URL currently loops redirects / is inaccessible. Repo documentation
  is the working product specification; a clarification is pending asynchronously.
- Provider acceptance, live identity/payment tests and device GPS/camera validation
  cannot be inferred from mocked tests or presence of credentials.

## Progress saving

Update `context/progress-tracker.md` and UI registries per completed slice. Save a
fresh `memory.md` with exact checks, remaining gaps and next actions before handoff.
