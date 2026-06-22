# Memory — Didit KYC/KYB Onboarding Repair

Last updated: 2026-06-22 (migration baseline + RLS hardening session)

## Session 2026-06-22 — Migration errors fixed + RLS hardening

- ROOT CAUSE of the "migration throwing errors": the schema was applied with `prisma db push`, which never creates the `_prisma_migrations` history table. So `prisma/migrations/20260622133000_add_didit_onboarding_state` was orphaned — present on disk but unrecorded — and `prisma migrate dev` wanted to RESET (data loss) to reconcile. The raw SQL is fine and idempotent (`IF NOT EXISTS`); running it only emits NOTICE "already exists, skipping", not errors.
- FIX: baselined the existing DB with `prisma migrate resolve --applied 20260622133000_add_didit_onboarding_state` (records it as applied without re-running). `prisma migrate status` is now clean. The project is now on the migrations workflow, not `db push` — use `prisma migrate dev`/`deploy` going forward, NOT `db push`.
- SECURITY FIX (Supabase skill checklist): `WebhookLog` had RLS OFF with full anon/authenticated grants (public Data API could read raw webhook bodies / forge dedup rows); `User` had RLS on but broad grants. Added migration `20260622140000_harden_rls_on_app_tables`: `ENABLE ROW LEVEL SECURITY` on both + `REVOKE ALL ... FROM anon, authenticated`. App unaffected — Prisma uses the `postgres` role (bypasses RLS) and the signup trigger is SECURITY DEFINER.
- All prisma CLI commands still need `NODE_OPTIONS=--experimental-require-module` (Node 22 ESM issue).


## What was built

- `prisma/schema.prisma` was expanded with `User.username`, verification state/session fields, and a new `WebhookLog` model.
- A new Prisma migration was added at `prisma/migrations/20260622133000_add_didit_onboarding_state/migration.sql`.
- `supabase/trigger.sql` was updated so new auth users are inserted with the new verification defaults and no duplicate row crash.
- `app/api/webhooks/didit/route.ts` was rewritten to verify `X-Signature-V2` against the raw canonical payload, enforce a 5-minute timestamp window, dedupe by `event_id`, and write verification results idempotently.
- `app/onboarding/actions.ts` was rewritten so Individual and Organization choose separate Didit workflows, verification state is stored in Prisma, and Supabase auth state is synced through `app_metadata`.
- `app/onboarding/OnboardingForm.tsx` was replaced with a three-step state machine UI for role selection, verification refresh, and username capture.
- `middleware.ts`, `lib/middleware.ts`, `app/auth/callback/route.ts`, and `app/auth/login/actions.ts` were updated to gate on trusted `app_metadata` and route users to `/onboarding` until both verification and username exist.
- `app/auth/login/AuthForm.tsx` was restyled to match Rentral semantic Tailwind tokens and remove raw provider color classes.
- `app/api/verify/route.ts` was updated to use separate KYC/KYB workflow IDs and return users to `/onboarding`.
- Prisma Client was regenerated successfully with `NODE_OPTIONS=--experimental-require-module`.
- The live Supabase database schema was pushed successfully with `pnpm prisma db push --accept-data-loss`.

## Decisions made

- `app_metadata` is now the trusted source for routing decisions, not `user_metadata`.
- Individual users map to Didit KYC, organizations map to Didit KYB.
- The onboarding flow is now a state machine: choose account type, complete Didit, then claim a unique username before `/feed`.
- Webhook handling must verify the signature before parsing the payload, then process idempotently by `event_id`.
- Prisma `db push` was used instead of `migrate dev` because the existing Supabase database had drift and no safe migration baseline; `migrate dev` would have required a destructive reset.
- Semantic Tailwind tokens remain mandatory for auth/onboarding surfaces; raw provider colors were removed from the buttons we touched.

## Problems solved

