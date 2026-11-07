# Memory — Rentral local configuration and continuation

Last updated: 2026-11-07 (Africa/Lagos).

## Authority and current state

User cancelled staging. Use .env.local for development/tests; do not ask for staging setup again. The local app connects to HOSTED Supabase. Automatic approval review rejected applying twelve migrations, then the user explicitly answered KEEP THE HOSTED DATABASE UNCHANGED. Do not apply them, retry or ask again. NO hosted writes ran. Never reset shared data, expose secrets, enable financial/provider flags, commit or push without authorization. Use pnpm10.28.2 via Corepack.

## What was built

Latest task: user pasted a Vercel build log (commit82e806a). A fresh install lacked
the generated Prisma namespace, failing TypeScript. Changed build to prisma generate
&& next build, kept strict type checking, selected Node24.x matching local v24.22.1.
Prisma config omits optional datasource without DIRECT_URL so generation requires
no migration credentials. Builds never run migration/deploy commands. Clean-client
verification and the production build both passed; final results recorded below.

Broad existing implementation saved: GSAP homepage, responsive feed/grid/discovery/details/saves, real profiles/dashboard, owner Media Vault, category metadata/120s capture, booking/GPS+code inspections, signed Paystack collection and balanced ledger, private messages, mobile-ready API, reviews/disputes, document/admin queues, renewals, optional consented native Insights and lifecycle worker.

Added one-time paid hold-to-rental credit with immutable allocations, exact remainder, concurrency protection and settlement-review states for abandoned conversions. Added staff-reviewed safety notices, affected-user appeals even after KYC revocation, independent reviewer decisions and immutable audit/private evidence. Added compliance-docs restrictive ownership/private-bucket migration. Both feature notes and UI registries saved. All source migrations now total20 through 20261107190000.

Added pnpm check:local, setup:local:ca and audit:local. Supabase public CA saved in ignored certificates/supabase-ca.crt; SUPABASE_DB_CA_CERT_PATH added to ignored .env.local preserving existing credentials/settings. Verified TLS helper supports pg runtime and Prisma CLI. A pooler's upstream pg_stat_ssl differs from the client's verified TLS socket; corrected preflight's false failure. Filled shareable example backed up in ignored .env.staging.example.private-backup-* before restoring placeholders; active env files preserved. Memory encoding repaired to UTF-8.

## Decisions

Keep Next16/React19 modular monolith, strict TypeScript, Prisma/Supabase/PostGIS, Supabase Auth/Didit and pnpm; older Gemini Clerk/SmileID/Stripe sketches do not override current code. Squat-Mates AI stays later. No POS agents or loans. Camera/GPS/AI never guarantees ownership or fraud prevention. Offline bank references stay pending evidence review, not verified fact or credit scores. Collection API support alone does not establish escrow. No provider flags changed.

## Verification

Latest Vercel fix verification: pnpm build passed with fresh generation and strict
TypeScript; pnpm test passed357/36 and lint passed. Frozen-lockfile offline install
in a new credential-free TEMP directory succeeded. Confirmed no generated app
client beforehand; prisma generate then exported Prisma and User/Booking/SafetyNotice/
SafetyAppeal/HoldCreditAllocation. A TypeScript probe importing Prisma.UserSelect
and Prisma.HoldCreditAllocationSelect compiled successfully without DIRECT_URL or
DATABASE_URL. No cached client or database connection was used in that proof.
No Vercel deployment, commit or push was performed; user must publish the saved fix
and redeploy with Build Command pnpm build. Node major is selected as24.x.

- pnpm check:local --remote PASS: required config, matching project, both Auth/Storage keys and both PostgreSQL URLs with verified TLS.
- Read-only audit: eight completed source-matching migrations, twelve pending; no failed/unknown/changed/gapped history; correct extensions.PostGIS; zero malformed Didit JSON. Current grants/public-media/signup findings match pending hardening. Exact list in context/local-development.md. No hosted mutation ran.
- pnpm test:357 tests across36 files PASS, including CA and migration-audit regressions.
- pnpm lint and pnpm typecheck PASS after source/audit freeze.
- pnpm exec prisma validate PASS. Production build PASS against .env.local using RENTRAL_BUILD_DIR=.next-verify.
- Playwright:all56 PASS at320/390/768/1440px: public/auth/nav/reduced-motion/API/worker/private-route guards, including appeals. Desktop/phone screenshots inspected.
- Isolated Docker PostGIS:all20 migrations replayed, private Storage/RLS/Realtime, balanced append-only ledger, safety-appeal and hold-credit invariants PASS. Real rental, duplicate-payment and hold-credit races produced one winner/receipt/allocation with exact balance.
- Mocks/public browser checks/local SQL do not establish authenticated member/staff, provider, real phone, custody, refund or payout acceptance.

## Runtime and handoff

Our refreshed production preview runs at http://localhost:3100 with .env.local and .next-verify; unified exec session78644 replaces our old3439 preview. No user development server was stopped. Screenshots in ignored test-results/. Avoid printing raw server logs containing sensitive payloads. Task Docker rentral-platform-test remains running, exact label rentral.task=platform-verification, no published ports. pnpm test:database resets only its marker-protected fixture; never reads app env or contacts hosted Supabase. Coordinate one run at a time.

Source saved in working tree; no commit/push. Latest context/local-development.md, progress-tracker.md, release-readiness.md and both UI registries record current state. Feature notes: hold-credit-implementation.md and safety-appeals-implementation.md. Prior production-plan/architecture remains the baseline.

## Next session starts with

1. Keep hosted Supabase unchanged per the user's explicit refusal. Continue source and isolated fixture work. For Vercel, push the reviewed build fix when authorized and redeploy using pnpm build; no migrations are bundled into that command. Keep schema-dependent/provider gates off.
2. Provider work needs approved OPay merchant product API contracts, Paystack sandbox, Mux/Gemini/Geoapify settings and reachable callbacks. Keep individual gates disabled until acceptance.
3. Remaining implementation: bank recipients, actual refund/payout reconciliation, automatic holding-default70/30 settlement, auditable ranking, ads/paid Insights entitlements. Richer analytics needs enough consented evidence. No financing/guaranteed predictive claims.
4. Complete authenticated staff/member appeal journeys, real camera/GPS phones, provider/device/accessibility/load/backup/monitoring checks and deployment. Operating evidence-retention and merchant/custody arrangements remain required. No production release claimed.
