# Memory — Didit KYC/KYB Onboarding

Last updated: 2026-06-23 — Prisma type regeneration & TS strictness

## What was built

Across recent sessions the Didit KYC/KYB onboarding backend was put in place; this latest session resolved TypeScript and Prisma type validation issues that were breaking the app.

- `prisma/schema.prisma` — `User` model with `username`, `kyc_verified`, `account_type`, `verification_status`, `verification_kind`, `didit_session_id`, `didit_workflow_id`, `didit_decision (Json)`, `verifiedDocument`; plus a `WebhookLog` model (dedup by `event_id`).
- `prisma/migrations/*` — RLS hardened on app tables, migration history baselined and tracked.
- `app/api/webhooks/didit/route.ts` — Didit webhook handler that verifies `X-Signature-V2`, dedupes events, updates Postgres and syncs Supabase `app_metadata`.
- `app/onboarding/actions.ts` — Server actions for KYC/KYB routing and Didit session creation.
- `app/onboarding/OnboardingForm.tsx` — Fixed TS error regarding `SetStateAction<string | null>` by adding `?? null` fallback to `setError`.

## Decisions made

- The project is now on the **Prisma migrations workflow, NOT `db push`**. Use `prisma migrate dev` / `prisma migrate deploy` going forward.
- **Node module resolution for Prisma:** Prisma CLI hits a Node 22 ESM issue — all `prisma` commands (including `prisma generate`) MUST be prefixed with `NODE_OPTIONS=--experimental-require-module`.
- `app_metadata` (not `user_metadata`) is the trusted source for routing/authorization decisions.
- `User` and `WebhookLog` are accessed ONLY via Prisma's direct Postgres connection (`postgres` role bypasses RLS); they are never exposed through the Supabase Data API. RLS is on with no policies + revoked public grants.
- Semantic Tailwind tokens are mandatory for auth/onboarding surfaces; no raw provider color classes.

## Problems solved

- **Prisma Client Validation Error:** `app/onboarding/actions.ts` was throwing "Unknown argument verification_kind" at runtime because the Prisma Client binary was stale. Fixed by running `pnpm prisma generate` and restarting `pnpm dev`.
- **TypeScript Strictness:** `pnpm tsc --noEmit` is now passing 100% clean after generating Prisma and fixing a `string | undefined` type error in `OnboardingForm.tsx`.
- **Migration history drift:** Fixed in the prior session by baselining (`prisma migrate resolve`).
- **Security hole:** Fixed in the prior session by enforcing strict RLS on `User` and `WebhookLog`.

## Current state

- Database schema is fully synced. Migration history is clean. Prisma generated client matches the database.
- Backend for Didit verification + webhook handling is in place; `lib/db.ts` adapter works.
- **Partial:** `app/onboarding/OnboardingForm.tsx` expects initial state, but `app/onboarding/page.tsx` has not been updated to load and pass it in.
- **Broken:** `pnpm lint` fails due to the onboarding refactor leftovers and pre-existing `<a href="/">` issues in `app/page.tsx` (unrelated to the core TS types which are now passing).
- `.env` has placeholders still EMPTY and needing real values: `SUPABASE_SERVICE_ROLE_KEY`, `DIDIT_KYC_WORKFLOW_ID`, `DIDIT_KYB_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`. `DIDIT_API_KEY` and the encoded DB URLs are set. `.env` is gitignored.

## Next session starts with

1. Wire `app/onboarding/page.tsx` to load onboarding state from Prisma and pass it into `OnboardingForm`.
2. Fix the remaining lint errors in `app/page.tsx` and any onboarding leftovers; re-run `pnpm lint` then `pnpm build`.
3. Paste real values into the four empty `.env` placeholders and restart the dev server.
4. Finalize the Didit workflows in the Didit console and retrieve the IDs.

## Open questions

- Final `DIDIT_KYC_WORKFLOW_ID` / `DIDIT_KYB_WORKFLOW_ID` values from the Didit console?
- Is custom SMTP available for production Supabase email confirmation?
- Fix the legacy `app/page.tsx` homepage lint issues now, or defer to a cleanup pass?
