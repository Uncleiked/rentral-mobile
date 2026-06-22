# Memory — Didit KYC/KYB Onboarding

Last updated: 2026-06-22 — migration baseline + RLS hardening session

## What was built

Across recent sessions the Didit KYC/KYB onboarding backend was put in place; this latest session fixed the database migration tooling and hardened security.

- `prisma/schema.prisma` — `User` model with `username`, `kyc_verified`, `account_type`, `verification_status`, `verification_kind`, `didit_session_id`, `didit_workflow_id`, `didit_decision (Json)`, `verifiedDocument`; plus a `WebhookLog` model (dedup by `event_id`).
- `prisma/migrations/20260622133000_add_didit_onboarding_state/` — initial onboarding schema (hand-written, idempotent `IF NOT EXISTS`).
- `prisma/migrations/20260622140000_harden_rls_on_app_tables/` — NEW this session: enables RLS on `User` and `WebhookLog` and revokes `anon`/`authenticated` grants.
- `supabase/trigger.sql` — `handle_new_user()` (SECURITY DEFINER) inserts a `User` row on auth signup with verification defaults; `on conflict do nothing`.
- `app/api/webhooks/didit/route.ts` — verifies `X-Signature-V2` over the raw payload, enforces a 5-min timestamp window, dedupes by `event_id`, writes results idempotently.
- `app/onboarding/actions.ts` — Individual→KYC and Organization→KYB use separate Didit workflows; verification state stored in Prisma; Supabase auth synced via `app_metadata`.
- `app/onboarding/OnboardingForm.tsx` — three-step state machine (role → Didit verify → username capture).
- `middleware.ts`, `lib/middleware.ts`, `app/auth/callback/route.ts`, `app/auth/login/actions.ts` — gate on trusted `app_metadata`, route to `/onboarding` until both verification and username exist.
- `lib/db.ts` — Prisma 7 client wired with the `@prisma/adapter-pg` driver adapter.

## Decisions made

- The project is now on the **Prisma migrations workflow, NOT `db push`**. Use `prisma migrate dev` / `prisma migrate deploy` going forward. Do not run `db push` again — it caused the drift this session fixed.
- `app_metadata` (not `user_metadata`) is the trusted source for routing/authorization decisions.
- Individual users → Didit KYC; organizations → Didit KYB.
- `User` and `WebhookLog` are accessed ONLY via Prisma's direct Postgres connection (the `postgres` role bypasses RLS); they are never exposed through the Supabase Data API. Hence RLS-on with no policies + revoked public grants = locked down, app unaffected.
- Onboarding is a state machine: choose account type → complete Didit → claim unique username → `/feed`.
- Semantic Tailwind tokens are mandatory for auth/onboarding surfaces; no raw provider color classes.

## Problems solved

- **Migration "throwing errors" (this session's main fix):** schema had been applied with `prisma db push`, which never creates the `_prisma_migrations` table (confirmed absent). The migration was orphaned, so `prisma migrate dev` wanted to RESET the DB. Fixed by baselining: `prisma migrate resolve --applied 20260622133000_add_didit_onboarding_state`. `prisma migrate status` now reports "Database schema is up to date!" The raw SQL itself was always fine — re-running only emits `NOTICE ... already exists, skipping`.
- **Security hole (this session):** `WebhookLog` had RLS OFF with full `anon`/`authenticated` grants — the public anon key (shipped in `NEXT_PUBLIC_*`) could read raw webhook bodies and forge/delete dedup rows via the Data API. Fixed by migration `20260622140000_harden_rls_on_app_tables`. Verified: RLS on for both tables, zero anon/authenticated grants remain.
- Prisma CLI hits a Node 22 ESM issue — all `prisma` commands need `NODE_OPTIONS=--experimental-require-module`.
- `PrismaClientConstructorValidationError` (Prisma 7 `client` engine requires an adapter) — fixed by wiring `@prisma/adapter-pg` in `lib/db.ts`.
- `DATABASE_URL`/`DIRECT_URL` passwords had an unescaped `@`/`!` — URL-encoded (`D%40ny%21k3d1603`).
- "Email not confirmed" sign-in error = Supabase dashboard setting, not a code bug. Google/Apple buttons need provider config in the dashboard (no `.env` keys).

## Current state

- Database schema is synced AND migration history is now clean and tracked (2 migrations, both applied). RLS is enabled and public grants revoked on `User` and `WebhookLog`.
- Backend for Didit verification + webhook handling is in place; `lib/db.ts` adapter works.
- **Partial:** `app/onboarding/OnboardingForm.tsx` expects initial state, but `app/onboarding/page.tsx` has not been updated to load and pass it in.
- **Broken:** `pnpm lint` fails due to the onboarding refactor leftovers and pre-existing `<a href="/">` issues in `app/page.tsx`.
- `.env` has placeholders still EMPTY and needing real values: `SUPABASE_SERVICE_ROLE_KEY`, `DIDIT_KYC_WORKFLOW_ID`, `DIDIT_KYB_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`. `DIDIT_API_KEY` and the encoded DB URLs are set. `.env` is gitignored.

## Next session starts with

1. Wire `app/onboarding/page.tsx` to load onboarding state from Prisma and pass it into `OnboardingForm`.
2. Fix the remaining lint errors in `app/page.tsx` and any onboarding leftovers; re-run `pnpm lint` then `pnpm build`.
3. Paste real values into the four empty `.env` placeholders and restart the dev server.
4. For future schema changes use `prisma migrate dev` (NOT `db push`); prefix prisma commands with `NODE_OPTIONS=--experimental-require-module`.

## Open questions

- Final `DIDIT_KYC_WORKFLOW_ID` / `DIDIT_KYB_WORKFLOW_ID` values from the Didit console?
- Is custom SMTP available for production Supabase email confirmation?
- Fix the legacy `app/page.tsx` homepage lint issues now, or defer to a cleanup pass?