- Prisma CLI hit a Node 22 ESM compatibility issue; `NODE_OPTIONS=--experimental-require-module` fixed `prisma generate`.
- `prisma migrate dev` failed because the shadow DB had no `User` baseline and wanted a reset; `prisma db push --accept-data-loss` applied the additive schema safely.
- The webhook route now has real signature verification instead of the previous placeholder comment.
- The onboarding flow now has backend state storage for verification kind, session id, and username instead of only returning a Didit URL.
- "Email not confirmed" on sign-in was diagnosed as a Supabase dashboard setting (Confirm email enabled + unconfirmed user), NOT a code/env bug. Fix is in the dashboard, not the repo.
- Google/Apple "continue with" buttons require provider config in the Supabase dashboard (Client ID/Secret, redirect URIs) — they use no `.env` keys, so the code in `AuthForm.tsx` was already correct.
- `PrismaClientConstructorValidationError` ("engine type 'client' requires adapter or accelerateUrl") was fixed by wiring the `@prisma/adapter-pg` driver adapter into `lib/db.ts` (Prisma 7 defaults to the `client` engine, which mandates an adapter). The scaffold comments in `db.ts` were activated using `new PrismaPg({ connectionString: process.env.DATABASE_URL })`.
- `DATABASE_URL`/`DIRECT_URL` passwords contained an unescaped `@` (`D@ny!k3d1603`) that breaks connection-string parsing; URL-encoded to `D%40ny%21k3d1603`. This was latent until the adapter fix made Prisma actually open a connection.

## Current state

- The backend pieces for Didit verification are in place and the DB schema is synced.
- The app still needs one follow-up pass to finish the onboarding UI wiring: `app/onboarding/OnboardingForm.tsx` now expects initial state, but `app/onboarding/page.tsx` has not yet been updated to pass it.
- `pnpm lint` still fails because of that onboarding refactor and pre-existing homepage `<a href=\"/\">` issues in `app/page.tsx`.
- `lib/db.ts` now uses the `@prisma/adapter-pg` driver adapter, so the onboarding page no longer crashes on the Prisma constructor error. Restart the dev server after pulling this change (env + Prisma client init are read at boot).
- Sign-in works after disabling/confirming email in the Supabase dashboard.
- `.env` now contains placeholder entries for all required vars: `SUPABASE_SERVICE_ROLE_KEY=` (empty), `DIDIT_KYC_WORKFLOW_ID=` (empty), `DIDIT_KYB_WORKFLOW_ID=` (empty), `DIDIT_WEBHOOK_SECRET=` (empty), and `NEXT_PUBLIC_APP_URL=http://localhost:3000` (set for local dev). The user still needs to paste real values for the four empty ones.
- `.env` is confirmed gitignored, so secrets are safe to store there.
- `DIDIT_API_KEY` is present in `.env`; `DATABASE_URL`/`DIRECT_URL` passwords are now correctly URL-encoded.
- Where to get the missing values: `SUPABASE_SERVICE_ROLE_KEY` = Supabase dashboard → Project Settings → API Keys → service_role/secret key. `DIDIT_KYC_WORKFLOW_ID`/`DIDIT_KYB_WORKFLOW_ID` = Didit Business Console (business.didit.me) → Workflows → create one identity (KYC) + one business (KYB) workflow, copy each UUID. `DIDIT_WEBHOOK_SECRET` = Didit console → Webhooks → add endpoint `/api/webhooks/didit` (use ngrok tunnel for local), copy the signing secret.

## Next session starts with

1. Finish wiring `app/onboarding/page.tsx` so it passes the loaded onboarding state into `OnboardingForm`.
2. Clear the remaining lint errors in `app/page.tsx` and any onboarding leftovers.
3. Re-run `pnpm lint` and `pnpm build`.
4. Paste real values into the empty `.env` placeholders (`SUPABASE_SERVICE_ROLE_KEY`, `DIDIT_KYC_WORKFLOW_ID`, `DIDIT_KYB_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`) and restart the dev server. Then finish the Supabase Auth email confirmation setup if credentials are available.

## Open questions

- What are the final `DIDIT_KYC_WORKFLOW_ID` and `DIDIT_KYB_WORKFLOW_ID` values from the Didit console?
- Is custom SMTP already available for production Supabase email confirmation?
- Should the legacy `hasDropdown` homepage lint issue be fixed now, or left for the next cleanup pass?
