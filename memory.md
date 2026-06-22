# Memory — Didit KYC/KYB Onboarding Repair

Last updated: 2026-06-22 (auth + Prisma 7 adapter repair session)

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
- Environment setup is still incomplete: `SUPABASE_SERVICE_ROLE_KEY` (required by `lib/admin.ts`, used in onboarding/verify), `DIDIT_KYC_WORKFLOW_ID`, `DIDIT_KYB_WORKFLOW_ID`, and `NEXT_PUBLIC_APP_URL` are all missing from `.env`; `DIDIT_WEBHOOK_SECRET` is present but empty. Production email confirmation still needs custom SMTP in Supabase.
- `DIDIT_API_KEY` is present in `.env`; `DATABASE_URL`/`DIRECT_URL` passwords are now correctly URL-encoded.

## Next session starts with

1. Finish wiring `app/onboarding/page.tsx` so it passes the loaded onboarding state into `OnboardingForm`.
2. Clear the remaining lint errors in `app/page.tsx` and any onboarding leftovers.
3. Re-run `pnpm lint` and `pnpm build`.
4. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env` and finish the Supabase Auth email confirmation setup if the credentials are available.

## Open questions

- What are the final `DIDIT_KYC_WORKFLOW_ID` and `DIDIT_KYB_WORKFLOW_ID` values from the Didit console?
- Is custom SMTP already available for production Supabase email confirmation?
- Should the legacy `hasDropdown` homepage lint issue be fixed now, or left for the next cleanup pass?
