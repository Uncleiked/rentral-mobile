# Memory — Supabase Auth & Didit KYC Integration

Last updated: 2026-06-22T01:55:00+01:00

## What was built

- **Documentation Migration**: Replaced every "Smile ID" reference with "Didit" across 7 context files (`memory.md`, `architecture.md`, `build-plan.md`, `code-standards.md`, `library-docs.md`, `progress-tracker.md`, `project-overview.md`).
- **Environment Variables**: Added `DIDIT_API_KEY` and `DIDIT_WEBHOOK_SECRET` to `.env`.
- **Didit SDK Installed**: `@didit-protocol/sdk-web@0.2.1` via `pnpm add`.
- **Supabase Admin Client**: Created `lib/admin.ts` — uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for backend-only KYC status updates.
- **Verify Route**: Created `app/api/verify/route.ts` — authenticates the user, calls Didit `POST /v3/session/` with workflow `75f4f3af-4620-4a93-88c7-78f5f1382ac4`, returns session URL.
- **Webhook Route**: Created `app/api/webhooks/didit/route.ts` — validates `X-Signature-V2` HMAC-SHA256 with canonical JSON, checks timestamp freshness (≤300s), and on `Approved` updates both Prisma `User.kyc_verified` and Supabase `user_metadata.kyc_verified`.
- **Auth Callback**: Updated `app/auth/callback/route.ts` — routes new/unverified OAuth users to `/onboarding`, verified users to `/feed`.
- **Root Middleware**: Updated `middleware.ts` — added `/api/webhooks` and `/api/verify` to public route exclusions. Unverified users blocked from all routes except `/onboarding`. Verified users skip `/onboarding` → `/feed`.
- **Login Actions**: Updated `app/auth/login/actions.ts` — login checks KYC status and routes accordingly. Signup always routes to `/onboarding`.
- **Onboarding Form**: Completely refactored `app/onboarding/OnboardingForm.tsx` — removed NIN/BVN text input, now has role selector (Individual / Organization) + "Verify with Didit" button with loading spinner.
- **Onboarding Actions**: Refactored `app/onboarding/actions.ts` — `initiateVerification()` upserts Prisma user with role, calls Didit API directly (not via internal fetch), returns session URL. `refreshStatus()` checks Prisma for `kyc_verified`, syncs to Supabase JWT, and redirects to `/feed`.

## Decisions made

- **Didit over Smile ID**: Full pivot. All docs, architecture, and code now reference Didit.
- **Direct API call from server action**: `initiateVerification()` calls Didit directly instead of routing through `/api/verify`. Avoids cookie forwarding complexity.
- **Redirect-based KYC flow**: User is redirected to Didit's hosted verification page. No in-page modal.
- **Admin Client pattern**: `lib/admin.ts` is the only file that uses `SUPABASE_SERVICE_ROLE_KEY`. Must never be imported client-side.
- **HMAC webhook validation**: `app/api/webhooks/didit/route.ts` does canonical JSON (shortenFloats + sortKeys) before HMAC comparison.
- **Upsert for user creation**: The onboarding action uses `prisma.user.upsert` to handle both first-time and returning users gracefully.
- **Middleware is the auth guardian**: Root `middleware.ts` handles all route protection. KYC status checked via `user_metadata.kyc_verified`.

## Problems solved

- **Next.js redirect() in try/catch**: Fixed in prior session — redirect throws internally, must be called outside the catch block.
- **Prisma connection exhaustion**: Solved with global singleton in `lib/db.ts`.
- **Cookie forwarding in server actions**: Avoided by calling Didit API directly from server action instead of through internal API route.

## Current state

- **Working**: Supabase Auth (Email/Password, Google, Apple buttons wired). Prisma schema synced. Middleware routes unverified → onboarding, verified → feed. All Didit API routes created. TypeScript compiles (only pre-existing `hasDropdown` errors in `page.tsx`).
- **Pending manual steps**:
  1. `SUPABASE_SERVICE_ROLE_KEY` not yet added to `.env` — needed for `lib/admin.ts` (webhook).
  2. `supabase/trigger.sql` has never been executed in the Supabase Dashboard SQL Editor.
  3. Google and Apple OAuth providers need to be configured in Supabase Dashboard.
  4. Didit webhook endpoint needs to be created in the Didit Business Console, and `DIDIT_WEBHOOK_SECRET` needs to be set.

## Next session starts with

1. Get `SUPABASE_SERVICE_ROLE_KEY` from Supabase Dashboard → Settings → API and add it to `.env`.
2. Execute `supabase/trigger.sql` in the Supabase SQL Editor.
3. Create webhook in Didit Business Console pointing to `https://your-domain/api/webhooks/didit`, copy the signing secret to `DIDIT_WEBHOOK_SECRET`.
4. Test the full flow: Sign up → Onboarding → Didit → Webhook → /feed.

## Open questions

- Does the user have `SUPABASE_SERVICE_ROLE_KEY` ready to paste? Required for the webhook to update auth metadata.
- Have Apple/Google OAuth providers been configured in the Supabase project dashboard?
- The `hasDropdown` TypeScript error in `app/page.tsx` is pre-existing — should it be fixed?
